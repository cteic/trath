mod commands;
mod export;
mod startup;
mod store;
mod tick;
mod tray;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::store::Store;

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // A menu-bar app: no Dock icon, and the window comes and goes from the tray.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let data_dir = startup::data_dir(app.path().app_data_dir()?);
    app.manage(Store::new(data_dir));

    tray::build(app)?;

    let title = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| app.package_info().name.clone());
    WebviewWindowBuilder::new(app, tray::WINDOW_LABEL, WebviewUrl::default())
        .title(title)
        .inner_size(380.0, 760.0)
        .min_inner_size(340.0, 600.0)
        .visible(!startup::starts_hidden(std::env::args()))
        .focused(!startup::quiet())
        .build()?;

    tick::spawn(app.handle().clone());
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default();
    // A quiet run must not pull the app in front of whatever is in use.
    #[cfg(target_os = "macos")]
    let builder = builder.activate_ignoring_other_apps(!startup::quiet());

    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::sessions_append,
            commands::sessions_list,
            commands::state_load,
            commands::state_save,
            commands::data_dir,
            commands::export_save,
            commands::notify,
            commands::tray_set_title,
        ])
        .setup(setup)
        .on_window_event(|window, event| {
            // Closing the window hides it. The timer keeps running in the menu bar.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("the app failed to start");
}
