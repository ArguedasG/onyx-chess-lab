use crate::error::Error;
use chrono::Utc;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager};

const LIBRARY_DIRECTORY: &str = "analysis-library-v1";
const LIBRARY_SCHEMA_VERSION: u32 = 1;
static NEXT_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisArtifactKind {
    OpeningReport,
    PlayerProfile,
}

impl AnalysisArtifactKind {
    fn directory(self) -> &'static str {
        match self {
            Self::OpeningReport => "opening-reports",
            Self::PlayerProfile => "player-profiles",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisArtifactSummary {
    pub id: String,
    pub kind: AnalysisArtifactKind,
    pub title: String,
    pub source_label: String,
    pub created_at: String,
    pub updated_at: String,
    pub schema_version: u32,
    pub version_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisArtifactVersion {
    pub version: u32,
    pub saved_at: String,
    pub payload_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisArtifactDocument {
    pub summary: AnalysisArtifactSummary,
    pub versions: Vec<AnalysisArtifactVersion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisLibraryManifest {
    schema_version: u32,
    artifacts: Vec<AnalysisArtifactSummary>,
}

fn validate_identifier(value: &str) -> Result<(), Error> {
    if value.is_empty()
        || value.len() > 200
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(Error::InvalidAnalysisArtifact(
            "artifact identifiers may only contain letters, numbers, hyphens, and underscores"
                .to_string(),
        ));
    }
    Ok(())
}

fn root(app: &AppHandle) -> Result<PathBuf, Error> {
    Ok(app.path().app_data_dir()?.join(LIBRARY_DIRECTORY))
}

fn manifest_path(app: &AppHandle) -> Result<PathBuf, Error> {
    Ok(root(app)?.join("manifest.json"))
}

fn artifact_path(app: &AppHandle, kind: AnalysisArtifactKind, id: &str) -> Result<PathBuf, Error> {
    validate_identifier(id)?;
    Ok(root(app)?.join(kind.directory()).join(format!("{id}.json")))
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, Error> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    fs::write(&temporary, serde_json::to_vec_pretty(value)?)?;

    if backup.exists() {
        fs::remove_file(&backup)?;
    }
    if path.exists() {
        fs::rename(path, &backup)?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(error.into());
    }
    if backup.exists() {
        fs::remove_file(backup)?;
    }
    Ok(())
}

fn recover_file(path: &Path) -> Result<(), Error> {
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    if !path.exists() && backup.exists() {
        fs::rename(&backup, path)?;
    } else if backup.exists() {
        fs::remove_file(backup)?;
    }
    if temporary.exists() {
        fs::remove_file(temporary)?;
    }
    Ok(())
}

fn recover_directory(directory: &Path) -> Result<(), Error> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        let file_name = path.file_name().and_then(|value| value.to_str());
        if file_name
            .is_some_and(|value| value.ends_with(".json.bak") || value.ends_with(".json.tmp"))
        {
            recover_file(&path.with_extension(""))?;
        }
    }
    Ok(())
}

fn scan_documents(app: &AppHandle) -> Result<Vec<AnalysisArtifactDocument>, Error> {
    let mut documents = Vec::new();
    for kind in [
        AnalysisArtifactKind::OpeningReport,
        AnalysisArtifactKind::PlayerProfile,
    ] {
        let directory = root(app)?.join(kind.directory());
        if !directory.exists() {
            continue;
        }
        recover_directory(&directory)?;
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            recover_file(&path)?;
            if let Ok(document) = read_json::<AnalysisArtifactDocument>(&path) {
                if document.summary.schema_version == LIBRARY_SCHEMA_VERSION
                    && document.summary.kind == kind
                {
                    documents.push(document);
                }
            }
        }
    }
    Ok(documents)
}

fn rebuild_manifest(app: &AppHandle) -> Result<AnalysisLibraryManifest, Error> {
    let mut artifacts: Vec<_> = scan_documents(app)?
        .into_iter()
        .map(|document| document.summary)
        .collect();
    artifacts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    let manifest = AnalysisLibraryManifest {
        schema_version: LIBRARY_SCHEMA_VERSION,
        artifacts,
    };
    write_json(&manifest_path(app)?, &manifest)?;
    Ok(manifest)
}

fn load_manifest(app: &AppHandle) -> Result<AnalysisLibraryManifest, Error> {
    let path = manifest_path(app)?;
    recover_file(&path)?;
    match read_json::<AnalysisLibraryManifest>(&path) {
        Ok(manifest) if manifest.schema_version == LIBRARY_SCHEMA_VERSION => Ok(manifest),
        _ => rebuild_manifest(app),
    }
}

fn new_id(kind: AnalysisArtifactKind) -> String {
    let prefix = match kind {
        AnalysisArtifactKind::OpeningReport => "report",
        AnalysisArtifactKind::PlayerProfile => "profile",
    };
    format!(
        "{prefix}-{}-{}",
        Utc::now().timestamp_millis(),
        NEXT_ID.fetch_add(1, Ordering::Relaxed)
    )
}

#[tauri::command]
#[specta::specta]
pub fn list_analysis_artifacts(app: AppHandle) -> Result<Vec<AnalysisArtifactSummary>, Error> {
    Ok(load_manifest(&app)?.artifacts)
}

#[tauri::command]
#[specta::specta]
pub fn read_analysis_artifact(
    app: AppHandle,
    kind: AnalysisArtifactKind,
    artifact_id: String,
) -> Result<AnalysisArtifactDocument, Error> {
    let path = artifact_path(&app, kind, &artifact_id)?;
    recover_file(&path)?;
    if !path.exists() {
        return Err(Error::AnalysisArtifactNotFound(artifact_id));
    }
    let document: AnalysisArtifactDocument = read_json(&path)?;
    if document.summary.schema_version != LIBRARY_SCHEMA_VERSION {
        return Err(Error::InvalidAnalysisArtifact(
            "unsupported artifact schema version".to_string(),
        ));
    }
    Ok(document)
}

#[tauri::command]
#[specta::specta]
pub fn save_analysis_artifact(
    app: AppHandle,
    kind: AnalysisArtifactKind,
    artifact_id: Option<String>,
    title: String,
    source_label: String,
    payload_json: String,
) -> Result<AnalysisArtifactDocument, Error> {
    serde_json::from_str::<Value>(&payload_json).map_err(|error| {
        Error::InvalidAnalysisArtifact(format!("payload is not valid JSON: {error}"))
    })?;
    let now = Utc::now().to_rfc3339();
    let id = artifact_id.unwrap_or_else(|| new_id(kind));
    let path = artifact_path(&app, kind, &id)?;
    recover_file(&path)?;

    let mut document = if path.exists() {
        let existing: AnalysisArtifactDocument = read_json(&path)?;
        if existing.summary.kind != kind {
            return Err(Error::InvalidAnalysisArtifact(
                "artifact kind cannot be changed".to_string(),
            ));
        }
        existing
    } else {
        AnalysisArtifactDocument {
            summary: AnalysisArtifactSummary {
                id: id.clone(),
                kind,
                title: title.clone(),
                source_label: source_label.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
                schema_version: LIBRARY_SCHEMA_VERSION,
                version_count: 0,
            },
            versions: Vec::new(),
        }
    };

    let version = document
        .versions
        .last()
        .map_or(1, |value| value.version + 1);
    document.summary.title = title;
    document.summary.source_label = source_label;
    document.summary.updated_at = now.clone();
    document.summary.version_count = version;
    document.versions.push(AnalysisArtifactVersion {
        version,
        saved_at: now,
        payload_json,
    });
    write_json(&path, &document)?;
    rebuild_manifest(&app)?;
    Ok(document)
}

#[tauri::command]
#[specta::specta]
pub fn delete_analysis_artifact(
    app: AppHandle,
    kind: AnalysisArtifactKind,
    artifact_id: String,
) -> Result<(), Error> {
    let path = artifact_path(&app, kind, &artifact_id)?;
    recover_file(&path)?;
    if !path.exists() {
        return Err(Error::AnalysisArtifactNotFound(artifact_id));
    }
    fs::remove_file(path)?;
    rebuild_manifest(&app)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn export_analysis_artifact(
    app: AppHandle,
    kind: AnalysisArtifactKind,
    artifact_id: String,
    destination: PathBuf,
) -> Result<(), Error> {
    let source = artifact_path(&app, kind, &artifact_id)?;
    recover_file(&source)?;
    if !source.exists() {
        return Err(Error::AnalysisArtifactNotFound(artifact_id));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, destination)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "onyx-analysis-library-{name}-{}",
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn atomic_json_write_replaces_the_document() {
        let directory = test_directory("replace");
        let path = directory.join("artifact.json");
        write_json(&path, &serde_json::json!({ "version": 1 })).unwrap();
        write_json(&path, &serde_json::json!({ "version": 2 })).unwrap();

        let value: Value = read_json(&path).unwrap();
        assert_eq!(value["version"], 2);
        assert!(!path.with_extension("json.tmp").exists());
        assert!(!path.with_extension("json.bak").exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn recovery_restores_a_backup_and_discards_a_partial_write() {
        let directory = test_directory("recover");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("artifact.json");
        let backup = path.with_extension("json.bak");
        let temporary = path.with_extension("json.tmp");
        fs::write(&backup, br#"{"version":1}"#).unwrap();
        fs::write(&temporary, b"partial").unwrap();

        recover_file(&path).unwrap();

        let value: Value = read_json(&path).unwrap();
        assert_eq!(value["version"], 1);
        assert!(!backup.exists());
        assert!(!temporary.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn directory_recovery_discovers_an_orphaned_backup() {
        let directory = test_directory("directory-recover");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("artifact.json");
        fs::write(path.with_extension("json.bak"), br#"{"version":1}"#).unwrap();

        recover_directory(&directory).unwrap();

        let value: Value = read_json(&path).unwrap();
        assert_eq!(value["version"], 1);
        assert!(!path.with_extension("json.bak").exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
