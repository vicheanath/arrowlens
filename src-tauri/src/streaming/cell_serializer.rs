use sqlx::postgres::PgRow;
use sqlx::sqlite::SqliteRow;
use sqlx::{Column, Row, TypeInfo, any::AnyRow};

/// Whether a declared column type name denotes a real boolean. Integers must NOT
/// match here, or every integer would be decoded as `true`/`false`.
fn is_boolean_type(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    upper == "BOOL" || upper == "BOOLEAN"
}

pub fn any_cell_to_json(row: &AnyRow, idx: usize) -> serde_json::Value {
    let declared = row.column(idx).type_info().name().to_string();

    // Only decode as boolean when the column is explicitly a boolean type;
    // otherwise an INTEGER/TINYINT would be coerced to true/false.
    if is_boolean_type(&declared) {
        if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
            return v
                .map(serde_json::Value::Bool)
                .unwrap_or(serde_json::Value::Null);
        }
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|x| serde_json::Value::Number(serde_json::Number::from(x)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|bytes| serde_json::Value::String(format!("0x{}", hex_encode(&bytes))))
            .unwrap_or(serde_json::Value::Null);
    }

    serde_json::Value::Null
}

pub fn sqlite_cell_to_json(row: &SqliteRow, idx: usize) -> serde_json::Value {
    let declared = row.column(idx).type_info().name().to_string();

    // SQLite is dynamically typed: an INTEGER value decodes fine as `bool`, so
    // we must only treat explicitly-declared BOOLEAN columns as booleans.
    if is_boolean_type(&declared) {
        if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
            return v
                .map(serde_json::Value::Bool)
                .unwrap_or(serde_json::Value::Null);
        }
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|x| serde_json::Value::Number(serde_json::Number::from(x)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|bytes| serde_json::Value::String(format!("0x{}", hex_encode(&bytes))))
            .unwrap_or(serde_json::Value::Null);
    }

    serde_json::Value::Null
}

/// Decode one SQL Server (tiberius) cell into JSON.
///
/// tiberius is strictly typed over TDS — each `try_get` only succeeds for the
/// column's actual type — so we try concrete decoders in order (narrowest
/// integer first) and the matching one wins. Anything without a JSON-native
/// representation (decimal/money, uuid, dates, xml, binary) is rendered as a
/// string; truly unknown types fall back to a hex dump.
pub fn mssql_cell_to_json(row: &tiberius::Row, idx: usize) -> serde_json::Value {
    use serde_json::Value;

    // Boolean (BIT).
    if let Ok(v) = row.try_get::<bool, _>(idx) {
        return v.map(Value::Bool).unwrap_or(Value::Null);
    }
    // Integers: TINYINT(u8) / SMALLINT(i16) / INT(i32) / BIGINT(i64).
    if let Ok(v) = row.try_get::<u8, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<i16, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<i32, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<i64, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    // Floats: REAL(f32) / FLOAT(f64).
    if let Ok(v) = row.try_get::<f32, _>(idx) {
        return v
            .and_then(|x| serde_json::Number::from_f64(x as f64))
            .map(Value::Number)
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or(Value::Null);
    }
    // Text family: (N)VARCHAR / (N)CHAR / (N)TEXT.
    if let Ok(v) = row.try_get::<&str, _>(idx) {
        return v.map(|s| Value::String(s.to_string())).unwrap_or(Value::Null);
    }
    // Exact numeric: DECIMAL / NUMERIC / MONEY — render as an exact string.
    if let Ok(v) = row.try_get::<tiberius::numeric::Numeric, _>(idx) {
        return v.map(|n| Value::String(n.to_string())).unwrap_or(Value::Null);
    }
    // UNIQUEIDENTIFIER.
    if let Ok(v) = row.try_get::<uuid::Uuid, _>(idx) {
        return v.map(|u| Value::String(u.to_string())).unwrap_or(Value::Null);
    }
    // Date / time / datetime / datetimeoffset (chrono feature).
    {
        use sqlx::types::chrono::{DateTime, FixedOffset, NaiveDate, NaiveDateTime, NaiveTime, Utc};
        if let Ok(v) = row.try_get::<NaiveDateTime, _>(idx) {
            return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
        }
        if let Ok(v) = row.try_get::<DateTime<Utc>, _>(idx) {
            return v.map(|d| Value::String(d.to_rfc3339())).unwrap_or(Value::Null);
        }
        if let Ok(v) = row.try_get::<DateTime<FixedOffset>, _>(idx) {
            return v.map(|d| Value::String(d.to_rfc3339())).unwrap_or(Value::Null);
        }
        if let Ok(v) = row.try_get::<NaiveDate, _>(idx) {
            return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
        }
        if let Ok(v) = row.try_get::<NaiveTime, _>(idx) {
            return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
        }
    }
    // XML — e.g. SHOWPLAN_XML execution plans.
    if let Ok(v) = row.try_get::<&tiberius::xml::XmlData, _>(idx) {
        return v.map(|x| Value::String(x.to_string())).unwrap_or(Value::Null);
    }
    // VARBINARY / IMAGE / anything else → hex dump.
    if let Ok(v) = row.try_get::<&[u8], _>(idx) {
        return v
            .map(|bytes| Value::String(format!("0x{}", hex_encode(bytes))))
            .unwrap_or(Value::Null);
    }

    Value::Null
}

