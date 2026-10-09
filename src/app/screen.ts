// src/app/screen.ts
/** Tela da janela: "welcome" (sem projeto), "guide" (criação guiada) ou "project" (mesa).
 *  O CSS (notker.css, por `body[data-screen]`) esconde toolbar, barra lateral e mesa fora
 *  de "project" e mostra o host da tela — hosts PRÉ-EXISTENTES alternando display
 *  (o WebKitGTK repinta assim; nada é criado/removido no nível da janela). */
export type Screen = "welcome" | "guide" | "project";

export function setScreen(s: Screen, root: HTMLElement = document.body): void {
  root.dataset.screen = s;
}

export function getScreen(root: HTMLElement = document.body): Screen {
  const s = root.dataset.screen;
  return s === "guide" || s === "project" ? s : "welcome";
}
