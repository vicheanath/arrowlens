use std::sync::Arc;

pub mod api;
pub mod cache;
pub mod engine;
pub mod error;
pub mod loaders;
pub mod state;
pub mod streaming;

use api::{database_api, dataset_api, export_api, query_api, stats_api};
use engine::database_registry::DatabaseRegistry;
use engine::dataset_registry::DatasetRegistry;
use cache::metadata_cache::MetadataCache;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Register SQLx drivers for the `any` pool (SQLite, MySQL, Postgres)
    sqlx::any::install_default_drivers();

    let registry = Arc::new(DatasetRegistry::new());
    let db_registry = Arc::new(DatabaseRegistry::new());
    let cache = Arc::new(MetadataCache::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