/// Decode one PostgreSQL cell into JSON, covering the full type vocabulary.
///
/// PostgreSQL is strictly typed over the wire (each value is type-checked
/// against the column's OID), so we try concrete decoders in order — narrowest
/// integer/float first — and only the matching one succeeds. Anything without a
/// JSON-native representation (uuid, dates, numeric, network, bit, interval, …)
/// is rendered as a string. Arrays are decoded element-wise; truly unknown
/// types fall back to their text form or a hex dump.
pub fn pg_cell_to_json(row: &PgRow, idx: usize) -> serde_json::Value {
    use serde_json::Value;
    use sqlx::postgres::types::{PgInterval, PgMoney, PgTimeTz};
    use sqlx::types::chrono::{DateTime, FixedOffset, NaiveDate, NaiveDateTime, NaiveTime, Utc};

    // JSON / JSONB — keep native structure.
    if let Ok(v) = row.try_get::<Option<Value>, _>(idx) {
        return v.unwrap_or(Value::Null);
    }
    // Boolean.
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(Value::Bool).unwrap_or(Value::Null);
    }
    // Integers: int2 / int4 / int8 (narrowest first; each matches one OID).
    if let Ok(v) = row.try_get::<Option<i16>, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map(|x| Value::Number(x.into())).unwrap_or(Value::Null);
    }
    // Object identifiers (oid and the reg* aliases) decode as u32.
    if let Ok(v) = row.try_get::<Option<sqlx::postgres::types::Oid>, _>(idx) {
        return v
            .map(|o| Value::Number(o.0.into()))
            .unwrap_or(Value::Null);
    }
    // Floats: float4 / float8.
    if let Ok(v) = row.try_get::<Option<f32>, _>(idx) {
        return v
            .and_then(|x| serde_json::Number::from_f64(x as f64))
            .map(Value::Number)
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or(Value::Null);
    }
    // Text family: varchar, text, char, name, enum, xml, citext, etc. Tried
    // early (right after the numeric types) because text is by far the most
    // common column type — each `try_get` is OID-gated, so a non-text column
    // simply falls through, but text cells avoid ~12 wasted decode attempts.
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(Value::String).unwrap_or(Value::Null);
    }
    // Arbitrary-precision numeric / decimal — render as exact string.
    if let Ok(v) = row.try_get::<Option<sqlx::types::BigDecimal>, _>(idx) {
        return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
    }
    // Money — formatted with 2 fractional digits.
    if let Ok(v) = row.try_get::<Option<PgMoney>, _>(idx) {
        return v
            .map(|m| Value::String(m.to_bigdecimal(2).to_string()))
            .unwrap_or(Value::Null);
    }
    // UUID.
    if let Ok(v) = row.try_get::<Option<sqlx::types::Uuid>, _>(idx) {
        return v.map(|u| Value::String(u.to_string())).unwrap_or(Value::Null);
    }
    // Date / time / timestamp (with and without time zone).
    if let Ok(v) = row.try_get::<Option<DateTime<Utc>>, _>(idx) {
        return v.map(|d| Value::String(d.to_rfc3339())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<DateTime<FixedOffset>>, _>(idx) {
        return v.map(|d| Value::String(d.to_rfc3339())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<NaiveDateTime>, _>(idx) {
        return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<NaiveDate>, _>(idx) {
        return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<NaiveTime>, _>(idx) {
        return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<PgTimeTz>, _>(idx) {
        return v
            .map(|t| Value::String(format!("{} {}", t.time, t.offset)))
            .unwrap_or(Value::Null);
    }
    // Interval — duration.
    if let Ok(v) = row.try_get::<Option<PgInterval>, _>(idx) {
        return v
            .map(|iv| Value::String(format_interval(&iv)))
            .unwrap_or(Value::Null);
    }
    // Network address types.
    if let Ok(v) = row.try_get::<Option<sqlx::types::ipnetwork::IpNetwork>, _>(idx) {
        return v.map(|n| Value::String(n.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<sqlx::types::mac_address::MacAddress>, _>(idx) {
        return v.map(|m| Value::String(m.to_string())).unwrap_or(Value::Null);
    }
    // Bit / bit varying.
    if let Ok(v) = row.try_get::<Option<sqlx::types::BitVec>, _>(idx) {
        return v
            .map(|b| Value::String(b.iter().map(|bit| if bit { '1' } else { '0' }).collect()))
            .unwrap_or(Value::Null);
    }
    // One-dimensional arrays of the common element types.
    if let Some(arr) = pg_array_to_json(row, idx) {
        return arr;
    }
    // Anything left (geometric, ranges, custom binary, …) as a hex dump.
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|bytes| Value::String(format!("0x{}", hex_encode(&bytes))))
            .unwrap_or(Value::Null);
    }

    Value::Null
}

/// Decode common 1-D PostgreSQL arrays into a JSON array. Returns `None` when
/// the column isn't one of the handled array types so the caller can continue.
fn pg_array_to_json(row: &PgRow, idx: usize) -> Option<serde_json::Value> {
    use serde_json::json;

    macro_rules! try_array {
        ($ty:ty) => {
            match row.try_get::<Option<Vec<$ty>>, _>(idx) {
                Ok(Some(v)) => return Some(json!(v)),
                Ok(None) => return Some(serde_json::Value::Null),
                Err(_) => {}
            }
        };
    }

    try_array!(bool);
    try_array!(i16);
    try_array!(i32);
    try_array!(i64);
    try_array!(f32);
    try_array!(f64);
    try_array!(String);
    None
}

/// Render a PostgreSQL `interval` as a compact, human-readable string,
/// e.g. `1 mon 2 days 03:04:05`.
fn format_interval(iv: &sqlx::postgres::types::PgInterval) -> String {
    let mut parts: Vec<String> = Vec::new();
    if iv.months != 0 {
        let years = iv.months / 12;
        let months = iv.months % 12;
        if years != 0 {
            parts.push(format!("{} yr{}", years, if years.abs() == 1 { "" } else { "s" }));
        }
        if months != 0 {
            parts.push(format!("{} mon{}", months, if months.abs() == 1 { "" } else { "s" }));
        }
    }
    if iv.days != 0 {
        parts.push(format!("{} day{}", iv.days, if iv.days.abs() == 1 { "" } else { "s" }));
    }
    let micros = iv.microseconds;
    if micros != 0 || parts.is_empty() {
        let total_secs = micros / 1_000_000;
        let frac = (micros % 1_000_000).abs();
        let hours = total_secs / 3600;
        let mins = (total_secs % 3600) / 60;
        let secs = total_secs % 60;
        if frac != 0 {
            parts.push(format!("{:02}:{:02}:{:02}.{:06}", hours, mins, secs, frac));
        } else {
            parts.push(format!("{:02}:{:02}:{:02}", hours, mins, secs));
        }
    }
    parts.join(" ")
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}
