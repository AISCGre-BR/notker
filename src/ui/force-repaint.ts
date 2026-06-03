// Em sessões com renderização por software / display remoto (ex.: X11 remoto,
// llvmpipe), o WebKitGTK NÃO propaga o "damage" de conteúdo recém-exibido:
// popups/overlays só pintam depois que a janela é redimensionada (um frame
// completo). Reproduzimos esse resize por ~1px via API do Tauri para forçar o
// repaint. No-op fora do Tauri (testes/web) e idempotente (ignora reentrância).
let busy = false;

export async function forceRepaint(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const { getCurrentWindow, PhysicalSize } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    const s = await w.innerSize();
    await w.setSize(new PhysicalSize(s.width, s.height + 1));
    await new Promise((r) => setTimeout(r, 40));
    await w.setSize(new PhysicalSize(s.width, s.height));
  } catch (e) {
    // Fora do Tauri (ex.: testes jsdom) o import falha — sem problema.
    console.warn("[notker] forceRepaint indisponível:", e);
  } finally {
    busy = false;
  }
}
