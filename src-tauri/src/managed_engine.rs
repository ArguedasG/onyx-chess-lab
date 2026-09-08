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
#[cfg(target_os = "windows")]
use sysinfo::{DiskExt, SystemExt};
use tauri::AppHandle;
use tokio::{io::AsyncWriteExt, process::Command};

use crate::{
    engine::resolve_launch_args, error::Error, fs::unzip_file, progress::update_progress, AppState,
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
const UV_URL: &str =
    "https://github.com/astral-sh/uv/releases/download/0.12.10/uv-x86_64-pc-windows-msvc.zip";
const UV_SHA256: &str = "f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2";
const MANIFEST_FILENAME: &str = "onyx-managed-maia3.json";
const INSTALLING_MARKER: &str = ".onyx-maia3-installing";
const CLEANUP_MARKER: &str = ".onyx-maia3-cleanup";
const CLEANUP_PREFIX: &str = ".maia3-cleanup-";
const FINAL_SIZE_MB: u32 = 660;
const REQUIRED_FREE_SPACE_MB: u32 = 1500;

const LOCKED_REQUIREMENTS: &str = r#"maia3 @ https://github.com/CSSLab/maia3/archive/1e13597c42d4858b7cfd7cfdae01e297263364b2.zip
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
numpy==2.4.6
packaging==26.3
python-chess==1.999
pyyaml==6.0.3
setuptools==84.0.0
sympy==1.14.0
torch==2.14.0
tqdm==4.70.0
typing-extensions==4.16.0
"#;

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
    let model_cache = root.join("model-cache");
    ManagedMaiaInstallation {
        name: "Maia 3 5M".to_string(),
        version: MAIA_VERSION.to_string(),
        path: root
            .join(".venv")
            .join("Scripts")
            .join("maia3-5m.exe")
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
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (id, engines_dir, repair, app, state);
        return Err(Error::ManagedEngine(
            "Managed Maia installation is currently available only on Windows x64".to_string(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        if !cfg!(target_arch = "x86_64") {
            return Err(Error::ManagedEngine(
                "Managed Maia installation requires Windows x64".to_string(),
            ));
        }

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
                let result = finalize_managed_maia(&id, &root, &app, &state, &cancel).await;
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

        let result = install_managed_maia_inner(&id, &root, &app, &state, &cancel).await;
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

#[cfg(target_os = "windows")]
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
    app: &AppHandle,
    state: &AppState,
    cancel: &AtomicBool,
) -> Result<ManagedMaiaInstallation, Error> {
    let uv_archive = root.join("uv.zip");
    download_checked(UV_URL, UV_SHA256, &uv_archive, id, app, state, cancel).await?;
    ensure_not_cancelled(cancel)?;

    let tools_dir = root.join("tools");
    tokio::fs::create_dir_all(&tools_dir).await?;
    unzip_file(&tools_dir, &uv_archive).await?;
    let uv = tools_dir.join("uv.exe");
    if !uv.is_file() {
        return Err(Error::ManagedEngine(
            "The verified uv archive did not contain uv.exe".to_string(),
        ));
    }
    update_progress(&state.progress_state, app, id.to_string(), 15.0, false)?;

    let python_dir = root.join("python");
    let uv_cache = root.join("cache");
    let venv = root.join(".venv");
    let requirements = root.join("requirements.lock");
    tokio::fs::write(&requirements, LOCKED_REQUIREMENTS).await?;

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

    let python = venv.join("Scripts").join("python.exe");
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
    update_progress(&state.progress_state, app, id.to_string(), 72.0, false)?;

    let model_cache = root.join("model-cache");
    let cache_executable = venv.join("Scripts").join("maia3-cache.exe");
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
    finalize_managed_maia(id, root, app, state, cancel).await
}

fn installation_assets_exist(root: &Path) -> Result<bool, Error> {
    let engine = PathBuf::from(installation_for(root).path);
    Ok(engine.is_file() && find_file_named(&root.join("model-cache"), "maia3-5m.pt")?.is_some())
}

async fn finalize_managed_maia(
    id: &str,
    root: &Path,
    app: &AppHandle,
    state: &AppState,
    cancel: &AtomicBool,
) -> Result<ManagedMaiaInstallation, Error> {
    ensure_not_cancelled(cancel)?;
    info!("Verifying Maia3-5M checkpoint checksum");
    verify_model_checkpoint(&root.join("model-cache")).await?;
    update_progress(&state.progress_state, app, id.to_string(), 92.0, false)?;

    let installation = installation_for(root);
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
        assert!(installation.path.ends_with(".venv\\Scripts\\maia3-5m.exe"));
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
        let engine = root.join(".venv").join("Scripts").join("maia3-5m.exe");
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
}
