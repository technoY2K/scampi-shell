use keyring::Entry;
use keyring::Error as KeyringError;

const SERVICE: &str = "systems.zaibatsu.scampi-shell";
const ACCOUNT: &str = "device-identity-v1";

#[tauri::command]
pub fn identity_get() -> Result<Option<String>, String> {
  let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e: KeyringError| e.to_string())?;
  match entry.get_password() {
    Ok(s) => Ok(Some(s)),
    Err(KeyringError::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn identity_set(value: String) -> Result<(), String> {
  let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e: KeyringError| e.to_string())?;
  entry.set_password(&value).map_err(|e: KeyringError| e.to_string())
}

#[tauri::command]
pub fn identity_remove() -> Result<(), String> {
  let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e: KeyringError| e.to_string())?;
  match entry.delete_password() {
    Ok(()) => Ok(()),
    Err(KeyringError::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}
