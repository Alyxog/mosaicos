// Mosaicos desktop entry point.
//
// Frontend handles the mosaic engine (analysis runs in a Web Worker; source +
// library persist in IndexedDB). Native plugins below provide file/folder
// dialogs and reading/writing image files. generate_context! embeds the app
// icon + capabilities at compile time — edits there need a crate rebuild.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Mosaicos");
}
