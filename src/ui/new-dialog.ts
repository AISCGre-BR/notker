import type { Family } from "../neume/types";

export interface NewDocResult { family: Family; name?: string; office?: string }

/** Diálogo modal mínimo. Resolve com os campos ou null (cancelado). */
export function newDocumentDialog(host: HTMLElement, opts: { title: string }): Promise<NewDocResult | null> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "newdlg";
    root.innerHTML = `
      <div class="newdlg-box">
        <div class="newdlg-title">${opts.title}</div>
        <label class="newdlg-fam"><input type="radio" name="fam" value="stgall" checked> St. Gallen</label>
        <label class="newdlg-fam"><input type="radio" name="fam" value="laon"> Laon</label>
        <input class="newdlg-name" type="text" placeholder="name (título do canto)…">
        <input class="newdlg-office" type="text" placeholder="office-part (opcional)…">
        <div class="newdlg-actions">
          <button class="newdlg-cancel">Cancelar</button>
          <button class="newdlg-ok">Criar</button>
        </div>
      </div>`;
    host.appendChild(root);
    // Foco imediato no campo nome — sem isso, as teclas iriam para o editor atrás.
    queueMicrotask(() => root.querySelector<HTMLInputElement>(".newdlg-name")?.focus());

    const close = (r: NewDocResult | null) => { root.remove(); resolve(r); };
    root.querySelector<HTMLButtonElement>(".newdlg-cancel")!.addEventListener("click", () => close(null));
    root.querySelector<HTMLButtonElement>(".newdlg-ok")!.addEventListener("click", () => {
      const family = (root.querySelector<HTMLInputElement>('input[name="fam"]:checked')!.value === "laon"
        ? "laon" : "stgall") as Family;
      const name = root.querySelector<HTMLInputElement>(".newdlg-name")!.value.trim();
      const office = root.querySelector<HTMLInputElement>(".newdlg-office")!.value.trim();
      close({ family, ...(name ? { name } : {}), ...(office ? { office } : {}) });
    });
  });
}
