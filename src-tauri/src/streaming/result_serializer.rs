use arrow_array::{
    cast::AsArray,
    Array, RecordBatch,
    types::{Float32Type, Float64Type, Int8Type, Int16Type, Int32Type, Int64Type,
            UInt8Type, UInt16Type, UInt32Type, UInt64Type, Date32Type, Date64Type},
};
use arrow_schema::DataType;
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Fully materialized query result for non-streamed queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub elapsed_ms: u64,
}

/// Serialize a list of RecordBatches into a QueryResult.
pub fn serialize_batches(batches: &[RecordBatch], elapsed_ms: u64) -> Result<QueryResult> {
    if batches.is_empty() {
        return Ok(QueryResult {
            columns: vec![],
            column_types: vec![],
            rows: vec![],
            row_count: 0,
            elapsed_ms,
        });
    }

    let schema = batches[0].schema();
    let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();
    let column_types: Vec<String> = schema
        .fields()
        .iter()
        .map(|f| crate::engine::schema_manager::format_data_type(f.data_type()))
        .collect();

    let mut all_rows = Vec::new();
    for batch in batches {
        let batch_rows = serialize_batch_to_rows(batch, &columns)?;
        all_rows.extend(batch_rows);
    }

    let row_count = all_rows.len();
    Ok(QueryResult {
        columns,
        column_types,
        rows: all_rows,
        row_count,
        elapsed_ms,
    })
}

/// Convert a single RecordBatch into a Vec of row arrays.
pub fn serialize_batch_to_rows(
    batch: &RecordBatch,
    columns: &[String],
) -> Result<Vec<Vec<serde_json::Value>>> {
    let schema = batch.schema();
    let num_rows = batch.num_rows();
    let mut rows = Vec::with_capacity(num_rows);

    for row_idx in 0..num_rows {
        let mut row = Vec::with_capacity(columns.len());
        for col_idx in 0..batch.num_columns() {
            let col = batch.column(col_idx);
            let field = schema.field(col_idx);
            row.push(array_value_to_json(col.as_ref(), field.data_type(), row_idx));
        }
        rows.push(row);
    }
    Ok(rows)
}

/// Convert a single Arrow array element to a serde_json::Value.
pub fn array_value_to_json(
    col: &dyn Array,
    dt: &DataType,
    row: usize,
) -> serde_json::Value {
    if col.is_null(row) {
        return serde_json::Value::Null;
    }
    match dt {
        DataType::Boolean => {
            use arrow_array::BooleanArray;
            let arr = col.as_any().downcast_ref::<BooleanArray>().unwrap();
            serde_json::Value::Bool(arr.value(row))
        }
        DataType::Int8 => json_int(col.as_primitive::<Int8Type>().value(row) as i64),
        DataType::Int16 => json_int(col.as_primitive::<Int16Type>().value(row) as i64),
        DataType::Int32 => json_int(col.as_primitive::<Int32Type>().value(row) as i64),
        DataType::Int64 => json_int(col.as_primitive::<Int64Type>().value(row)),
        DataType::UInt8 => json_int(col.as_primitive::<UInt8Type>().value(row) as i64),
        DataType::UInt16 => json_int(col.as_primitive::<UInt16Type>().value(row) as i64),
        DataType::UInt32 => json_int(col.as_primitive::<UInt32Type>().value(row) as i64),
        DataType::UInt64 => json_int(col.as_primitive::<UInt64Type>().value(row) as i64),
        DataType::Float32 => json_float(col.as_primitive::<Float32Type>().value(row) as f64),
        DataType::Float64 => json_float(col.as_primitive::<Float64Type>().value(row)),
        DataType::Utf8 => {
            use arrow_array::StringArray;
            let arr = col.as_any().downcast_ref::<StringArray>().unwrap();
            serde_json::Value::String(arr.value(row).to_owned())
        }
        DataType::LargeUtf8 => {
            use arrow_array::LargeStringArray;
            let arr = col.as_any().downcast_ref::<LargeStringArray>().unwrap();
            serde_json::Value::String(arr.value(row).to_owned())
        }
        DataType::Date32 => {
            let days = col.as_primitive::<Date32Type>().value(row);
            serde_json::Value::String(format!("{}", days))
        }
        DataType::Date64 => {
            let ms = col.as_primitive::<Date64Type>().value(row);
            serde_json::Value::String(format!("{}", ms))
        }
        _ => serde_json::Value::String(format!("{:?}", col.data_type())),
    }
}

fn json_int(v: i64) -> serde_json::Value {
    serde_json::Value::Number(serde_json::Number::from(v))
}

fn json_float(v: f64) -> serde_json::Value {
    serde_json::Number::from_f64(v)
        .map(serde_json::Value::Number)
        .unwrap_or(serde_json::Value::Null)
}
