use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use futures_util::StreamExt;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use sysinfo::{DiskExt, SystemExt};
use tauri::AppHandle;
use tokio::{io::AsyncWriteExt, process::Command};

use crate::{
    engine::resolve_launch_args,
    error::Error,
    fs::{untar_gz_file, unzip_file},
    progress::update_progress,
    AppState,
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MAIA_VERSION: &str = "0.1.0";
const MAIA_SOURCE_REVISION: &str = "1e13597c42d4858b7cfd7cfdae01e297263364b2";
const MAIA_MODEL_REVISION: &str = "b6559de2398d7140b985f28fd2c19fb5e47ddabe";
const MAIA_MODEL_SHA256: &str = "ba14208b2992d85502f5fb501934abf6aaaeb355e9f3fdf90e326911f562524f";
const MAIA_SOURCE_URL: &str = "https://github.com/CSSLab/maia3";
const MAIA_MODEL_URL: &str = "https://huggingface.co/UofTCSSLab/Maia3-5M";
const MAIA_LICENSE: &str = "AGPL-3.0";
const PYTHON_VERSION: &str = "3.11.16";
const UV_VERSION: &str = "0.12.10";
const UV_RELEASE_URL: &str = "https://github.com/astral-sh/uv/releases/download/0.12.10";
const MANIFEST_FILENAME: &str = "onyx-managed-maia3.json";
const INSTALLING_MARKER: &str = ".onyx-maia3-installing";
const CLEANUP_MARKER: &str = ".onyx-maia3-cleanup";
const CLEANUP_PREFIX: &str = ".maia3-cleanup-";
const FINAL_SIZE_MB: u32 = 660;
const REQUIRED_FREE_SPACE_MB: u32 = 1500;

/// Pinned for every system; NumPy and PyTorch are added per system by [`ManagedPlatform`].
const COMMON_REQUIREMENTS: &str = r#"maia3 @ https://github.com/CSSLab/maia3/archive/1e13597c42d4858b7cfd7cfdae01e297263364b2.zip
anyio==4.15.1
certifi==2026.7.22
chess==1.11.2
click==8.5.0
colorama==0.4.6
filelock==3.32.5
fsspec==2026.7.0
h11==0.16.0
hf-xet==1.6.0
httpcore==1.0.9
httpx==0.28.1
huggingface-hub==1.30.0
idna==3.19
jinja2==3.1.6
markupsafe==3.0.3
mpmath==1.3.0
networkx==3.6.1
packaging==26.3
python-chess==1.999
pyyaml==6.0.3
setuptools==84.0.0
sympy==1.14.0
tqdm==4.70.0
typing-extensions==4.16.0
"#;

/// The PyPI builds of PyTorch for Windows and Apple Silicon run on the CPU without extra
/// libraries. The macOS build needs macOS 14 or newer.
const TORCH_PYPI: &str = "numpy==2.4.6\ntorch==2.14.0\n";
/// The Linux build on PyPI pulls in several GB of CUDA libraries; PyTorch's own index has a
/// CPU-only build of the same version, pinned here by URL and hash.
const TORCH_LINUX_CPU: &str = "numpy==2.4.6\ntorch @ https://download.pytorch.org/whl/cpu/torch-2.14.0%2Bcpu-cp311-cp311-manylinux_2_28_x86_64.whl#sha256=673dbf5c9bbadfffab7a386b6dd7a0c219f1408a328b7b4e86d0ae551cdafa42\n";
/// PyTorch stopped publishing Intel Mac builds after 2.2.2, which was compiled against NumPy 1
/// and lacks `torch.nn.RMSNorm` (see [`TORCH_COMPAT_MODULE`]).
const TORCH_MACOS_INTEL: &str = "numpy==1.26.4\ntorch==2.2.2\n";
/// Apple Silicon's PyTorch build is tagged `macosx_14_0_arm64`.
const MACOS_ARM_MIN_MAJOR: u32 = 14;

/// Maia 3 imports `torch.nn.RMSNorm`, added in PyTorch 2.4. On Intel Macs, where 2.2.2 is the last
/// build, this module adds the same computation (`x * rsqrt(mean(x²) + eps) * weight`, with
/// `eps` defaulting to the dtype's epsilon as in PyTorch) before Maia loads. It is loaded by a
/// `.pth` file and does nothing when PyTorch already has `RMSNorm`.
const TORCH_COMPAT_MODULE: &str = r#"# Written by Onyx Chess Lab: torch.nn.RMSNorm for PyTorch < 2.4 (Intel Macs).
import torch
import torch.nn as nn

if not hasattr(nn, "RMSNorm"):

    class RMSNorm(nn.Module):
        def __init__(self, normalized_shape, eps=None, elementwise_affine=True, device=None, dtype=None):
            super().__init__()
            if isinstance(normalized_shape, int):
                normalized_shape = (normalized_shape,)
            self.normalized_shape = tuple(normalized_shape)
            self.eps = eps
            self.elementwise_affine = elementwise_affine
            if elementwise_affine:
                self.weight = nn.Parameter(torch.ones(self.normalized_shape, device=device, dtype=dtype))
            else:
                self.register_parameter("weight", None)

        def forward(self, x):
            dims = tuple(range(-len(self.normalized_shape), 0))
            eps = self.eps if self.eps is not None else torch.finfo(x.dtype).eps
            out = x * torch.rsqrt(x.pow(2).mean(dim=dims, keepdim=True) + eps)
            return out * self.weight if self.weight is not None else out

    nn.RMSNorm = RMSNorm
"#;
const TORCH_COMPAT_NAME: &str = "onyx_torch_compat";

/// The systems where Onyx installs Maia 3 by itself.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ManagedPlatform {
    WindowsX64,
    MacosArm64,
    MacosX64,
    LinuxX64,
}

