import type { Commands } from "../app/commands";

/** Barra de menus estilo MuseScore/Office (spec B). Rótulos e checks são
 *  FUNÇÕES reavaliadas a cada abertura — o dropdown é reconstruído na hora,
 *  então o estado exibido é sempre o atual, sem eventos de sincronização. */
export type MenuEntry = MenuItem | SubmenuSpec | "---";
export interface MenuItem {
  cmd: string;
  label: string | (() => string);
  shortcut?: string;
  checked?: () => boolean;
  enabled?: () => boolean;
}
/** Item de submenu montado na hora (ex.: um projeto recente): roda direto, sem registro. */
export interface SubmenuEntry { label: string; caption?: string; run: () => void; enabled?: boolean }
/** Item que abre um submenu à direita ("Abrir recente ▸"); itens reavaliados a cada abertura. */
export interface SubmenuSpec { label: string; submenu: () => (SubmenuEntry | "---")[] }
export interface MenuSpec { label: string; items: MenuEntry[]; }

export function createMenubar(
  host: HTMLElement, commands: Commands, menus: MenuSpec[], opts?: { brand?: string },
): { closeAll(): void; setTitle(title: string, edited?: boolean): void; destroy(): void } {
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

  // Submenu aberto (filho do dropdown, removido junto com ele) e o item que o abriu.
  let sub: HTMLElement | null = null;
  let subParent: HTMLButtonElement | null = null;
  const firstItem = (m: HTMLElement) => m.querySelector<HTMLButtonElement>(".sc-menu__item:not(:disabled)");
  function closeSub(focusParent = false): void {
    sub?.remove();
    sub = null;
    if (subParent) {
      subParent.setAttribute("aria-expanded", "false");
      if (focusParent) subParent.focus();
    }
    subParent = null;
  }
  function openSub(parent: HTMLButtonElement, spec: SubmenuSpec, focusFirst: boolean): void {
    if (subParent === parent && sub) { if (focusFirst) firstItem(sub)?.focus(); return; }
    closeSub();
    const m = document.createElement("div");
    m.className = "sc-menu notker-submenu";
    m.setAttribute("role", "menu");
    m.setAttribute("aria-label", spec.label);
    m.style.position = "absolute";
    m.style.left = "100%";
    m.style.top = `${parent.offsetTop - 5}px`;
    for (const it of spec.submenu()) {
      if (it === "---") {
        const sep = document.createElement("div");
        sep.className = "sc-menu__sep";
        sep.setAttribute("role", "separator");
        m.appendChild(sep);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sc-menu__item";
      b.setAttribute("role", "menuitem");
      b.disabled = it.enabled === false;
      const check = document.createElement("span");
      check.className = "sc-menu__check";
      const label = document.createElement("span");
      label.textContent = it.label;
      const cap = document.createElement("span");
      cap.className = "sc-menu__kbd";
      cap.textContent = it.caption ?? "";
      b.append(check, label, cap);
      b.addEventListener("click", () => { if (b.disabled) return; closeAll(true); it.run(); });
      m.appendChild(b);
    }
    parent.parentElement!.appendChild(m);
    sub = m;
    subParent = parent;
    parent.setAttribute("aria-expanded", "true");
    if (focusFirst) firstItem(m)?.focus();
  }
  function buildSubParent(spec: SubmenuSpec): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "sc-menu__item";
    b.setAttribute("role", "menuitem");
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    const check = document.createElement("span");
    check.className = "sc-menu__check";
    const label = document.createElement("span");
    label.textContent = spec.label;
    const arrow = document.createElement("span");
    arrow.className = "sc-menu__kbd";
    arrow.textContent = "▸";
    b.append(check, label, arrow);
    b.addEventListener("click", () => openSub(b, spec, true));
    b.addEventListener("mouseenter", () => openSub(b, spec, false));
    return b;
  }

  function closeAll(restore = false): void {
    closeSub();
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
    commands.run(item.cmd).catch((e) => console.error(`[notker] comando "${item.cmd}" falhou:`, e));
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
      if ("submenu" in entry) { p.appendChild(buildSubParent(entry)); continue; }
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
      b.addEventListener("mouseenter", () => closeSub());
      p.appendChild(b);
    }
    return p;
  }

  function openMenu(i: number): void {
    closeSub();
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

  /** Itens do nível com o foco: o submenu, se o foco está nele; senão o dropdown. */
  function enabledItems(): HTMLButtonElement[] {
    const scope = sub && sub.contains(document.activeElement) ? sub : pop;
    return scope ? [...scope.querySelectorAll<HTMLButtonElement>(":scope > .sc-menu__item:not(:disabled)")] : [];
  }

  function onDocKeyDown(e: KeyboardEvent): void {
    if (openIdx === null) return;
    const active = document.activeElement;
    const inSub = !!sub && sub.contains(active);
    if (e.key === "Escape") {
      if (sub) { e.preventDefault(); closeSub(true); return; } // 1º Esc fecha só o submenu
      closeAll(true);
      return;
    }
    if (e.key === "ArrowRight" && !inSub && active instanceof HTMLButtonElement
      && active.getAttribute("aria-haspopup") === "menu" && pop?.contains(active)) {
      e.preventDefault();
      active.click(); // abre o submenu e foca o 1º item
      return;
    }
    if (e.key === "ArrowLeft" && inSub) { e.preventDefault(); closeSub(true); return; }
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
    slot.style.position = "relative"; // ancora o dropdown absoluto
    const top = document.createElement("button");
    top.className = "sc-menubar__top";
    top.textContent = menu.label;
    top.setAttribute("aria-haspopup", "menu");
    top.setAttribute("aria-expanded", "false");
    // Antes de o foco mover para o botão (mouse), guarda quem o tinha.
    top.addEventListener("mousedown", rememberFocus);
    top.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || openIdx !== null) return;
      e.preventDefault();
      if (returnFocus) restoreFocus(); else top.blur();
    });
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

  // Alt sozinho (keydown+keyup sem outra tecla no meio) foca o 1º menu; com
  // um menu aberto, fecha-o e devolve o foco.
  const ac = new AbortController();
  const { signal } = ac;
  let altAlone = false;
  const inField = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey && !inField(e.target);
  }, { capture: true, signal });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && altAlone) {
      altAlone = false;
      e.preventDefault();
      if (openIdx !== null) { closeAll(true); return; }
      rememberFocus();
      tops[0]?.focus();
    }
    altAlone = false;
  }, { capture: true, signal });

  window.addEventListener("blur", () => { altAlone = false; }, { signal });

  return {
    closeAll: () => closeAll(),
    setTitle,
    destroy: () => { ac.abort(); closeAll(); bar.remove(); },
  };
}
