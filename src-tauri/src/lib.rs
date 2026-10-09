// Phase 1 keeps the Rust side thin: SQLite access, file dialogs and file IO
// are provided by plugins and driven from the TypeScript data layer.
// Phase 2 adds the FIT/GPX/TCX import pipeline here as Tauri commands.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
