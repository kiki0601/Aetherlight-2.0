fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Aetherlight 2.0");
}
