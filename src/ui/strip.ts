/** strip.ts — faixa inferior recolhível do painel da partitura (B2a-fix1).
 *  A partitura fica SEMPRE visível em cima; a faixa (onda de interpretação)
 *  expande/recolhe embaixo — recolhida por padrão (D6: nem sempre visível). */
export interface BottomStrip {
  top(): HTMLElement;        // host da partitura (sempre visível)
  body(): HTMLElement;       // host do conteúdo da faixa (onda)
  expanded(): boolean;
  toggle(): void;
  onToggle(cb: (expanded: boolean) => void): void;
}

export function createBottomStrip(host: HTMLElement, title: string): BottomStrip {
  host.classList.add("strip-host");
  const top = document.createElement("div");
  top.className = "strip-top";
  const header = document.createElement("button");
  header.className = "strip-header";
  const caret = document.createElement("span");
  caret.className = "strip-caret";
  caret.textContent = "▸";
  const label = document.createElement("span");
  label.textContent = title;
  header.append(caret, label);
  const body = document.createElement("div");
  body.className = "strip-body";
  body.style.display = "none";
  host.append(top, header, body);

  let _expanded = false;
  let cb: ((e: boolean) => void) | null = null;
  function toggle(): void {
    _expanded = !_expanded;
    body.style.display = _expanded ? "" : "none";
    caret.textContent = _expanded ? "▾" : "▸";
    host.classList.toggle("strip-expanded", _expanded);
    cb?.(_expanded);
  }
  header.addEventListener("click", toggle);

  return {
    top: () => top,
    body: () => body,
    expanded: () => _expanded,
    toggle,
    onToggle: (f) => { cb = f; },
  };
}
