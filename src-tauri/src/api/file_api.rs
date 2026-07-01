use std::path::PathBuf;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};

/// Read a UTF-8 text file (e.g. a `.sql` file the user picked via the dialog).
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String> {
    Ok(tokio::fs::read_to_string(&path).await?)
}

/// Write a UTF-8 text file to a user-chosen path.
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> Result<()> {
    tokio::fs::write(&path, contents).await?;
    Ok(())
}

const SAMPLE_DB: &str = "sqlite-sakila.db";

/// Make the bundled sample SQLite database available and return a stable path to
/// it (copied into the app-data dir so it is writable across runs). Used by the
/// first-run welcome screen's "Open sample database" action.
#[tauri::command]
pub async fn prepare_sample_database(app: AppHandle) -> Result<String> {
    // Locate a source copy: bundled resource first, then dev-tree fallbacks.
    let mut source: Option<PathBuf> = None;
    if let Ok(resource) = app.path().resolve(SAMPLE_DB, BaseDirectory::Resource) {
        if resource.exists() {
            source = Some(resource);
        }
    }
    if source.is_none() {
        for candidate in [PathBuf::from(SAMPLE_DB), PathBuf::from("..").join(SAMPLE_DB)] {
            if candidate.exists() {
                source = Some(candidate);
                break;
            }
        }
    }
    let source = source
        .ok_or_else(|| AppError::DatasetNotFound("bundled sample database".to_string()))?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("Failed to resolve app data dir: {e}")))?;
    tokio::fs::create_dir_all(&app_data).await?;

    let dest = app_data.join(SAMPLE_DB);
    if !dest.exists() {
        tokio::fs::copy(&source, &dest).await?;
    }
    Ok(dest.to_string_lossy().to_string())
}
