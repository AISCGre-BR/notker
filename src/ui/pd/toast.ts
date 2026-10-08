/** Toast do Parchment (sc-toast): faixa no pé da janela, um ponto de cor do estado,
 *  uma frase e no máximo uma ação. Sucesso some em 4 s; erro fica até dispensar.
 *  Monta num host PRÉ-EXISTENTE alternando display (WebKitGTK só repinta assim). */
export type ToastKind = "ok" | "warn" | "error";
export interface Toaster {
  show(text: string, opts?: { kind?: ToastKind; action?: { label: string; run: () => void } }): void;
  dismiss(): void;
}
const AUTO_MS = 4000;

export function createToaster(host: HTMLElement): Toaster {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const dismiss = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    host.innerHTML = "";
    host.style.display = "none";
  };
  return {
    dismiss,
    show(text, opts = {}) {
      dismiss();
      const kind = opts.kind ?? "ok";
      const t = document.createElement("div");
      t.className = `sc-toast sc-toast--${kind}`;
      const dot = document.createElement("span");
      dot.className = "sc-toast__dot";
      const msg = document.createElement("span");
      msg.textContent = text;
      t.append(dot, msg);
      const action = opts.action ?? (kind === "error" ? { label: "Fechar", run: () => {} } : undefined);
      if (action) {
        const b = document.createElement("button");
        b.className = "sc-toast__act";
        b.type = "button";
        b.textContent = action.label;
        b.addEventListener("click", () => { dismiss(); action.run(); });
        t.appendChild(b);
      }
      host.appendChild(t);
      host.style.display = "block";
      if (kind !== "error") timer = setTimeout(dismiss, AUTO_MS);
    },
  };
}
