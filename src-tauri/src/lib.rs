use std::sync::Arc;

pub mod api;
pub mod cache;
pub mod engine;
pub mod error;
pub mod loaders;
pub mod services;
pub mod state;
pub mod streaming;

use api::{database_api, dataset_api, export_api, query_api, stats_api};
use cache::app_store::AppStore;
use engine::database_registry::DatabaseRegistry;
use engine::dataset_registry::DatasetRegistry;
use cache::metadata_cache::MetadataCache;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Register SQLx drivers for the `any` pool (SQLite, MySQL, Postgres)
    sqlx::any::install_default_drivers();

    let registry = Arc::new(DatasetRegistry::new());
    let db_registry = Arc::new(DatabaseRegistry::new());
    let db_registry_for_setup = db_registry.clone();
    let cache = Arc::new(MetadataCache::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| -> Box<dyn std::error::Error> {
                    Box::new(std::io::Error::other(format!(
                        "Failed to resolve app data dir: {e}"
                    )))
                })?;

            let app_store = Arc::new(AppStore::initialize(&app_data_dir).map_err(
                |e| -> Box<dyn std::error::Error> { Box::new(e) },
            )?);

            query_api::restore_history(app_store.load_query_history());
            db_registry_for_setup
                .restore_connections_list(app_store.load_database_connections());

            app.manage(app_store);
            Ok(())
        })
        .manage(registry)
        .manage(db_registry)
        .manage(cache)
        .invoke_handler(tauri::generate_handler![
            database_api::connect_database,
            database_api::connect_sqlite_database,
            database_api::list_database_connections,
            database_api::disconnect_database,
            database_api::list_database_tables,
            dataset_api::load_dataset,
            dataset_api::list_datasets,
            dataset_api::remove_dataset,
            dataset_api::get_dataset_preview,
            query_api::run_query,
            query_api::run_query_streaming,
            query_api::cancel_query,
            query_api::get_query_history,
            query_api::explain_query,
            stats_api::get_statistics,
            stats_api::get_schema,
            stats_api::get_column_stats,
            export_api::export_query_results,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
