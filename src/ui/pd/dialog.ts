/** Diálogo do Parchment (sc-dialog): título, uma frase, campos e ações.
 *  WebKitGTK: monta num host PRÉ-EXISTENTE alternando display e NÃO usa o véu de
 *  tela cheia (sc-backdrop) — um elemento inset:0 não repinta no RDP/llvmpipe.
 *  Escolhas são segmentados (botões), nunca radio/select nativos. */
export interface DialogField { key: string; label: string; value?: string; placeholder?: string; serif?: boolean }
export interface DialogSeg { key: string; label: string; options: { value: string; label: string; disabled?: boolean }[]; value: string }
export interface DialogAction { id: string; label: string; kind?: "filled" | "elevated" | "danger" | "text" }
export interface DialogSpec {
  title: string; body?: string; fields?: DialogField[]; segs?: DialogSeg[];
  actions: DialogAction[]; defaultAction?: string;
}
export interface DialogResult { action: string | null; values: Record<string, string> }

const ORDER = { danger: 0, text: 1, elevated: 2, filled: 3 } as const;

const open = new WeakMap<HTMLElement, (action: string | null) => void>();
let seq = 0;

export function openDialog(host: HTMLElement, spec: DialogSpec): Promise<DialogResult> {
  // Reabertura no mesmo host: encerra o anterior (devolvendo o foco original) antes.
  open.get(host)?.(null);
  return new Promise((resolve) => {
    const values: Record<string, string> = {};
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = document.createElement("div");
    box.className = "sc-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const h = document.createElement("h2");
    h.className = "sc-dialog__title";
    h.textContent = spec.title;
    h.id = `sc-dialog-title-${++seq}`;
    box.setAttribute("aria-labelledby", h.id);
    box.appendChild(h);
    if (spec.body) {
      const p = document.createElement("p");
      p.className = "sc-dialog__body";
      p.textContent = spec.body;
      box.appendChild(p);
    }
    const inputs: HTMLInputElement[] = [];
    for (const f of spec.fields ?? []) {
      const lab = document.createElement("label");
      lab.className = "sc-field";
      const cap = document.createElement("span");
      cap.textContent = f.label;
      const inp = document.createElement("input");
      inp.className = "sc-input";
      inp.value = f.value ?? "";
      if (f.placeholder) inp.placeholder = f.placeholder;
      if (f.serif) inp.style.fontFamily = "var(--font-serif)";
      inp.dataset.key = f.key;
      lab.append(cap, inp);
      box.appendChild(lab);
      inputs.push(inp);
    }
    for (const s of spec.segs ?? []) {
      values[s.key] = s.value;
      const wrap = document.createElement("div");
      wrap.className = "sc-field";
      const cap = document.createElement("span");
      cap.textContent = s.label;
      const seg = document.createElement("div");
      seg.className = "sc-seg";
      const btns: HTMLButtonElement[] = [];
      for (const o of s.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = o.label;
        b.setAttribute("aria-pressed", String(o.value === s.value));
        if (o.disabled) b.disabled = true; // indisponível agora (ex.: "Grupo" sem grupo selecionado)
        b.addEventListener("click", () => {
          if (b.disabled) return;
          values[s.key] = o.value;
          btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        });
        btns.push(b);
        seg.appendChild(b);
      }
      wrap.append(cap, seg);
      box.appendChild(wrap);
    }
    const acts = document.createElement("div");
    acts.className = "sc-dialog__actions";
    const sorted = [...spec.actions].sort((a, b) => ORDER[a.kind ?? "text"] - ORDER[b.kind ?? "text"]);
    sorted.forEach((a, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sc-btn" + (a.kind === "filled" ? " sc-btn--filled" : a.kind === "elevated" ? " sc-btn--elevated" : a.kind === "danger" ? " sc-btn--danger" : "");
      b.textContent = a.label;
      b.addEventListener("click", () => finish(a.id));
      acts.appendChild(b);
      if (a.kind === "danger" && i < sorted.length - 1) acts.appendChild(Object.assign(document.createElement("span"), { className: "sc-spacer" }));
    });
    box.appendChild(acts);

    const def = spec.defaultAction ?? spec.actions.find((a) => a.kind === "filled")?.id ?? null;
    function finish(action: string | null): void {
      for (const inp of inputs) values[inp.dataset.key!] = inp.value.trim();
      box.removeEventListener("keydown", onKey);
      if (open.get(host) === finish) open.delete(host);
      host.innerHTML = "";
      host.style.display = "none";
      if (prevFocus && prevFocus.isConnected) prevFocus.focus();
      resolve({ action, values });
    }
    function onKey(e: KeyboardEvent): void {
      // Nenhuma tecla vaza para os atalhos globais (registro escuta em window).
      e.stopPropagation();
      if (e.key === "Tab") {
        const items = [...box.querySelectorAll<HTMLElement>("input, button:not(:disabled)")];
        const first = items[0], last = items[items.length - 1];
        if (!first) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key === "Escape" && !e.isComposing) { e.preventDefault(); finish(null); }
      else if (e.key === "Enter" && !e.isComposing && def && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); finish(def); }
    }
    box.addEventListener("keydown", onKey);
    open.set(host, finish);
    host.innerHTML = "";
    host.appendChild(box);
    host.style.display = "block";
    (inputs[0] ?? acts.lastElementChild as HTMLElement | null)?.focus();
  });
}
