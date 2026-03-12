use arrow_array::cast::AsArray;
use arrow_array::types::{Float64Type, Int64Type, Int32Type, UInt64Type, UInt32Type};
use arrow_schema::DataType;
use datafusion::arrow::record_batch::RecordBatch;

// Extracts COUNT(*) value from the first column of the first record batch.
pub fn extract_count_from_batches(batches: &[RecordBatch]) -> Option<u64> {
    let batch = batches.first()?;
    if batch.num_rows() == 0 {
        return None;
    }

    let col = batch.column(0);
    if col.is_null(0) {
        return None;
    }

    match col.data_type() {
        DataType::Int64 => Some(col.as_primitive::<Int64Type>().value(0) as u64),
        DataType::Int32 => Some(col.as_primitive::<Int32Type>().value(0) as u64),
        DataType::UInt64 => Some(col.as_primitive::<UInt64Type>().value(0)),
        DataType::UInt32 => Some(col.as_primitive::<UInt32Type>().value(0) as u64),
        DataType::Float64 => Some(col.as_primitive::<Float64Type>().value(0) as u64),
        _ => None,
    }
}
