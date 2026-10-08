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
  host: HTMLElement, commands: Commands, menus: MenuSpec[],
): { closeAll(): void } {
  const bar = document.createElement("div");
  bar.className = "menubar";
  // Marca na linha do menubar (wireframe da spec B): "Notker Arquivo Editar…".
  const brand = document.createElement("span");
  brand.className = "toolbar-brand menubar-brand";
  brand.textContent = "Notker";
  brand.title = "Notker — editor de canto gregoriano";
  bar.appendChild(brand);
  host.appendChild(bar);

  let openIdx: number | null = null;
  let pop: HTMLElement | null = null;
  const slots: HTMLElement[] = [];
  const tops: HTMLButtonElement[] = [];

  function closeAll(): void {
    pop?.remove();
    pop = null;
    if (openIdx !== null) {
      tops[openIdx].classList.remove("open");
      tops[openIdx].setAttribute("aria-expanded", "false");
    }
    openIdx = null;
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
  }

  function runItem(item: MenuItem): void {
    if (item.enabled && !item.enabled()) return;
    closeAll();
    void commands.run(item.cmd);
  }

  function buildPop(i: number): HTMLElement {
    const p = document.createElement("div");
    p.className = "menu-pop";
    p.setAttribute("role", "menu");
    for (const entry of menus[i].items) {
      if (entry === "---") {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        sep.setAttribute("role", "separator");
        p.appendChild(sep);
        continue;
      }
      const b = document.createElement("button");
      b.className = "menu-item";
      b.disabled = entry.enabled ? !entry.enabled() : false;
      // Toggle (tem checked()) é menuitemcheckbox; ação simples é menuitem.
      if (entry.checked) {
        b.setAttribute("role", "menuitemcheckbox");
        b.setAttribute("aria-checked", String(entry.checked()));
      } else {
        b.setAttribute("role", "menuitem");
      }

      const check = document.createElement("span");
      check.className = "menu-check";
      check.textContent = entry.checked?.() ? "❧" : "";
      const label = document.createElement("span");
      label.className = "menu-label";
      label.textContent = typeof entry.label === "function" ? entry.label() : entry.label;
      const shortcut = document.createElement("span");
      shortcut.className = "menu-shortcut";
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
    if (openIdx !== null) {
      tops[openIdx].classList.remove("open");
      tops[openIdx].setAttribute("aria-expanded", "false");
    }
    openIdx = i;
    tops[i].classList.add("open");
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
    return pop ? [...pop.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")] : [];
  }

  function onDocKeyDown(e: KeyboardEvent): void {
    if (openIdx === null) return;
    if (e.key === "Escape") { closeAll(); return; }
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
      if (active instanceof HTMLButtonElement && active.classList.contains("menu-item")) {
        active.click();
        e.preventDefault();
      }
    }
  }

  menus.forEach((menu, i) => {
    const slot = document.createElement("span");
    slot.className = "menubar-slot";
    const top = document.createElement("button");
    top.className = "menubar-top";
    top.textContent = menu.label;
    top.setAttribute("aria-haspopup", "menu");
    top.setAttribute("aria-expanded", "false");
    top.addEventListener("click", () => {
      if (openIdx === i) closeAll();
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

  return { closeAll };
}
