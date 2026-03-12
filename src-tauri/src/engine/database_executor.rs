use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{AnyPool, Column, Executor, Row, Statement, TypeInfo};
use tauri::{AppHandle, Emitter};

use crate::engine::database_registry::{DatabaseConnectionInfo, DatabaseRegistry, DatabaseType};
use crate::engine::query_executor::QueryExecutor;
use crate::error::{AppError, Result};
use crate::state::active_queries;
use crate::streaming::cell_serializer::{any_cell_to_json, pg_cell_to_json, sqlite_cell_to_json};
use crate::streaming::record_batch_stream::StreamChunk;
use crate::streaming::result_serializer::QueryResult;

pub struct DatabaseExecutor {
    registry: Arc<DatabaseRegistry>,
    connection_id: String,
    info: DatabaseConnectionInfo,
}

impl DatabaseExecutor {
    pub fn new(
        registry: Arc<DatabaseRegistry>,
        connection_id: String,
        info: DatabaseConnectionInfo,
    ) -> Self {
        Self { registry, connection_id, info }
    }

    pub fn from_registry(registry: Arc<DatabaseRegistry>, connection_id: &str) -> Result<Self> {
        let info = registry
            .get(connection_id)
            .ok_or(AppError::DatabaseNotFound)?;
        Ok(Self::new(registry, connection_id.to_string(), info))
    }

    async fn get_pool(&self) -> Result<AnyPool> {
        self.registry.get_or_create_pool(&self.connection_id).await
    }

    pub async fn list_tables(&self) -> Result<Vec<String>> {
        let pool = self.get_pool().await?;

        let sql = match self.info.database_type {
            DatabaseType::Sqlite => {
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            }
            DatabaseType::Mysql => {
                                "SELECT CONCAT(table_schema, '.', table_name) AS name \
                                 FROM information_schema.tables \
                                 WHERE table_schema = DATABASE() \
                                     AND table_type IN ('BASE TABLE', 'VIEW') \
                                 ORDER BY table_schema, table_name"
            }
            DatabaseType::Postgres => {
                                "SELECT table_schema || '.' || table_name AS name \
                                 FROM information_schema.tables \
                                 WHERE table_schema NOT IN ('pg_catalog', 'information_schema') \
                                     AND table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN') \
                                 ORDER BY table_schema, table_name"
            }
        };

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let mut tables = Vec::with_capacity(rows.len());
        for row in rows {
            let name = row
                .try_get::<String, _>(0)
                .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;
            tables.push(name);
        }

        Ok(tables)
    }

