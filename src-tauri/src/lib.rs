use std::sync::Arc;

pub mod ai;
pub mod api;
pub mod cache;
pub mod engine;
pub mod error;
pub mod loaders;
pub mod services;
pub mod state;
pub mod streaming;

use ai::context::knowledge_store::KnowledgeStore;
use ai::AiState;
use api::{ai_api, database_api, dataset_api, export_api, file_api, query_api, stats_api};
use cache::app_store::AppStore;
use engine::database_registry::DatabaseRegistry;
use engine::dataset_registry::DatasetRegistry;
use cache::metadata_cache::MetadataCache;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Default to `info` so query timing/observability logs are visible without
    // having to set RUST_LOG; override via the env var as usual.
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info"),
    )
    .init();

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

            let ai_state = Arc::new(AiState::new(app_store.load_ai_config()));
            let knowledge_store = Arc::new(
                KnowledgeStore::initialize(&app_data_dir)
                    .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?,
            );

            // Migrate any legacy plaintext secrets in app_state.json into the OS
            // keychain (and blank them on disk). Idempotent on subsequent runs.
            if let Err(e) = app_store.save_database_connections(&db_registry_for_setup.list()) {
                log::error!("Failed to migrate database secrets to keychain: {e}");
            }
            if let Err(e) = app_store.save_ai_config(&ai_state.config()) {
                log::error!("Failed to migrate AI key to keychain: {e}");
            }

            app.manage(ai_state);
            app.manage(knowledge_store);
            app.manage(app_store);
            Ok(())
        })
        .manage(registry)
        .manage(db_registry)
        .manage(cache)
        .invoke_handler(tauri::generate_handler![
            database_api::connect_database,
            database_api::test_connection,
            database_api::connect_sqlite_database,
            database_api::list_database_connections,
            database_api::disconnect_database,
            database_api::list_database_tables,
            database_api::list_database_schema_tree,
            database_api::get_connection_schema,
            dataset_api::load_dataset,
            dataset_api::list_datasets,
            dataset_api::remove_dataset,
            dataset_api::get_dataset_preview,
            query_api::run_query,
            query_api::run_query_page,
            query_api::run_query_multi,
            query_api::run_query_streaming,
            query_api::cancel_query,
            query_api::get_query_history,
            query_api::build_sql_template,
            query_api::explain_query,
            stats_api::get_statistics,
            stats_api::get_schema,
            stats_api::get_column_stats,
            export_api::export_query_results,
            file_api::read_text_file,
            file_api::write_text_file,
            file_api::prepare_sample_database,
            ai_api::ai_get_config,
            ai_api::ai_update_config,
            ai_api::ai_build_schema_context,
            ai_api::ai_explain_schema,
            ai_api::ai_generate_sql,
            ai_api::ai_fix_sql,
            ai_api::ai_advise_performance,
            ai_api::ai_suggest_questions,
            ai_api::ai_build_knowledge,
            ai_api::ai_knowledge_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