impl ManagedPlatform {
    fn current() -> Option<Self> {
        Self::from_target(std::env::consts::OS, std::env::consts::ARCH)
    }

    fn from_target(os: &str, arch: &str) -> Option<Self> {
        match (os, arch) {
            ("windows", "x86_64") => Some(Self::WindowsX64),
            ("macos", "aarch64") => Some(Self::MacosArm64),
            ("macos", "x86_64") => Some(Self::MacosX64),
            ("linux", "x86_64") => Some(Self::LinuxX64),
            _ => None,
        }
    }

    fn is_windows(self) -> bool {
        self == Self::WindowsX64
    }

    /// The uv release asset and the SHA-256 published next to it.
    fn uv_asset(self) -> (&'static str, &'static str) {
        match self {
            Self::WindowsX64 => (
                "uv-x86_64-pc-windows-msvc.zip",
                "f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2",
            ),
            Self::MacosArm64 => (
                "uv-aarch64-apple-darwin.tar.gz",
                "51c6170e8e3a01cef9f33b94f582b7b81ac65046f55d40afb35f9cff5a68c179",
            ),
            Self::MacosX64 => (
                "uv-x86_64-apple-darwin.tar.gz",
                "5296d5aa2b9143360405eea866f8ef4d5dc8986b164eb0dc35e8f876a9304d30",
            ),
            Self::LinuxX64 => (
                "uv-x86_64-unknown-linux-gnu.tar.gz",
                "173d95a0c32d18c896c46ba6fafbf3cf9c14ab74b033f81b76c883ef492a976b",
            ),
        }
    }

    fn uv_url(self) -> String {
        format!("{UV_RELEASE_URL}/{}", self.uv_asset().0)
    }

    /// Where the downloaded archive is kept until the installation finishes.
    fn uv_archive_name(self) -> &'static str {
        if self.is_windows() {
            "uv.zip"
        } else {
            "uv.tar.gz"
        }
    }

    /// The Windows zip has `uv.exe` at its top level; the tarballs keep `uv` inside a folder
    /// named after the asset.
    fn uv_in(self, tools_dir: &Path) -> PathBuf {
        match self.uv_asset().0.strip_suffix(".tar.gz") {
            Some(folder) => tools_dir.join(folder).join("uv"),
            None => tools_dir.join("uv.exe"),
        }
    }

    fn requirements(self) -> String {
        let torch = match self {
            Self::WindowsX64 | Self::MacosArm64 => TORCH_PYPI,
            Self::LinuxX64 => TORCH_LINUX_CPU,
            Self::MacosX64 => TORCH_MACOS_INTEL,
        };
        format!("{COMMON_REQUIREMENTS}{torch}")
    }

    fn needs_torch_compat(self) -> bool {
        self == Self::MacosX64
    }
}

/// A program inside the virtual environment: `Scripts\name.exe` on Windows, `bin/name` elsewhere.
fn venv_executable(venv: &Path, name: &str, windows: bool) -> PathBuf {
    if windows {
        venv.join("Scripts").join(format!("{name}.exe"))
    } else {
        venv.join("bin").join(name)
    }
}

/// The virtual environment's `site-packages` on macOS and Linux (`lib/python3.11/site-packages`).
fn unix_site_packages(venv: &Path) -> PathBuf {
    let minor = PYTHON_VERSION
        .splitn(3, '.')
        .take(2)
        .collect::<Vec<_>>()
        .join(".");
    venv.join("lib")
        .join(format!("python{minor}"))
        .join("site-packages")
}

/// Writes the `RMSNorm` back-port and the `.pth` line that loads it where the platform needs it.
async fn install_torch_compat(venv: &Path, platform: ManagedPlatform) -> Result<(), Error> {
    if !platform.needs_torch_compat() {
        return Ok(());
    }
    let site_packages = unix_site_packages(venv);
    if !site_packages.is_dir() {
        return Err(Error::ManagedEngine(format!(
            "The managed Python environment has no site-packages at {}",
            site_packages.display()
        )));
    }
    tokio::fs::write(
        site_packages.join(format!("{TORCH_COMPAT_NAME}.py")),
        TORCH_COMPAT_MODULE,
    )
    .await?;
    tokio::fs::write(
        site_packages.join(format!("{TORCH_COMPAT_NAME}.pth")),
        format!("import {TORCH_COMPAT_NAME}\n"),
    )
    .await?;
    Ok(())
}

/// The major version from `sw_vers -productVersion` ("14.6.1" -> 14).
fn macos_major_version(product_version: &str) -> Option<u32> {
    product_version.trim().split('.').next()?.parse().ok()
}

