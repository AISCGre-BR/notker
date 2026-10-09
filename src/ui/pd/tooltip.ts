/** Tooltip do Notker (como o do Mocquereau): atraso 500 ms, tinta sobre pergaminho,
 *  atalho em sc-num; some ao clicar. Delegado por `data-tip` (o texto é lido na hora
 *  de mostrar, então rótulos dinâmicos ficam certos). Host PRÉ-EXISTENTE (WebKitGTK). */
const DELAY = 500;

export function installTooltips(host: HTMLElement, root: Document | HTMLElement = document): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: HTMLElement | null = null;

  const hide = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    current = null;
    host.style.display = "none";
    host.textContent = "";
  };
  const show = (el: HTMLElement) => {
    const tip = el.dataset.tip;
    if (!tip) return;
    host.textContent = "";
    const m = /^(.*?)\s*\(([^()]+)\)$/.exec(tip);
    const text = document.createElement("span");
    text.textContent = m ? m[1] : tip;
    host.appendChild(text);
    if (m) {
      const k = document.createElement("span");
      k.className = "sc-num notker-tip__kbd";
      k.textContent = m[2];
      host.appendChild(k);
    }
    host.style.display = "block";
    const r = el.getBoundingClientRect();
    const h = host.offsetHeight || 24;
    const below = r.bottom + 6 + h <= window.innerHeight;
    host.style.left = `${Math.max(4, Math.min(window.innerWidth - (host.offsetWidth || 120) - 4, r.left + r.width / 2 - (host.offsetWidth || 0) / 2))}px`;
    host.style.top = `${below ? r.bottom + 6 : r.top - h - 6}px`;
  };
  const target = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tip]") : null);

  const onOver = (e: Event) => {
    const el = target(e);
    if (!el || el === current) return;
    hide();
    current = el;
    timer = setTimeout(() => { timer = null; if (current === el) show(el); }, DELAY);
  };
  const onOut = (e: Event) => {
    const el = target(e);
    const to = (e as PointerEvent).relatedTarget;
    if (el && to instanceof Node && el.contains(to)) return;
    hide();
  };
  const onFocus = (e: Event) => {
    const el = target(e);
    if (el && el.matches(":focus-visible")) { hide(); current = el; show(el); }
  };
  const onKey = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") hide(); };

  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointerout", onOut);
  root.addEventListener("pointerdown", hide);
  root.addEventListener("focusin", onFocus);
  root.addEventListener("focusout", hide);
  root.addEventListener("keydown", onKey);
  window.addEventListener("scroll", hide, true);
  return () => {
    hide();
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointerout", onOut);
    root.removeEventListener("pointerdown", hide);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("focusout", hide);
    root.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", hide, true);
  };
}
