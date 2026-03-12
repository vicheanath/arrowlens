use arrow_array::{RecordBatch, ArrayRef};
use arrow_array::builder::{StringBuilder, Float64Builder, Int64Builder, BooleanBuilder};
use arrow_schema::{DataType, Field, Schema};
use sqlx::{Row, TypeInfo};
use std::sync::Arc;

use crate::error::Result;

/// Convert SQLx AnyRows to Arrow RecordBatches for streaming.
pub async fn rows_to_record_batches(
    rows: Vec<sqlx::any::AnyRow>,
    columns: &[String],
) -> Result<Vec<RecordBatch>> {
    if rows.is_empty() {
        return Ok(vec![]);
    }

    // Infer schema from first row using ordinal indices (since column names might not match)
    let first_row = &rows[0];
    let mut fields = Vec::new();
    let mut column_types = Vec::new();

    for (col_idx, col_name) in columns.iter().enumerate() {
        if col_idx < first_row.len() {
            let col = first_row.column(col_idx);
            let type_name = col.type_info().name();
            
            let arrow_type = sql_type_to_arrow(type_name);
            fields.push(Field::new(col_name.clone(), arrow_type.clone(), true));
            column_types.push(arrow_type);
        }
    }

    let schema = Arc::new(Schema::new(fields));
    
    // Build arrays from rows using ordinal column indices
    let mut arrays: Vec<ArrayRef> = vec![];
    
    for (col_idx, col_type) in column_types.iter().enumerate() {
        let array: ArrayRef = match col_type {
            DataType::Utf8 => {
                let mut builder = StringBuilder::new();
                for row in &rows {
                    match row.try_get::<Option<String>, _>(col_idx) {
                        Ok(Some(v)) => builder.append_value(v),
                        Ok(None) => builder.append_null(),
                        Err(_) => builder.append_null(),
                    }
                }
                Arc::new(builder.finish())
            }
            DataType::Float64 => {
                let mut builder = Float64Builder::new();
                for row in &rows {
                    match row.try_get::<Option<f64>, _>(col_idx) {
                        Ok(Some(v)) => builder.append_value(v),
                        Ok(None) => builder.append_null(),
                        Err(_) => builder.append_null(),
                    }
                }
                Arc::new(builder.finish())
            }
            DataType::Int64 => {
                let mut builder = Int64Builder::new();
                for row in &rows {
                    match row.try_get::<Option<i64>, _>(col_idx) {
                        Ok(Some(v)) => builder.append_value(v),
                        Ok(None) => builder.append_null(),
                        Err(_) => builder.append_null(),
                    }
                }
                Arc::new(builder.finish())
            }
            DataType::Boolean => {
                let mut builder = BooleanBuilder::new();
                for row in &rows {
                    match row.try_get::<Option<bool>, _>(col_idx) {
                        Ok(Some(v)) => builder.append_value(v),
                        Ok(None) => builder.append_null(),
                        Err(_) => builder.append_null(),
                    }
                }
                Arc::new(builder.finish())
            }
            _ => {
                // Default to string for unknown types
                let mut builder = StringBuilder::new();
                for row in &rows {
                    match row.try_get::<Option<String>, _>(col_idx) {
                        Ok(Some(v)) => builder.append_value(v),
                        Ok(None) => builder.append_null(),
                        Err(_) => builder.append_null(),
                    }
                }
                Arc::new(builder.finish())
            }
        };
        arrays.push(array);
    }

    Ok(vec![RecordBatch::try_new(schema, arrays)?])
}

/// Map SQL type names to Arrow DataTypes
fn sql_type_to_arrow(sql_type: &str) -> DataType {
    match sql_type.to_lowercase().as_str() {
        "bool" | "boolean" => DataType::Boolean,
        "tinyint" | "smallint" | "int" | "bigint" | "int64" => DataType::Int64,
        "float" | "double" | "float64" => DataType::Float64,
        "text" | "varchar" | "string" | "char" => DataType::Utf8,
        "date" | "datetime" | "timestamp" => DataType::Utf8, // Simplified; could use Date32/Timestamp
        _ => DataType::Utf8, // Default fallback
    }
}
