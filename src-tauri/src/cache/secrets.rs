//! Thin wrapper over the OS keychain (Windows Credential Manager, macOS
//! Keychain, Linux Secret Service) for storing secret material — database
//! connection strings and the AI API key — out of the plaintext app-state file.
//!
//! All operations degrade gracefully: if the platform keychain is unavailable
//! (locked, headless CI, missing service) we log and continue rather than fail
//! the app. Callers must only blank the on-disk copy of a secret when
//! `set_secret` returns `true`, so a keychain outage never loses data.

use keyring::{Entry, Error};

const SERVICE: &str = "com.arrowlens.app";

/// Keychain account name for a database connection's secret.
pub fn db_account(connection_id: &str) -> String {
    format!("db:{connection_id}")
}

/// Keychain account name for the AI provider API key.
pub const AI_API_KEY: &str = "ai:api_key";

/// Store a secret. Returns `true` on success so the caller can decide whether it
/// is safe to remove the plaintext copy.
pub fn set_secret(account: &str, secret: &str) -> bool {
    match Entry::new(SERVICE, account) {
        Ok(entry) => match entry.set_password(secret) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("keychain: failed to store secret for {account}: {e}");
                false
            }
        },
        Err(e) => {
            log::warn!("keychain: failed to open entry for {account}: {e}");
            false
        }
    }
}

/// Retrieve a secret, or `None` if absent / unavailable.
pub fn get_secret(account: &str) -> Option<String> {
    let entry = Entry::new(SERVICE, account).ok()?;
    match entry.get_password() {
        Ok(secret) => Some(secret),
        Err(Error::NoEntry) => None,
        Err(e) => {
            log::warn!("keychain: failed to read secret for {account}: {e}");
            None
        }
    }
}

/// Delete a secret. A missing entry is treated as success.
pub fn delete_secret(account: &str) {
    if let Ok(entry) = Entry::new(SERVICE, account) {
        match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => {}
            Err(e) => log::warn!("keychain: failed to delete secret for {account}: {e}"),
        }
    }
}
