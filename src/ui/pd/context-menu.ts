/** Menu de contexto (sc-menu) no ponto (x,y), montado DENTRO de um elemento que já
 *  existe (WebKitGTK repinta). Teclado: ↑↓ navegam, Enter executa, Esc fecha e devolve
 *  o foco. Fecha em clique fora. role=menu (o registro de atalhos fica mudo enquanto aberto). */
export interface CtxItem { label: string; run: () => void; danger?: boolean; shortcut?: string; checked?: boolean }
export type CtxEntry = CtxItem | "---";

let current: (() => void) | null = null;
/** Fecha o menu aberto (se houver), removendo seus listeners. */
export function closeContextMenu(): void { current?.(); }

export function openContextMenu(
  anchorHost: HTMLElement, x: number, y: number, items: CtxEntry[],
  returnFocus?: HTMLElement, opts: { openUp?: boolean } = {},
): () => void {
  current?.();
  const m = document.createElement("div");
  m.className = "sc-menu notker-ctx";
  m.setAttribute("role", "menu");
  m.style.position = "fixed";
  m.style.left = `${x}px`;
  m.style.top = `${y}px`;
  m.style.zIndex = "1600";
  const buttons: HTMLButtonElement[] = [];
  for (const it of items) {
    if (it === "---") { m.appendChild(Object.assign(document.createElement("div"), { className: "sc-menu__sep" })); continue; }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sc-menu__item";
    b.setAttribute("role", "menuitem");
    const check = Object.assign(document.createElement("span"), { className: "sc-menu__check", textContent: it.checked ? "✓" : "" });
    const label = Object.assign(document.createElement("span"), { textContent: it.label });
    if (it.danger) label.style.color = "var(--danger)";
    const kbd = Object.assign(document.createElement("span"), { className: "sc-menu__kbd", textContent: it.shortcut ?? "" });
    b.append(check, label, kbd);
    b.addEventListener("click", () => { close(); it.run(); });
    m.appendChild(b);
    buttons.push(b);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Tab") { close(); return; }
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const n = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
      buttons[n]?.focus();
    }
  };
  const onDown = (e: MouseEvent) => { if (!(e.target instanceof Node) || !m.contains(e.target)) close(); };
  const onBlur = () => close();
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    if (current === close) current = null;
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDown, true);
    m.remove();
    returnFocus?.focus();
  }
  current = close;
  window.addEventListener("blur", onBlur);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("mousedown", onDown, true);
  anchorHost.appendChild(m);
  // não deixar sair da janela
  const r = m.getBoundingClientRect();
  if (r.right > window.innerWidth) m.style.left = `${Math.max(4, window.innerWidth - r.width - 4)}px`;
  if (opts.openUp) m.style.top = `${Math.max(4, y - r.height)}px`;
  else if (r.bottom > window.innerHeight) m.style.top = `${Math.max(4, y - r.height)}px`;
  buttons[0]?.focus();
  return close;
}
