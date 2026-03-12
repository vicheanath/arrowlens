use std::collections::HashMap;

/// Tracks the state of active queries globally.
/// Used for implementing query cancellation.
pub static ACTIVE_QUERIES: once_cell::sync::Lazy<parking_lot::Mutex<HashMap<String, QueryState>>> =
    once_cell::sync::Lazy::new(|| parking_lot::Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryState {
    Running,
    Cancelled,
    Completed,
}

/// Register a new query as active
pub fn register_query(query_id: &str) {
    let mut queries = ACTIVE_QUERIES.lock();
    queries.insert(query_id.to_string(), QueryState::Running);
}

/// Check if a query has been cancelled
pub fn is_cancelled(query_id: &str) -> bool {
    let queries = ACTIVE_QUERIES.lock();
    queries.get(query_id) == Some(&QueryState::Cancelled)
}

/// Mark a query as cancelled
pub fn cancel(query_id: &str) {
    let mut queries = ACTIVE_QUERIES.lock();
    if let Some(state) = queries.get_mut(query_id) {
        *state = QueryState::Cancelled;
    }
}

/// Mark a query as completed
pub fn complete(query_id: &str) {
    let mut queries = ACTIVE_QUERIES.lock();
    if let Some(state) = queries.get_mut(query_id) {
        *state = QueryState::Completed;
    }
}

/// Clean up a query (remove it from tracking)
pub fn cleanup(query_id: &str) {
    let mut queries = ACTIVE_QUERIES.lock();
    queries.remove(query_id);
}
