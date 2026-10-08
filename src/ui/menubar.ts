import type { Commands } from "../app/commands";

/** Barra de menus estilo MuseScore/Office (spec B). Rótulos e checks são
 *  FUNÇÕES reavaliadas a cada abertura — o dropdown é reconstruído na hora,
 *  então o estado exibido é sempre o atual, sem eventos de sincronização. */
export type MenuEntry = MenuItem | "---";
export interface MenuItem {
  cmd: string;
  label: string | (() => string);
  shortcut?: string;
  checked?: () => boolean;
  enabled?: () => boolean;
}
export interface MenuSpec { label: string; items: MenuEntry[]; }

export function createMenubar(
  host: HTMLElement, commands: Commands, menus: MenuSpec[], opts?: { brand?: string },
): { closeAll(): void; setTitle(title: string, edited?: boolean): void } {
  const bar = document.createElement("div");
  bar.className = "sc-menubar";
  bar.setAttribute("role", "menubar");
  const brand = document.createElement("span");
  brand.className = "sc-menubar__brand";
  brand.textContent = opts?.brand ?? "N";
  brand.setAttribute("aria-hidden", "true");
  bar.appendChild(brand);
  host.appendChild(bar);

  const title = document.createElement("span");
  title.className = "sc-menubar__title";
  bar.appendChild(title);
  function setTitle(t: string, edited = false): void {
    title.textContent = t;
    if (edited) {
      const s = document.createElement("span");
      s.className = "sc-menubar__state";
      s.textContent = "— Editado";
      title.appendChild(s);
    }
  }

  // Elemento com foco antes de a barra assumi-lo (Alt ou abertura de menu):
  // recebe o foco de volta quando o menu fecha por Esc ou por escolha de item.
  let returnFocus: HTMLElement | null = null;
  function rememberFocus(): void {
    const a = document.activeElement;
    if (a instanceof HTMLElement && a !== document.body && !bar.contains(a)) returnFocus = a;
  }
  function restoreFocus(): void {
    const back = returnFocus;
    returnFocus = null;
    if (back && back.isConnected) back.focus();
  }

  let openIdx: number | null = null;
  let pop: HTMLElement | null = null;
  const slots: HTMLElement[] = [];
  const tops: HTMLButtonElement[] = [];

  function closeAll(restore = false): void {
    pop?.remove();
    pop = null;
    if (openIdx !== null) {
      tops[openIdx].setAttribute("aria-expanded", "false");
    }
    openIdx = null;
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
    if (restore) restoreFocus(); else returnFocus = null;
  }

  function runItem(item: MenuItem): void {
    if (item.enabled && !item.enabled()) return;
    closeAll(true);
    void commands.run(item.cmd);
  }

  function buildPop(i: number): HTMLElement {
    const p = document.createElement("div");
    p.className = "sc-menu";
    p.setAttribute("role", "menu");
    p.style.position = "absolute";
    p.style.top = "100%";
    p.style.left = "0";
    p.style.zIndex = "1500";
    for (const entry of menus[i].items) {
      if (entry === "---") {
        const sep = document.createElement("div");
        sep.className = "sc-menu__sep";
        sep.setAttribute("role", "separator");
        p.appendChild(sep);
        continue;
      }
      const b = document.createElement("button");
      b.className = "sc-menu__item";
      b.disabled = entry.enabled ? !entry.enabled() : false;
      // Toggle (tem checked()) é menuitemcheckbox; ação simples é menuitem.
      if (entry.checked) {
        b.setAttribute("role", "menuitemcheckbox");
        b.setAttribute("aria-checked", String(entry.checked()));
      } else {
        b.setAttribute("role", "menuitem");
      }

      const check = document.createElement("span");
      check.className = "sc-menu__check";
      check.textContent = entry.checked?.() ? "✓" : "";
      const label = document.createElement("span");
            label.textContent = typeof entry.label === "function" ? entry.label() : entry.label;
      const shortcut = document.createElement("span");
      shortcut.className = "sc-menu__kbd";
      shortcut.textContent = entry.shortcut ?? "";

      b.append(check, label, shortcut);
      b.addEventListener("click", () => runItem(entry));
      p.appendChild(b);
    }
    return p;
  }

  function openMenu(i: number): void {
    const wasOpen = openIdx !== null;
    pop?.remove();
    if (openIdx !== null) tops[openIdx].setAttribute("aria-expanded", "false");
    if (!wasOpen) rememberFocus();
    openIdx = i;
    tops[i].setAttribute("aria-expanded", "true");
    pop = buildPop(i);
    slots[i].appendChild(pop);
    if (!wasOpen) {
      document.addEventListener("mousedown", onDocMouseDown, true);
      document.addEventListener("keydown", onDocKeyDown, true);
    }
  }

  function onDocMouseDown(e: MouseEvent): void {
    if (!(e.target instanceof Node) || !bar.contains(e.target)) closeAll();
  }

  function enabledItems(): HTMLButtonElement[] {
    return pop ? [...pop.querySelectorAll<HTMLButtonElement>(".sc-menu__item:not(:disabled)")] : [];
  }

  function onDocKeyDown(e: KeyboardEvent): void {
    if (openIdx === null) return;
    if (e.key === "Escape") { closeAll(true); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const delta = e.key === "ArrowRight" ? 1 : -1;
      openMenu((openIdx + delta + menus.length) % menus.length);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = enabledItems();
      if (items.length === 0) return;
      const cur = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown"
        ? (cur + 1) % items.length
        : (cur - 1 + items.length) % items.length;
      items[next].focus();
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && active.classList.contains("sc-menu__item")) {
        active.click();
        e.preventDefault();
      }
    }
  }

  menus.forEach((menu, i) => {
    const slot = document.createElement("span");
    slot.className = "menubar-slot";
    slot.style.position = "relative";
    const top = document.createElement("button");
    top.className = "sc-menubar__top";
    top.textContent = menu.label;
    top.setAttribute("aria-haspopup", "menu");
    top.setAttribute("aria-expanded", "false");
    top.addEventListener("click", () => {
      if (openIdx === i) closeAll(true);
      else openMenu(i);
    });
    top.addEventListener("mouseenter", () => {
      if (openIdx !== null && openIdx !== i) openMenu(i);
    });
    slot.appendChild(top);
    bar.appendChild(slot);
    slots.push(slot);
    tops.push(top);
  });

  // Alt sozinho (keydown+keyup sem outra tecla no meio) foca o 1º menu.
  let altAlone = false;
  const inField = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey && !inField(e.target);
  }, true);
  document.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && altAlone) {
      altAlone = false;
      rememberFocus();
      tops[0]?.focus();
      e.preventDefault();
    }
    altAlone = false;
  }, true);

  return { closeAll: () => closeAll(), setTitle };
}
