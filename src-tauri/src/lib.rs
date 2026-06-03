mod project;

pub fn run() {
    // Linux/webkitgtk 2.4x: o renderer DMABUF derruba o WebKitWebProcess em muitos
    // drivers, VMs e GPUs (sintoma: janela em branco + "WebKitWebProcess encontrou
    // um erro fatal e foi fechado"). Desligamos por padrão, respeitando override do
    // usuário (quem quiser o DMABUF é só exportar a variável antes de abrir).
    // Linux: a renderização acelerada (EGL/DRI3) está quebrada em muitas máquinas
    // — ex.: "libEGL warning: DRI3 error: Could not get DRI3 device". Sintomas no
    // WebKitGTK: janela em branco; popups/overlays recém-exibidos só aparecem após
    // redimensionar a janela; fullscreen trava o compositor. Forçamos um caminho de
    // renderização por SOFTWARE (que repinta conteúdo dinâmico corretamente):
    //   - WEBKIT_DISABLE_DMABUF_RENDERER: desliga o renderer DMABUF do WebKit.
    //   - WEBKIT_DISABLE_COMPOSITING_MODE: desliga a composição acelerada.
    //   - LIBGL_ALWAYS_SOFTWARE: força o Mesa a usar llvmpipe (sem GPU/DRI3).
    // Cada flag respeita override do usuário (só setamos se ainda não definida).
    #[cfg(target_os = "linux")]
    {
        for (key, val) in [
            ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
            ("WEBKIT_DISABLE_COMPOSITING_MODE", "1"),
            ("LIBGL_ALWAYS_SOFTWARE", "1"),
        ] {
            if std::env::var_os(key).is_none() {
                std::env::set_var(key, val);
            }
        }
        eprintln!(
            "[notker] render Linux: DMABUF={:?} COMPOSITING={:?} LIBGL_SW={:?}",
            std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok(),
            std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").ok(),
            std::env::var("LIBGL_ALWAYS_SOFTWARE").ok(),
        );
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
