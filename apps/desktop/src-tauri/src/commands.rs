//! What the window may ask for. Each command hands straight to a tested
//! function and holds no product rules.

use serde_json::Value;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

use crate::export::{export_extension, write_export};
use crate::startup;
use crate::store::{Session, SessionLog, Store};
use crate::tray::TRAY_ID;

const TRAY_TITLE_MAX: usize = 24;
const NOTICE_TITLE_MAX: usize = 80;
const NOTICE_BODY_MAX: usize = 240;

/// Cuts text to a number of characters and drops control characters.
pub fn tidy(text: &str, max: usize) -> String {
    text.chars().filter(|c| !c.is_control()).take(max).collect()
}

fn filter_name(extension: &str) -> &'static str {
    if extension == "csv" {
        "CSV"
    } else {
        "Markdown"
    }
}

#[tauri::command]
pub fn sessions_append(store: State<'_, Store>, session: Session) -> Result<bool, String> {
    store.append_session(&session)
}

#[tauri::command]
pub fn sessions_list(store: State<'_, Store>) -> Result<SessionLog, String> {
    store.list_sessions()
}

#[tauri::command]
pub fn state_load(store: State<'_, Store>) -> Result<Option<Value>, String> {
    store.load_state()
}

#[tauri::command]
pub fn state_save(store: State<'_, Store>, state: Value) -> Result<(), String> {
    store.save_state(&state)
}

#[tauri::command]
pub fn data_dir(store: State<'_, Store>) -> String {
    store.dir().to_string_lossy().into_owned()
}

/// Asks where to save, then writes the file. Returns the chosen path, or
/// `None` when the user cancels. The window never names a path itself.
#[tauri::command]
pub async fn export_save(
    app: AppHandle,
    window: WebviewWindow,
    file_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let extension = export_extension(&file_name)?;
    let picked = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(&file_name)
        .add_filter(filter_name(extension), &[extension])
        .blocking_save_file();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    write_export(&path, &contents)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let title = tidy(&title, NOTICE_TITLE_MAX);
    let body = tidy(&body, NOTICE_BODY_MAX);
    if startup::quiet() {
        eprintln!("notification: {title}: {body}");
        return Ok(());
    }
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}

/// Sets the text beside the menu-bar icon. `None` clears it.
#[tauri::command]
pub fn tray_set_title(app: AppHandle, title: Option<String>) -> Result<(), String> {
    let title = title
        .map(|title| tidy(&title, TRAY_TITLE_MAX))
        .filter(|title| !title.is_empty());
    match app.tray_by_id(TRAY_ID) {
        Some(tray) => tray.set_title(title).map_err(|error| error.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tidy_cuts_by_characters_and_drops_control_characters() {
        assert_eq!(tidy("24:59", 24), "24:59");
        assert_eq!(tidy("Tráth", 3), "Trá");
        assert_eq!(tidy("one\ntwo\u{7}", 20), "onetwo");
    }

    #[test]
    fn the_save_dialog_filter_matches_the_extension() {
        assert_eq!(filter_name("csv"), "CSV");
        assert_eq!(filter_name("md"), "Markdown");
    }
}
