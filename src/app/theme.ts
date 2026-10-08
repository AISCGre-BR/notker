/** Tema da janela: Pergaminho (light), Vigília (dark) ou seguir o sistema.
 *  O Parchment lê `data-theme` no <html>; sem o atributo, segue prefers-color-scheme.
 *  Storage pode estar bloqueado: toda leitura/escrita é protegida. */
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "notker.theme";

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function setTheme(choice: ThemeChoice): void {
  applyTheme(choice);
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* sem storage: vale só nesta sessão */ }
}
