mod project;

// webkitgtk < 2.46: o renderer DMABUF derruba o WebKitWebProcess em muitos drivers,
// VMs e GPUs (sintoma: janela em branco) → desligar por padrão.
// webkitgtk >= 2.46 (Skia): é o caminho legado (sem DMABUF) que quebra — em X remoto
// (xrdp/llvmpipe, sem DRI3) ele para de apresentar frames e o app parece congelado,
// só repintando em resize. O renderer DMABUF tem fallback SHM automático e funciona
// → NÃO desligar. Override exportado pelo usuário vence em qualquer versão.
#[cfg(target_os = "linux")]
fn should_disable_dmabuf(major: u32, minor: u32, user_override: bool) -> bool {
    !user_override && (major, minor) < (2, 46)
}

pub fn run() {
    // (NÃO mexer em COMPOSITING_MODE/LIBGL aqui — sobre RDP isso quebrou a
    // renderização inteira; ver histórico em e055ffc.)
    #[cfg(target_os = "linux")]
    {
        extern "C" {
            fn webkit_get_major_version() -> std::os::raw::c_uint;
            fn webkit_get_minor_version() -> std::os::raw::c_uint;
        }
        // Seguro antes do GTK init: só lê constantes da biblioteca já linkada pelo wry.
        let (major, minor) =
            unsafe { (webkit_get_major_version() as u32, webkit_get_minor_version() as u32) };
        let user_override = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some();
        if should_disable_dmabuf(major, minor, user_override) {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
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

#[cfg(all(test, target_os = "linux"))]
mod dmabuf_tests {
    use super::should_disable_dmabuf;

    #[test]
    fn desliga_em_webkit_antigo_sem_override() {
        assert!(should_disable_dmabuf(2, 42, false));
        assert!(should_disable_dmabuf(2, 44, false));
    }

    #[test]
    fn nao_desliga_em_webkit_246_ou_mais_novo() {
        assert!(!should_disable_dmabuf(2, 46, false));
        assert!(!should_disable_dmabuf(2, 52, false));
        assert!(!should_disable_dmabuf(3, 0, false));
    }

    #[test]
    fn respeita_override_do_usuario_em_qualquer_versao() {
        assert!(!should_disable_dmabuf(2, 42, true));
        assert!(!should_disable_dmabuf(2, 52, true));
    }
}
