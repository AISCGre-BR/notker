// Popup "Novo projeto" / "Adicionar canto".
//
// Linux/WebKitGTK — DOIS cuidados aprendidos na marra:
// 1) O popup é montado num HOST PRÉ-EXISTENTE (#dialog-host) e exibido alternando
//    seu `display` (none→flex). Essa troca força o WebKitGTK a repintar; um
//    elemento recém-inserido em document.body NÃO é pintado até a janela ser
//    redimensionada (mesmo truque do #overlay-host do painel de Nomes, que funciona).
// 2) Sem <input type="radio">/checkbox/select — controles de formulário nativos
//    (widgets GTK) podem travar o compositor. A família usa botões-toggle.
import type { Family } from "../neume/types";

export interface NewDocResult { family: Family; name?: string; office?: string }

/** Popup modal-leve no host pré-existente `host` (overlay parcial). Resolve com
 *  os campos ou null. */
export function newDocumentDialog(
  host: HTMLElement,
  opts: { title: string; warning?: string; okLabel?: string },
): Promise<NewDocResult | null> {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "newdlg-box";

    const title = document.createElement("div");
    title.className = "newdlg-title";
    title.textContent = opts.title;
    box.appendChild(title);

    // Família: dois botões-toggle (sem radio nativo — ver comentário do topo).
    let family: Family = "stgall";
    const famRow = document.createElement("div");
    famRow.className = "newdlg-fam-row";
    const famBtns = {} as Record<Family, HTMLButtonElement>;
    (["stgall", "laon"] as Family[]).forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "newdlg-fam-btn" + (f === family ? " active" : "");
      b.dataset.fam = f;
      b.textContent = f === "stgall" ? "St. Gallen" : "Laon";
      b.addEventListener("click", () => {
        family = f;
        famBtns.stgall.classList.toggle("active", family === "stgall");
        famBtns.laon.classList.toggle("active", family === "laon");
      });
      famBtns[f] = b;
      famRow.appendChild(b);
    });
    box.appendChild(famRow);

    const name = document.createElement("input");
    name.type = "text";
    name.className = "newdlg-name";
    name.placeholder = "name (título do canto)…";
    box.appendChild(name);

    const office = document.createElement("input");
    office.type = "text";
    office.className = "newdlg-office";
    office.placeholder = "office-part (opcional)…";
    box.appendChild(office);

    // Aviso discreto (ex.: "substitui o projeto atual") entre o input office e as ações.
    if (opts.warning) {
      const warn = document.createElement("div");
      warn.className = "newdlg-warning";
      warn.textContent = "⚠ " + opts.warning;
      box.appendChild(warn);
    }

    const actions = document.createElement("div");
    actions.className = "newdlg-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "newdlg-cancel";
    cancel.textContent = "Cancelar";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "newdlg-ok";
    ok.textContent = opts.okLabel ?? "Criar";
    actions.append(cancel, ok);
    box.appendChild(actions);

    // Exibe no host pré-existente: a troca de display força o repaint do WebKitGTK.
    host.replaceChildren(box);
    host.style.display = "block";
    name.focus();

    const close = (r: NewDocResult | null) => {
      host.style.display = "none";
      host.replaceChildren();
      resolve(r);
    };
    const confirm = () => {
      const nm = name.value.trim();
      const of = office.value.trim();
      close({ family, ...(nm ? { name: nm } : {}), ...(of ? { office: of } : {}) });
    };
    cancel.addEventListener("click", () => close(null));
    ok.addEventListener("click", confirm);
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirm(); }
      else if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
  });
}
