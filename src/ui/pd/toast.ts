import { t } from "../../i18n";
/** Toast do Parchment (sc-toast): faixa no pé da janela, um ponto de cor do estado,
 *  uma frase e no máximo uma ação. Sucesso some em 4 s (10 s se tiver ação); erro fica até dispensar.
 *  Monta num host PRÉ-EXISTENTE alternando display (WebKitGTK só repinta assim). */
export type ToastKind = "ok" | "warn" | "error";
export interface Toaster {
  show(text: string, opts?: { kind?: ToastKind; action?: { label: string; run: () => void } }): void;
  dismiss(): void;
}
const AUTO_MS = 4000;
const AUTO_MS_ACTION = 10000; // com "Desfazer" o usuário precisa de tempo

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
      const toast = document.createElement("div");
      toast.className = `sc-toast sc-toast--${kind}`;
      const dot = document.createElement("span");
      dot.className = "sc-toast__dot";
      const msg = document.createElement("span");
      msg.textContent = text;
      toast.append(dot, msg);
      const action = opts.action ?? (kind === "error" ? { label: t("common.close"), run: () => {} } : undefined);
      if (action) {
        const b = document.createElement("button");
        b.className = "sc-toast__act";
        b.type = "button";
        b.textContent = action.label;
        b.addEventListener("click", () => { dismiss(); action.run(); });
        toast.appendChild(b);
      }
      host.appendChild(toast);
      host.style.display = "block";
      if (kind !== "error") timer = setTimeout(dismiss, opts.action ? AUTO_MS_ACTION : AUTO_MS);
    },
  };
}