/// Refuses early, with a clear reason, where the pinned packages cannot install.
fn check_system_requirements(platform: ManagedPlatform) -> Result<(), Error> {
    if platform != ManagedPlatform::MacosArm64 {
        return Ok(());
    }
    let version = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());
    match version.as_deref().and_then(macos_major_version) {
        Some(major) if major < MACOS_ARM_MIN_MAJOR => Err(Error::ManagedEngine(format!(
            "Maia needs macOS {MACOS_ARM_MIN_MAJOR} (Sonoma) or newer on Apple Silicon; this Mac runs macOS {}",
            version.unwrap_or_default()
        ))),
        _ => Ok(()),
    }
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), Error> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(path)?.permissions();
    permissions.set_mode(permissions.mode() | 0o755);
    std::fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), Error> {
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMaiaInstallation {
    pub name: String,
    pub version: String,
    pub path: String,
    pub args: Vec<String>,
    pub elo: u32,
    pub installed_size_mb: u32,
    pub required_free_space_mb: u32,
    pub source_url: String,
    pub source_revision: String,
    pub model_url: String,
    pub model_revision: String,
    pub model_sha256: String,
    pub license: String,
    pub python_version: String,
    pub uv_version: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMaiaStatus {
    pub installed: bool,
    pub needs_repair: bool,
    pub installation: Option<ManagedMaiaInstallation>,
}

fn managed_maia_root(engines_dir: &Path) -> Result<PathBuf, Error> {
    if engines_dir.as_os_str().is_empty() {
        return Err(Error::ManagedEngine(
            "The engines directory cannot be empty".to_string(),
        ));
    }
    Ok(engines_dir.join("managed").join("maia3"))
}

fn assert_managed_maia_target(path: &Path) -> Result<(), Error> {
    let is_maia = path.file_name().and_then(|name| name.to_str()) == Some("maia3");
    let is_managed = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        == Some("managed");
    if !is_maia || !is_managed {
        return Err(Error::ManagedEngine(format!(
            "Refusing to modify an unsafe managed-engine path: {}",
            path.display()
        )));
    }
    Ok(())
}

fn installation_for(root: &Path) -> ManagedMaiaInstallation {
    installation_for_system(root, cfg!(windows))
}

fn installation_for_system(root: &Path, windows: bool) -> ManagedMaiaInstallation {
    let model_cache = root.join("model-cache");
    ManagedMaiaInstallation {
        name: "Maia 3 5M".to_string(),
        version: MAIA_VERSION.to_string(),
        path: venv_executable(&root.join(".venv"), "maia3-5m", windows)
            .to_string_lossy()
            .into_owned(),
        args: vec![
            "--use-uci-history".to_string(),
            "--seed".to_string(),
            "{{randomSeed}}".to_string(),
            "--temperature".to_string(),
            "1.0".to_string(),
            "--multipv".to_string(),
            "1".to_string(),
            "--device".to_string(),
            "cpu".to_string(),
            "--no-use-amp".to_string(),
            "--cache-dir".to_string(),
            model_cache.to_string_lossy().into_owned(),
            "--revision".to_string(),
            MAIA_MODEL_REVISION.to_string(),
            "--local-files-only".to_string(),
        ],
        elo: 2600,
        installed_size_mb: FINAL_SIZE_MB,
        required_free_space_mb: REQUIRED_FREE_SPACE_MB,
        source_url: MAIA_SOURCE_URL.to_string(),
        source_revision: MAIA_SOURCE_REVISION.to_string(),
        model_url: MAIA_MODEL_URL.to_string(),
        model_revision: MAIA_MODEL_REVISION.to_string(),
        model_sha256: MAIA_MODEL_SHA256.to_string(),
        license: MAIA_LICENSE.to_string(),
        python_version: PYTHON_VERSION.to_string(),
        uv_version: UV_VERSION.to_string(),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_managed_maia_status(engines_dir: PathBuf) -> Result<ManagedMaiaStatus, Error> {
    let root = managed_maia_root(&engines_dir)?;
    assert_managed_maia_target(&root)?;
    schedule_stale_cleanup(&root);
    let manifest_path = root.join(MANIFEST_FILENAME);
    let engine_path = PathBuf::from(installation_for(&root).path);

    if manifest_path.is_file() && engine_path.is_file() {
        let manifest = tokio::fs::read_to_string(&manifest_path).await?;
        if let Ok(installation) = serde_json::from_str::<ManagedMaiaInstallation>(&manifest) {
            let current = installation_for(&root);
            let matches_current = installation.version == current.version
                && installation.path == current.path
                && installation.source_revision == current.source_revision
                && installation.model_revision == current.model_revision
                && installation.model_sha256 == current.model_sha256;
            if matches_current {
                return Ok(ManagedMaiaStatus {
                    installed: true,
                    needs_repair: false,
                    installation: Some(installation),
                });
            }
        }
    }

    Ok(ManagedMaiaStatus {
        installed: false,
        needs_repair: root.exists(),
        installation: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn install_managed_maia(
    id: String,
    engines_dir: PathBuf,
    repair: bool,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ManagedMaiaInstallation, Error> {
    let platform = ManagedPlatform::current().ok_or_else(|| {
        Error::ManagedEngine(
            "Managed Maia installation is available on Windows x64, macOS and Linux x64"
                .to_string(),
        )
    })?;

    {
        if !state.managed_install_cancel_flags.is_empty() {
            return Err(Error::ManagedEngine(
                "Another managed engine installation is already running".to_string(),
            ));
        }

        let root = managed_maia_root(&engines_dir)?;
        assert_managed_maia_target(&root)?;
        let status = get_managed_maia_status(engines_dir.clone()).await?;
        if status.installed && !repair {
            return status.installation.ok_or_else(|| {
                Error::ManagedEngine("The Maia installation manifest is missing".to_string())
            });
        }

        if root.exists() {
            let owned =
                root.join(MANIFEST_FILENAME).is_file() || root.join(INSTALLING_MARKER).is_file();
            if !owned {
                return Err(Error::ManagedEngine(format!(
                    "Refusing to replace an unmanaged directory: {}",
                    root.display()
                )));
            }
            if !repair && status.needs_repair {
                return Err(Error::ManagedEngine(
                    "The managed Maia installation is incomplete; choose Repair".to_string(),
                ));
            }

            if status.needs_repair && repair && installation_assets_exist(&root)? {
                let cancel = Arc::new(AtomicBool::new(false));
                state
                    .managed_install_cancel_flags
                    .insert(id.clone(), cancel.clone());
                update_progress(&state.progress_state, &app, id.clone(), 88.0, false)?;
                info!("Resuming Maia installation from downloaded assets");
                let result =
                    finalize_managed_maia(&id, &root, platform, &app, &state, &cancel).await;
                state.managed_install_cancel_flags.remove(&id);
                return match result {
                    Ok(installation) => {
                        update_progress(&state.progress_state, &app, id, 100.0, true)?;
                        Ok(installation)
                    }
                    Err(error) => Err(error),
                };
            }

            quarantine_for_cleanup(&root).await?;
        }

        check_system_requirements(platform)?;
        ensure_free_space(&engines_dir, REQUIRED_FREE_SPACE_MB)?;
        tokio::fs::create_dir_all(&root).await?;
        tokio::fs::write(
            root.join(INSTALLING_MARKER),
            format!("maia3={MAIA_SOURCE_REVISION}\nmodel={MAIA_MODEL_REVISION}\n"),
        )
        .await?;

        let cancel = Arc::new(AtomicBool::new(false));
        state
            .managed_install_cancel_flags
            .insert(id.clone(), cancel.clone());
        update_progress(&state.progress_state, &app, id.clone(), 1.0, false)?;

        let result = install_managed_maia_inner(&id, &root, platform, &app, &state, &cancel).await;
        state.managed_install_cancel_flags.remove(&id);

        match result {
            Ok(installation) => {
                update_progress(&state.progress_state, &app, id, 100.0, true)?;
                Ok(installation)
            }
            Err(error) => Err(error),
        }
    }
}

fn ensure_free_space(path: &Path, required_mb: u32) -> Result<(), Error> {
    let existing_path = path
        .ancestors()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| {
            Error::ManagedEngine(format!(
                "Could not find a mounted drive for {}",
                path.display()
            ))
        })?;
    let mut system = sysinfo::System::new_all();
    system.refresh_disks_list();
    system.refresh_disks();
    let disk = system
        .disks()
        .iter()
        .filter(|disk| existing_path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .ok_or_else(|| {
            Error::ManagedEngine(format!(
                "Could not determine free space for {}",
                path.display()
            ))
        })?;
    let required_bytes = u64::from(required_mb) * 1024 * 1024;
    if disk.available_space() < required_bytes {
        return Err(Error::ManagedEngine(format!(
            "Maia requires approximately {required_mb} MB free during installation, but only {} MB are available",
            disk.available_space() / 1024 / 1024
        )));
    }
    Ok(())
}

async fn install_managed_maia_inner(
    id: &str,
    root: &Path,
    platform: ManagedPlatform,
    app: &AppHandle,
    state: &AppState,
    cancel: &AtomicBool,
) -> Result<ManagedMaiaInstallation, Error> {
    let uv_archive = root.join(platform.uv_archive_name());
    let (_, uv_sha256) = platform.uv_asset();
    download_checked(
        &platform.uv_url(),
        uv_sha256,
        &uv_archive,
        id,
        app,
        state,
        cancel,
    )
    .await?;
    ensure_not_cancelled(cancel)?;

    let tools_dir = root.join("tools");
    tokio::fs::create_dir_all(&tools_dir).await?;
    if platform.is_windows() {
        unzip_file(&tools_dir, &uv_archive).await?;
    } else {
        untar_gz_file(&tools_dir, &uv_archive)?;
    }
    let uv = platform.uv_in(&tools_dir);
    if !uv.is_file() {
        return Err(Error::ManagedEngine(format!(
            "The verified uv archive did not contain {}",
            uv.display()
        )));
    }
    make_executable(&uv)?;
    update_progress(&state.progress_state, app, id.to_string(), 15.0, false)?;

    let python_dir = root.join("python");
    let uv_cache = root.join("cache");
    let venv = root.join(".venv");
    let requirements = root.join("requirements.lock");
    tokio::fs::write(&requirements, platform.requirements()).await?;

    let common_env = vec![
        ("UV_PYTHON_INSTALL_DIR", python_dir.as_os_str()),
        ("UV_CACHE_DIR", uv_cache.as_os_str()),
        ("UV_PYTHON_PREFERENCE", std::ffi::OsStr::new("only-managed")),
        ("UV_NO_MODIFY_PATH", std::ffi::OsStr::new("1")),
        ("UV_NO_PROGRESS", std::ffi::OsStr::new("1")),
    ];

    run_command(
        &uv,
        &[
            "venv".into(),
            "--python".into(),
            PYTHON_VERSION.into(),
            "--python-preference".into(),
            "only-managed".into(),
            venv.as_os_str().to_owned(),
        ],
        &common_env,
        root,
        cancel,
        "create the managed Python environment",
    )
    .await?;
    update_progress(&state.progress_state, app, id.to_string(), 32.0, false)?;

    let windows = platform.is_windows();
    let python = venv_executable(&venv, "python", windows);
    run_command(
        &uv,
        &[
            "pip".into(),
            "install".into(),
            "--python".into(),
            python.as_os_str().to_owned(),
            "--requirement".into(),
            requirements.as_os_str().to_owned(),
        ],
        &common_env,
        root,
        cancel,
        "install the pinned Maia dependencies",
    )
    .await?;
    install_torch_compat(&venv, platform).await?;
    update_progress(&state.progress_state, app, id.to_string(), 72.0, false)?;

    let model_cache = root.join("model-cache");
    let cache_executable = venv_executable(&venv, "maia3-cache", windows);
    let hf_env = vec![("HF_HUB_DISABLE_SYMLINKS_WARNING", std::ffi::OsStr::new("1"))];
    run_command(
        &cache_executable,
        &[
            "--model".into(),
            "maia3-5m".into(),
            "--revision".into(),
            MAIA_MODEL_REVISION.into(),
            "--cache-dir".into(),
            model_cache.as_os_str().to_owned(),
        ],
        &hf_env,
        root,
        cancel,
        "download the pinned Maia3-5M model",
    )
    .await?;
    update_progress(&state.progress_state, app, id.to_string(), 88.0, false)?;
    finalize_managed_maia(id, root, platform, app, state, cancel).await
}

fn installation_assets_exist(root: &Path) -> Result<bool, Error> {
    let engine = PathBuf::from(installation_for(root).path);
    Ok(engine.is_file() && find_file_named(&root.join("model-cache"), "maia3-5m.pt")?.is_some())
}

async fn finalize_managed_maia(
    id: &str,
    root: &Path,
    platform: ManagedPlatform,
    app: &AppHandle,
    state: &AppState,
    cancel: &AtomicBool,
) -> Result<ManagedMaiaInstallation, Error> {
    ensure_not_cancelled(cancel)?;
    info!("Verifying Maia3-5M checkpoint checksum");
    verify_model_checkpoint(&root.join("model-cache")).await?;
    update_progress(&state.progress_state, app, id.to_string(), 92.0, false)?;

    let installation = installation_for(root);
    // A repair may resume from an environment whose back-port or permissions were lost.
    install_torch_compat(&root.join(".venv"), platform).await?;
    make_executable(Path::new(&installation.path))?;
    info!("Starting final Maia UCI verification");
    validate_uci(&installation, root, cancel).await?;
    update_progress(&state.progress_state, app, id.to_string(), 97.0, false)?;

    tokio::fs::write(
        root.join(MANIFEST_FILENAME),
        serde_json::to_vec_pretty(&installation)?,
    )
    .await?;
    remove_file_if_present(&root.join(INSTALLING_MARKER)).await;
    remove_file_if_present(&root.join("uv.zip")).await;
    remove_file_if_present(&root.join("uv.tar.gz")).await;
    remove_file_if_present(&root.join("requirements.lock")).await;

    for disposable in [root.join("tools"), root.join("cache")] {
        if disposable.exists() {
            if let Err(error) = quarantine_for_cleanup(&disposable).await {
                warn!(
                    "Could not schedule cleanup of {}: {error}",
                    disposable.display()
                );
            }
        }
    }
    info!("Managed Maia installation is ready");
    Ok(installation)
}

async fn remove_file_if_present(path: &Path) {
    if let Err(error) = tokio::fs::remove_file(path).await {
        if error.kind() != std::io::ErrorKind::NotFound {
            warn!("Could not remove {}: {error}", path.display());
        }
    }
}

async fn quarantine_for_cleanup(path: &Path) -> Result<(), Error> {
    let parent = path.parent().ok_or_else(|| {
        Error::ManagedEngine(format!("Could not isolate {} for cleanup", path.display()))
    })?;
    let label = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("files");
    tokio::fs::write(path.join(CLEANUP_MARKER), b"owned by Onyx Chess Lab\n").await?;
    let quarantined = parent.join(format!(
        "{CLEANUP_PREFIX}{label}-{:016x}",
        rand::random::<u64>()
    ));
    tokio::fs::rename(path, &quarantined).await?;
    spawn_cleanup(vec![quarantined]);
    Ok(())
}

fn schedule_stale_cleanup(root: &Path) {
    let stale = root
        .parent()
        .into_iter()
        .chain(root.exists().then_some(root))
        .flat_map(|directory| {
            std::fs::read_dir(directory)
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .map(|entry| entry.path())
        })
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(CLEANUP_PREFIX))
                && path.join(CLEANUP_MARKER).is_file()
        })
        .collect::<Vec<_>>();
    spawn_cleanup(stale);
}

fn spawn_cleanup(paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        for path in paths {
            if let Err(error) = tokio::fs::remove_dir_all(&path).await {
                if error.kind() != std::io::ErrorKind::NotFound {
                    warn!(
                        "Could not finish background cleanup of {}: {error}",
                        path.display()
                    );
                }
            }
        }
    });
}

async fn download_checked(
    url: &str,
    expected_sha256: &str,
    destination: &Path,
    id: &str,
    app: &AppHandle,
    state: &AppState,
    cancel: &AtomicBool,
) -> Result<(), Error> {
    info!("Downloading verified managed-engine bootstrap from {url}");
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await?
        .error_for_status()?;
    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut output = tokio::fs::File::create(destination).await?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0_u64;

    while let Some(chunk) = stream.next().await {
        ensure_not_cancelled(cancel)?;
        let chunk = chunk?;
        output.write_all(&chunk).await?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        if let Some(total) = total {
            let phase = (downloaded as f32 / total as f32).min(1.0);
            update_progress(
                &state.progress_state,
                app,
                id.to_string(),
                2.0 + phase * 10.0,
                false,
            )?;
        }
    }
    output.flush().await?;
    output.sync_all().await?;
    drop(output);

    let actual = format!("{:x}", hasher.finalize());
    if actual != expected_sha256 {
        return Err(Error::ManagedEngine(format!(
            "Checksum mismatch for the managed-engine bootstrap: expected {expected_sha256}, got {actual}"
        )));
    }
    Ok(())
}

async fn verify_model_checkpoint(model_cache: &Path) -> Result<(), Error> {
    let checkpoint = find_file_named(model_cache, "maia3-5m.pt")?.ok_or_else(|| {
        Error::ManagedEngine("The Maia3-5M checkpoint was not found after download".to_string())
    })?;
    let mut input = tokio::fs::File::open(&checkpoint).await?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = tokio::io::AsyncReadExt::read(&mut input, &mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != MAIA_MODEL_SHA256 {
        return Err(Error::ManagedEngine(format!(
            "Checksum mismatch for Maia3-5M: expected {MAIA_MODEL_SHA256}, got {actual}"
        )));
    }
    Ok(())
}

fn find_file_named(root: &Path, filename: &str) -> Result<Option<PathBuf>, Error> {
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in std::fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.file_name().and_then(|name| name.to_str()) == Some(filename) {
                return Ok(Some(path));
            }
        }
    }
    Ok(None)
}

async fn run_command(
    program: &Path,
    args: &[std::ffi::OsString],
    envs: &[(&str, &std::ffi::OsStr)],
    current_dir: &Path,
    cancel: &AtomicBool,
    description: &str,
) -> Result<(), Error> {
    ensure_not_cancelled(cancel)?;
    let mut command = Command::new(program);
    command
        .args(args)
        .envs(envs.iter().copied())
        .current_dir(current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command
        .spawn()
        .map_err(|error| Error::ManagedEngine(format!("Could not {description}: {error}")))?;
    let output = tokio::select! {
        result = child.wait_with_output() => result?,
        _ = wait_for_cancel(cancel) => {
            return Err(Error::ManagedEngine("The Maia installation was cancelled".to_string()));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(Error::ManagedEngine(format!(
            "Could not {description} (exit {}): {}",
            output.status,
            truncate(detail, 3000)
        )));
    }
    Ok(())
}

async fn validate_uci(
    installation: &ManagedMaiaInstallation,
    current_dir: &Path,
    cancel: &AtomicBool,
) -> Result<(), Error> {
    ensure_not_cancelled(cancel)?;
    // Engine configurations may contain runtime placeholders. Resolve them here exactly as the
    // normal engine launcher does; passing `{{randomSeed}}` literally makes Maia's CLI exit before
    // it can answer `uci`.
    let (validation_args, _) = resolve_launch_args(&installation.args, Some(1));
    let mut command = Command::new(&installation.path);
    command
        .args(&validation_args)
        .current_dir(current_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        Error::ManagedEngine(format!(
            "Could not start the installed Maia engine: {error}"
        ))
    })?;
    let mut stdin = child.stdin.take().ok_or(Error::NoStdin)?;
    stdin.write_all(b"uci\nisready\nquit\n").await?;
    drop(stdin);

    let output = tokio::select! {
        result = child.wait_with_output() => result?,
        _ = wait_for_cancel(cancel) => {
            return Err(Error::ManagedEngine("The Maia installation was cancelled".to_string()));
        }
        _ = tokio::time::sleep(Duration::from_secs(180)) => {
            return Err(Error::ManagedEngine("Maia timed out during its UCI verification".to_string()));
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success()
        || !stdout.lines().any(|line| line.trim() == "uciok")
        || !stdout.lines().any(|line| line.trim() == "readyok")
    {
        return Err(Error::ManagedEngine(format!(
            "The installed Maia engine did not complete the UCI handshake (exit {}). stdout: {} stderr: {}",
            output.status,
            truncate(&stdout, 1500),
            truncate(&stderr, 1500)
        )));
    }
    Ok(())
}

async fn wait_for_cancel(cancel: &AtomicBool) {
    while !cancel.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

fn ensure_not_cancelled(cancel: &AtomicBool) -> Result<(), Error> {
    if cancel.load(Ordering::Relaxed) {
        return Err(Error::ManagedEngine(
            "The Maia installation was cancelled".to_string(),
        ));
    }
    Ok(())
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

#[tauri::command]
#[specta::specta]
pub fn cancel_managed_maia_install(id: String, state: tauri::State<'_, AppState>) -> bool {
    if let Some(flag) = state.managed_install_cancel_flags.get(&id) {
        flag.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_managed_maia(engines_dir: PathBuf) -> Result<(), Error> {
    let root = managed_maia_root(&engines_dir)?;
    assert_managed_maia_target(&root)?;
    if !root.exists() {
        return Ok(());
    }
    let owned = root.join(MANIFEST_FILENAME).is_file() || root.join(INSTALLING_MARKER).is_file();
    if !owned {
        return Err(Error::ManagedEngine(format!(
            "Refusing to remove an unmanaged directory: {}",
            root.display()
        )));
    }
    quarantine_for_cleanup(&root).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installation_uses_pinned_offline_model_and_managed_path() {
        let root = PathBuf::from("C:/engines/managed/maia3");
        let installation = installation_for(&root);
        let expected = if cfg!(windows) {
            ".venv/Scripts/maia3-5m.exe"
        } else {
            ".venv/bin/maia3-5m"
        };
        assert!(Path::new(&installation.path).ends_with(expected));
        assert!(installation
            .args
            .iter()
            .any(|arg| arg == "--local-files-only"));
        assert!(installation
            .args
            .iter()
            .any(|arg| arg == MAIA_MODEL_REVISION));
        assert_eq!(installation.model_sha256, MAIA_MODEL_SHA256);
        assert_eq!(installation.license, MAIA_LICENSE);

        let (validation_args, seed) = resolve_launch_args(&installation.args, Some(1));
        assert_eq!(seed, Some(1));
        assert!(validation_args.iter().any(|arg| arg == "1"));
        assert!(!validation_args
            .iter()
            .any(|arg| arg.contains("{{randomSeed}}")));
    }

    #[test]
    fn destructive_operations_require_the_exact_managed_path_shape() {
        assert!(assert_managed_maia_target(Path::new("C:/engines/managed/maia3")).is_ok());
        assert!(assert_managed_maia_target(Path::new("C:/engines/maia3")).is_err());
        assert!(assert_managed_maia_target(Path::new("C:/engines/managed/stockfish")).is_err());
    }

    #[test]
    fn interrupted_install_can_reuse_complete_engine_and_model_assets() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("managed").join("maia3");
        let engine = venv_executable(&root.join(".venv"), "maia3-5m", cfg!(windows));
        let checkpoint = root
            .join("model-cache")
            .join("snapshot")
            .join("maia3-5m.pt");
        std::fs::create_dir_all(engine.parent().unwrap()).unwrap();
        std::fs::create_dir_all(checkpoint.parent().unwrap()).unwrap();
        std::fs::write(engine, b"engine").unwrap();
        std::fs::write(checkpoint, b"model").unwrap();

        assert!(installation_assets_exist(&root).unwrap());
    }

    #[tokio::test]
    async fn large_cleanup_is_quarantined_before_deletion() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("managed").join("maia3");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(INSTALLING_MARKER), b"installing").unwrap();

        quarantine_for_cleanup(&root).await.unwrap();

        assert!(!root.exists());
    }

    const ALL_PLATFORMS: [ManagedPlatform; 4] = [
        ManagedPlatform::WindowsX64,
        ManagedPlatform::MacosArm64,
        ManagedPlatform::MacosX64,
        ManagedPlatform::LinuxX64,
    ];

    #[test]
    fn managed_installation_covers_windows_macos_and_linux_x64_only() {
        let supported = [
            ("windows", "x86_64", ManagedPlatform::WindowsX64),
            ("macos", "aarch64", ManagedPlatform::MacosArm64),
            ("macos", "x86_64", ManagedPlatform::MacosX64),
            ("linux", "x86_64", ManagedPlatform::LinuxX64),
        ];
        for (os, arch, platform) in supported {
            assert_eq!(ManagedPlatform::from_target(os, arch), Some(platform));
        }
        for (os, arch) in [
            ("windows", "aarch64"),
            ("linux", "aarch64"),
            ("windows", "x86"),
            ("freebsd", "x86_64"),
        ] {
            assert_eq!(ManagedPlatform::from_target(os, arch), None);
        }
    }

    #[test]
    fn each_platform_downloads_its_own_pinned_uv_archive() {
        let expected = [
            (
                ManagedPlatform::WindowsX64,
                "https://github.com/astral-sh/uv/releases/download/0.12.10/uv-x86_64-pc-windows-msvc.zip",
                "uv.zip",
                "tools/uv.exe",
            ),
            (
                ManagedPlatform::MacosArm64,
                "https://github.com/astral-sh/uv/releases/download/0.12.10/uv-aarch64-apple-darwin.tar.gz",
                "uv.tar.gz",
                "tools/uv-aarch64-apple-darwin/uv",
            ),
            (
                ManagedPlatform::MacosX64,
                "https://github.com/astral-sh/uv/releases/download/0.12.10/uv-x86_64-apple-darwin.tar.gz",
                "uv.tar.gz",
                "tools/uv-x86_64-apple-darwin/uv",
            ),
            (
                ManagedPlatform::LinuxX64,
                "https://github.com/astral-sh/uv/releases/download/0.12.10/uv-x86_64-unknown-linux-gnu.tar.gz",
                "uv.tar.gz",
                "tools/uv-x86_64-unknown-linux-gnu/uv",
            ),
        ];
        for (platform, url, archive, uv) in expected {
            assert_eq!(platform.uv_url(), url);
            assert!(url.contains(UV_VERSION));
            assert_eq!(platform.uv_archive_name(), archive);
            assert!(platform.uv_in(Path::new("tools")).ends_with(uv));
            let (_, sha256) = platform.uv_asset();
            assert_eq!(sha256.len(), 64);
            assert!(sha256
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        }
        let mut hashes = ALL_PLATFORMS.map(|platform| platform.uv_asset().1).to_vec();
        hashes.sort_unstable();
        hashes.dedup();
        assert_eq!(hashes.len(), ALL_PLATFORMS.len());
    }

    #[test]
    fn engine_and_tools_use_scripts_on_windows_and_bin_elsewhere() {
        let root = PathBuf::from("engines/managed/maia3");
        let venv = root.join(".venv");

        let windows = installation_for_system(&root, true);
        assert!(Path::new(&windows.path).ends_with(".venv/Scripts/maia3-5m.exe"));
        assert!(venv_executable(&venv, "python", true).ends_with("Scripts/python.exe"));
        assert!(venv_executable(&venv, "maia3-cache", true).ends_with("Scripts/maia3-cache.exe"));

        let unix = installation_for_system(&root, false);
        assert!(Path::new(&unix.path).ends_with(".venv/bin/maia3-5m"));
        assert!(venv_executable(&venv, "python", false).ends_with("bin/python"));
        assert!(venv_executable(&venv, "maia3-cache", false).ends_with("bin/maia3-cache"));
        assert!(unix_site_packages(&venv).ends_with(".venv/lib/python3.11/site-packages"));

        // Everything but the executable is shared, so the CPU-only flags hold everywhere.
        assert_eq!(windows.args, unix.args);
        for flag in ["--device", "cpu", "--no-use-amp", "--local-files-only"] {
            assert!(unix.args.iter().any(|arg| arg == flag));
        }
    }

    #[test]
    fn every_platform_pins_one_cpu_only_torch_build() {
        for platform in ALL_PLATFORMS {
            let requirements = platform.requirements();
            let lines = requirements.lines().collect::<Vec<_>>();
            assert!(lines[0].contains(MAIA_SOURCE_REVISION));
            assert_eq!(
                lines
                    .iter()
                    .filter(|line| line.starts_with("torch"))
                    .count(),
                1
            );
            assert_eq!(
                lines
                    .iter()
                    .filter(|line| line.starts_with("numpy=="))
                    .count(),
                1
            );
            assert!(lines[1..]
                .iter()
                .all(|line| line.contains("==") || line.starts_with("torch @ https://")));
            assert!(!requirements.contains("nvidia") && !requirements.contains("cuda"));
        }
        assert!(ManagedPlatform::WindowsX64
            .requirements()
            .contains("\ntorch==2.14.0\n"));
        assert!(ManagedPlatform::MacosArm64
            .requirements()
            .contains("\ntorch==2.14.0\n"));
        let linux = ManagedPlatform::LinuxX64.requirements();
        assert!(linux.contains("download.pytorch.org/whl/cpu/torch-2.14.0%2Bcpu-cp311-cp311-manylinux_2_28_x86_64.whl#sha256="));
        let intel = ManagedPlatform::MacosX64.requirements();
        assert!(intel.contains("\ntorch==2.2.2\n") && intel.contains("\nnumpy==1.26.4\n"));
    }

    #[test]
    fn macos_versions_are_read_from_sw_vers() {
        assert_eq!(macos_major_version("14.6.1\n"), Some(14));
        assert_eq!(macos_major_version("13.7"), Some(13));
        assert_eq!(macos_major_version("26.0"), Some(26));
        assert_eq!(macos_major_version(""), None);
    }

    #[tokio::test]
    async fn only_intel_macs_get_the_rmsnorm_back_port() {
        let temp = tempfile::tempdir().unwrap();
        let venv = temp.path().join(".venv");
        let site_packages = unix_site_packages(&venv);
        std::fs::create_dir_all(&site_packages).unwrap();

        for platform in [
            ManagedPlatform::WindowsX64,
            ManagedPlatform::MacosArm64,
            ManagedPlatform::LinuxX64,
        ] {
            install_torch_compat(&venv, platform).await.unwrap();
            assert_eq!(std::fs::read_dir(&site_packages).unwrap().count(), 0);
        }

        install_torch_compat(&venv, ManagedPlatform::MacosX64)
            .await
            .unwrap();
        let pth = std::fs::read_to_string(site_packages.join("onyx_torch_compat.pth")).unwrap();
        assert_eq!(pth, "import onyx_torch_compat\n");
        let module = std::fs::read_to_string(site_packages.join("onyx_torch_compat.py")).unwrap();
        assert!(module.contains("if not hasattr(nn, \"RMSNorm\")"));
        assert!(module.contains("nn.RMSNorm = RMSNorm"));
    }

    #[test]
    fn uv_tarballs_unpack_to_the_expected_executable() {
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
            Vec::new(),
            flate2::Compression::default(),
        ));
        for name in ["uv", "uvx"] {
            let mut header = tar::Header::new_gnu();
            header.set_size(4);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(
                    &mut header,
                    format!("uv-x86_64-unknown-linux-gnu/{name}"),
                    &b"#!uv"[..],
                )
                .unwrap();
        }
        let archive = builder.into_inner().unwrap().finish().unwrap();

        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("uv.tar.gz");
        std::fs::write(&source, archive).unwrap();
        let tools = temp.path().join("tools");
        std::fs::create_dir_all(&tools).unwrap();
        untar_gz_file(&tools, &source).unwrap();

        let uv = ManagedPlatform::LinuxX64.uv_in(&tools);
        assert!(uv.is_file());
        make_executable(&uv).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&uv).unwrap().permissions().mode();
            assert_eq!(mode & 0o111, 0o111);
        }
    }
}
