// src/app/views.ts — vista ativa da janela (spec nomes-neumas §2.1): `body[data-view]`
// alterna `display` de hosts PRÉ-EXISTENTES no index.html (regra WebKitGTK). A 1b-2 usa
// `data-screen`, atributo distinto; a 1c generaliza este mecanismo.
export type View = "edicao" | "neumas";

export interface Views {
  current(): View;
  /** Troca de vista; não faz nada se já está nela. Chama onChange(nova, anterior). */
  set(v: View): void;
}

export function createViews(body: HTMLElement, onChange: (v: View, prev: View) => void): Views {
  let cur: View = body.dataset.view === "neumas" ? "neumas" : "edicao";
  body.dataset.view = cur;
  return {
    current: () => cur,
    set(v) {
      if (v === cur) return;
      const prev = cur;
      cur = v;
      body.dataset.view = v;
      onChange(v, prev);
    },
  };
}
