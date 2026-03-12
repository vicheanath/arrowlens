use arrow_schema::{DataType, Schema};
use serde::{Deserialize, Serialize};

/// A serializable representation of an Arrow schema field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaField {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
}

/// A serializable schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetSchema {
    pub dataset_id: String,
    pub fields: Vec<SchemaField>,
}

impl DatasetSchema {
    pub fn from_arrow(dataset_id: &str, schema: &Schema) -> Self {
        let fields = schema
            .fields()
            .iter()
            .map(|f| SchemaField {
                name: f.name().clone(),
                data_type: format_data_type(f.data_type()),
                nullable: f.is_nullable(),
            })
            .collect();
        Self {
            dataset_id: dataset_id.to_string(),
            fields,
        }
    }
}

/// Format Arrow data type as a readable string.
pub fn format_data_type(dt: &DataType) -> String {
    match dt {
        DataType::Null => "Null".into(),
        DataType::Boolean => "Boolean".into(),
        DataType::Int8 => "Int8".into(),
        DataType::Int16 => "Int16".into(),
        DataType::Int32 => "Int32".into(),
        DataType::Int64 => "Int64".into(),
        DataType::UInt8 => "UInt8".into(),
        DataType::UInt16 => "UInt16".into(),
        DataType::UInt32 => "UInt32".into(),
        DataType::UInt64 => "UInt64".into(),
        DataType::Float16 => "Float16".into(),
        DataType::Float32 => "Float32".into(),
        DataType::Float64 => "Float64".into(),
        DataType::Utf8 | DataType::LargeUtf8 => "String".into(),
        DataType::Binary | DataType::LargeBinary => "Binary".into(),
        DataType::Date32 | DataType::Date64 => "Date".into(),
        DataType::Timestamp(_, _) => "Timestamp".into(),
        DataType::Time32(_) | DataType::Time64(_) => "Time".into(),
        DataType::Duration(_) => "Duration".into(),
        DataType::Decimal128(p, s) => format!("Decimal({},{})", p, s),
        DataType::List(f) => format!("List<{}>", format_data_type(f.data_type())),
        DataType::Struct(_) => "Struct".into(),
        DataType::Dictionary(_, v) => format!("Dictionary<{}>", format_data_type(v)),
        _ => format!("{:?}", dt),
    }
}

/// Infer the primary SQL type category for UI column hints.
pub fn type_category(dt: &DataType) -> &'static str {
    match dt {
        DataType::Boolean => "boolean",
        DataType::Int8
        | DataType::Int16
        | DataType::Int32
        | DataType::Int64
        | DataType::UInt8
        | DataType::UInt16
        | DataType::UInt32
        | DataType::UInt64
        | DataType::Float16
        | DataType::Float32
        | DataType::Float64
        | DataType::Decimal128(_, _) => "numeric",
        DataType::Utf8 | DataType::LargeUtf8 => "string",
        DataType::Date32 | DataType::Date64 => "date",
        DataType::Timestamp(_, _) => "timestamp",
        DataType::Time32(_) | DataType::Time64(_) => "time",
        DataType::Binary | DataType::LargeBinary => "binary",
        _ => "other",
    }
}
