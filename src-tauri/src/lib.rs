mod project;

pub fn run() {
    // Linux/webkitgtk 2.4x: o renderer DMABUF derruba o WebKitWebProcess em muitos
    // drivers, VMs e GPUs (sintoma: janela em branco + "WebKitWebProcess encontrou
    // um erro fatal e foi fechado"). Desligamos por padrão, respeitando override do
    // usuário (quem quiser o DMABUF é só exportar a variável antes de abrir).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // Linux: quando a renderização acelerada (EGL/DRI3) falha — ex.:
    // "libEGL warning: DRI3 error: Could not get DRI3 device" — o modo de
    // composição acelerada do WebKitGTK NÃO repinta conteúdo dinâmico: popups e
    // overlays recém-exibidos só aparecem após redimensionar a janela, e o
    // fullscreen pode travar o compositor. Desligamos a composição acelerada
    // (caminho de software repinta corretamente). Override do usuário respeitado.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            project::read_project,
            project::write_project
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Notker");
}
