/** tabs.ts — abas do painel direito (Partitura | Interpretação — D6: a onda
 *  fica oculta por padrão). Estética do projeto: sóbria, serifada, rubrica
 *  só na aba ativa (ver tokens.css). */
export interface Tabs {
  pane(i: number): HTMLElement;
  select(i: number): void;
  active(): number;
  onChange(cb: (i: number) => void): void;
}

export function createTabs(host: HTMLElement, labels: string[]): Tabs {
  host.classList.add("panel-tabs-host");
  const header = document.createElement("div");
  header.className = "panel-tabs";
  const panes: HTMLElement[] = [];
  const btns: HTMLButtonElement[] = [];
  let current = 0;
  let cb: ((i: number) => void) | null = null;

  function select(i: number): void {
    current = i;
    btns.forEach((b, k) => b.classList.toggle("active", k === i));
    panes.forEach((p, k) => { p.style.display = k === i ? "" : "none"; });
    cb?.(i);
  }

  labels.forEach((label, i) => {
    const b = document.createElement("button");
    b.className = "panel-tab";
    b.textContent = label;
    b.addEventListener("click", () => select(i));
    header.appendChild(b);
    btns.push(b);
    const pane = document.createElement("div");
    pane.className = "panel-pane";
    panes.push(pane);
  });

  host.appendChild(header);
  for (const p of panes) host.appendChild(p);
  select(0);

  return {
    pane: (i) => panes[i],
    select,
    active: () => current,
    onChange: (f) => { cb = f; },
  };
}