    pub async fn validate_connection_string(connection_string: &str) -> Result<()> {
        use sqlx::any::AnyPoolOptions;
        let pool = AnyPoolOptions::new()
            .max_connections(1)
            .connect(connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
        pool.close().await;
        Ok(())
    }

    async fn execute_sqlite(&self, sql: &str) -> Result<QueryResult> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&self.info.connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
        let started = Instant::now();

        let statement = pool
            .prepare(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let clipped = rows.into_iter().take(10_000).collect::<Vec<_>>();
        let (columns, column_types): (Vec<String>, Vec<String>) = if let Some(first) = clipped.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<String>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<String>>();
            (cols, types)
        } else {
            let cols = statement
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<String>>();
            let types = statement
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<String>>();
            (cols, types)
        };

        let mut rows_out: Vec<Vec<serde_json::Value>> = Vec::with_capacity(clipped.len());
        for row in &clipped {
            let mut out = Vec::with_capacity(row.len());
            for idx in 0..row.len() {
                out.push(sqlite_cell_to_json(row, idx));
            }
            rows_out.push(out);
        }

        pool.close().await;
        Ok(QueryResult {
            columns,
            column_types,
            row_count: rows_out.len(),
            rows: rows_out,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    }

    async fn execute_streaming_sqlite(
        &self,
        app: AppHandle,
        query_id: String,
        sql: &str,
        chunk_size: usize,
    ) -> Result<()> {
        if active_queries::is_cancelled(&query_id) {
            let _ = app.emit(
                &format!("query-error-{}", query_id),
                AppError::QueryCancelled.to_response(Some(sql.to_string())),
            );
            return Ok(());
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&self.info.connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        let statement = pool
            .prepare(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let (columns, _column_types): (Vec<String>, Vec<String>) = if let Some(first) = rows.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        } else {
            let cols = statement
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = statement
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        };

        let mut chunk_index = 0usize;
        for chunk in rows.chunks(chunk_size) {
            if active_queries::is_cancelled(&query_id) {
                let _ = app.emit(
                    &format!("query-chunk-{}", query_id),
                    StreamChunk {
                        query_id: query_id.clone(),
                        chunk_index,
                        columns: columns.clone(),
                        rows: vec![],
                        row_count: 0,
                        done: true,
                    },
                );
                pool.close().await;
                return Ok(());
            }

            let mut rows_json = Vec::with_capacity(chunk.len());
            for row in chunk {
                let mut row_vals = Vec::with_capacity(columns.len());
                for idx in 0..columns.len() {
                    row_vals.push(sqlite_cell_to_json(row, idx));
                }
                rows_json.push(row_vals);
            }

            let _ = app.emit(
                &format!("query-chunk-{}", query_id),
                StreamChunk {
                    query_id: query_id.clone(),
                    chunk_index,
                    columns: columns.clone(),
                    row_count: rows_json.len(),
                    rows: rows_json,
                    done: false,
                },
            );
            chunk_index += 1;
        }

        let _ = app.emit(
            &format!("query-chunk-{}", query_id),
            StreamChunk {
                query_id,
                chunk_index,
                columns,
                rows: vec![],
                row_count: 0,
                done: true,
            },
        );

        pool.close().await;
        Ok(())
    }

    async fn execute_postgres(&self, sql: &str) -> Result<QueryResult> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&self.info.connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
        let started = Instant::now();

        let statement = pool
            .prepare(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let clipped = rows.into_iter().take(10_000).collect::<Vec<_>>();

        let (columns, column_types): (Vec<String>, Vec<String>) = if let Some(first) = clipped.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<String>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<String>>();
            (cols, types)
        } else {
            let cols = statement
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<String>>();
            let types = statement
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<String>>();
            (cols, types)
        };

        let mut rows_out: Vec<Vec<serde_json::Value>> = Vec::with_capacity(clipped.len());
        for row in &clipped {
            let mut out = Vec::with_capacity(row.len());
            for idx in 0..row.len() {
                out.push(pg_cell_to_json(row, idx));
            }
            rows_out.push(out);
        }

        pool.close().await;
        Ok(QueryResult {
            columns,
            column_types,
            row_count: rows_out.len(),
            rows: rows_out,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    }

    async fn execute_streaming_postgres(
        &self,
        app: AppHandle,
        query_id: String,
        sql: &str,
        chunk_size: usize,
    ) -> Result<()> {
        if active_queries::is_cancelled(&query_id) {
            let _ = app.emit(
                &format!("query-error-{}", query_id),
                AppError::QueryCancelled.to_response(Some(sql.to_string())),
            );
            return Ok(());
        }

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&self.info.connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        let statement = pool
            .prepare(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let (columns, _column_types): (Vec<String>, Vec<String>) = if let Some(first) = rows.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        } else {
            let cols = statement
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = statement
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        };

        let mut chunk_index = 0usize;
        for chunk in rows.chunks(chunk_size) {
            if active_queries::is_cancelled(&query_id) {
                let _ = app.emit(
                    &format!("query-chunk-{}", query_id),
                    StreamChunk {
                        query_id: query_id.clone(),
                        chunk_index,
                        columns: columns.clone(),
                        rows: vec![],
                        row_count: 0,
                        done: true,
                    },
                );
                pool.close().await;
                return Ok(());
            }

            let mut rows_json = Vec::with_capacity(chunk.len());
            for row in chunk {
                let mut row_vals = Vec::with_capacity(columns.len());
                for idx in 0..columns.len() {
                    row_vals.push(pg_cell_to_json(row, idx));
                }
                rows_json.push(row_vals);
            }

            let _ = app.emit(
                &format!("query-chunk-{}", query_id),
                StreamChunk {
                    query_id: query_id.clone(),
                    chunk_index,
                    columns: columns.clone(),
                    row_count: rows_json.len(),
                    rows: rows_json,
                    done: false,
                },
            );
            chunk_index += 1;
        }

        let _ = app.emit(
            &format!("query-chunk-{}", query_id),
            StreamChunk {
                query_id,
                chunk_index,
                columns,
                rows: vec![],
                row_count: 0,
                done: true,
            },
        );

        pool.close().await;
        Ok(())
    }
}

#[async_trait]
impl QueryExecutor for DatabaseExecutor {
    async fn execute(&self, sql: &str) -> Result<QueryResult> {
        if self.info.database_type == DatabaseType::Sqlite {
            return self.execute_sqlite(sql).await;
        }
        if self.info.database_type == DatabaseType::Postgres {
            return self.execute_postgres(sql).await;
        }

        let pool = self.get_pool().await?;
        let started = Instant::now();

        let statement = pool
            .prepare(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let clipped = rows.into_iter().take(10_000).collect::<Vec<_>>();

        let (columns, column_types): (Vec<String>, Vec<String>) = if let Some(first) = clipped.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<String>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<String>>();
            (cols, types)
        } else {
            let cols = statement
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<String>>();
            let types = statement
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<String>>();
            (cols, types)
        };

        let mut rows_out: Vec<Vec<serde_json::Value>> = Vec::with_capacity(clipped.len());
        for row in &clipped {
            let mut out = Vec::with_capacity(row.len());
            for idx in 0..row.len() {
                out.push(any_cell_to_json(row, idx));
            }
            rows_out.push(out);
        }

        Ok(QueryResult {
            columns,
            column_types,
            row_count: rows_out.len(),
            rows: rows_out,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    }

    async fn execute_streaming(
        &self,
        app: AppHandle,
        query_id: String,
        sql: &str,
        chunk_size: usize,
    ) -> Result<()> {
        if self.info.database_type == DatabaseType::Sqlite {
            return self
                .execute_streaming_sqlite(app, query_id, sql, chunk_size)
                .await;
        }
        if self.info.database_type == DatabaseType::Postgres {
            return self
                .execute_streaming_postgres(app, query_id, sql, chunk_size)
                .await;
        }

        if active_queries::is_cancelled(&query_id) {
            let _ = app.emit(
                &format!("query-error-{}", query_id),
                AppError::QueryCancelled.to_response(Some(sql.to_string())),
            );
            return Ok(());
        }

        let pool = self.get_pool().await?;
        let statement = pool
            .prepare(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let (columns, _column_types): (Vec<String>, Vec<String>) = if let Some(first) = rows.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        } else {
            let cols = statement
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = statement
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        };

        let mut chunk_index = 0usize;
        for chunk in rows.chunks(chunk_size) {
            if active_queries::is_cancelled(&query_id) {
                let _ = app.emit(
                    &format!("query-chunk-{}", query_id),
                    StreamChunk {
                        query_id: query_id.clone(),
                        chunk_index,
                        columns: columns.clone(),
                        rows: vec![],
                        row_count: 0,
                        done: true,
                    },
                );
                return Ok(());
            }

            let mut rows_json = Vec::with_capacity(chunk.len());
            for row in chunk {
                let mut row_vals = Vec::with_capacity(columns.len());
                for idx in 0..columns.len() {
                    row_vals.push(any_cell_to_json(row, idx));
                }
                rows_json.push(row_vals);
            }

            let _ = app.emit(
                &format!("query-chunk-{}", query_id),
                StreamChunk {
                    query_id: query_id.clone(),
                    chunk_index,
                    columns: columns.clone(),
                    row_count: rows_json.len(),
                    rows: rows_json,
                    done: false,
                },
            );
            chunk_index += 1;
        }

        let _ = app.emit(
            &format!("query-chunk-{}", query_id),
            StreamChunk {
                query_id,
                chunk_index,
                columns,
                rows: vec![],
                row_count: 0,
                done: true,
            },
        );

        Ok(())
    }
}