// src/app/welcome.ts
/** Tela inicial (adendo §11, no estilo do Mocquereau), sem projeto aberto.
 *  Com recentes: marca "Notker" + Abrir…/Novo projeto (elevados), herói do mais recente
 *  (miniatura · título · data · primeiros cantos · Continuar) e até 3 cartões.
 *  Sem recentes: marca centralizada + 3 escolhas (Novo projeto com anel rubrica).
 *  Aviso de recuperação (§4.6) em `sc-note`. Texto do usuário SEMPRE por textContent. */
import { icon, type IconName } from "../ui/pd/icons";
import { type RecentEntry, recentTitle, formatRecentDate } from "./recent";

export const MAX_CARDS = 3;

export interface WelcomeHandlers {
  onNew(): void;
  onOpen(): void;
  onOpenRecent(path: string): void;
  onOpenExample(): void;
  onRecover(id: string): void;
  onDiscardRecovery(id: string): void;
}
/** Um retrato de sessão que caiu; `id` volta nos handlers (o mais recente primeiro). */
export interface RecoveryNotice { id: string; title: string }
export interface WelcomeState { recents: RecentEntry[]; recoveries: RecoveryNotice[]; now?: Date }
export interface WelcomeHandle {
  render(s: WelcomeState): void;
  /** Foca a ação principal (Continuar, ou Novo projeto sem recentes). */
  focus(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, cls: string, run: () => void, ic?: IconName): HTMLButtonElement {
  const b = el("button", cls);
  b.type = "button";
  if (ic) b.appendChild(icon(ic));
  b.appendChild(document.createTextNode(label));
  b.addEventListener("click", run);
  return b;
}

function thumb(e: RecentEntry): HTMLElement {
  const data = e.meta?.thumb;
  if (!data) {
    const d = el("div", "notker-thumb notker-thumb--empty");
    d.setAttribute("aria-hidden", "true");
    return d;
  }
  const img = el("img", "notker-thumb");
  img.alt = "";
  img.src = data;
  return img;
}

export function createWelcome(host: HTMLElement, h: WelcomeHandlers): WelcomeHandle {
  let primary: HTMLElement | null = null;

  function note(r: RecoveryNotice): HTMLElement {
    const p = el("p", "sc-note notker-recovery");
    p.setAttribute("role", "status");
    p.append(
      el("span", "notker-recovery__text", `“${r.title}” não foi salvo na última sessão.`),
      button("Descartar", "sc-btn", () => h.onDiscardRecovery(r.id)),
      button("Recuperar", "sc-btn notker-recovery__recover", () => h.onRecover(r.id)),
    );
    return p;
  }

  function startChoices(s: WelcomeState): HTMLElement {
    const start = el("div", "notker-start");
    for (const r of s.recoveries) start.appendChild(note(r));
    start.appendChild(el("h1", "notker-wordmark", "Notker"));
    const choices = el("div", "notker-choices");
    const main = button("Novo projeto", "notker-choice notker-choice--main", h.onNew, "plus");
    choices.append(
      main,
      button("Abrir…", "notker-choice", h.onOpen, "folder-open"),
      button("Projeto de exemplo", "notker-choice", h.onOpenExample, "book-open"),
    );
    start.appendChild(choices);
    primary = main;
    return start;
  }

  function hero(e: RecentEntry, now: Date): HTMLElement {
    const title = recentTitle(e);
    const sec = el("section", "notker-hero");
    sec.setAttribute("aria-label", title);
    const body = el("div", "notker-hero__body");
    body.appendChild(el("h2", "notker-hero__title", title));
    const date = e.meta ? formatRecentDate(e.meta.updatedAt, now) : "";
    if (date) body.appendChild(el("p", "notker-caption", date));
    const chants = e.meta?.chants ?? [];
    if (chants.length) {
      const ul = el("ul", "notker-hero__chants");
      for (const c of chants) ul.appendChild(el("li", undefined, c));
      body.appendChild(ul);
    }
    const actions = el("div", "notker-hero__actions");
    const cont = button("Continuar", "sc-btn sc-btn--filled", () => h.onOpenRecent(e.path));
    actions.appendChild(cont);
    body.appendChild(actions);
    sec.append(thumb(e), body);
    primary = cont;
    return sec;
  }

  function card(e: RecentEntry, now: Date): HTMLElement {
    const b = el("button", "notker-recent");
    b.type = "button";
    const text = el("span", "notker-recent__text");
    text.appendChild(el("span", "notker-recent__title", recentTitle(e)));
    const date = e.meta ? formatRecentDate(e.meta.updatedAt, now) : "";
    if (date) text.appendChild(el("span", "notker-caption", date));
    b.append(thumb(e), text);
    b.addEventListener("click", () => h.onOpenRecent(e.path));
    return b;
  }

  function render(s: WelcomeState): void {
    const now = s.now ?? new Date();
    const [latest, ...older] = s.recents;
    // O DOM é refeito: se o foco estava aqui dentro, ele volta à ação principal (senão cairia no body).
    const hadFocus = host.contains(document.activeElement);
    host.replaceChildren();
    if (!latest) { host.appendChild(startChoices(s)); if (hadFocus) primary?.focus(); return; }
    const wrap = el("div", "notker-welcome__wrap");
    const head = el("div", "notker-welcome__head");
    head.append(
      el("h1", "notker-wordmark", "Notker"),
      button("Abrir…", "sc-btn sc-btn--elevated", h.onOpen, "folder-open"),
      button("Novo projeto", "sc-btn sc-btn--elevated", h.onNew, "plus"),
    );
    wrap.appendChild(head);
    for (const r of s.recoveries) wrap.appendChild(note(r));
    wrap.appendChild(hero(latest, now));
    if (older.length) {
      const grid = el("div", "notker-recents");
      for (const e of older.slice(0, MAX_CARDS)) grid.appendChild(card(e, now));
      wrap.appendChild(grid);
    }
    host.appendChild(wrap);
    if (hadFocus) primary?.focus();
  }

  return { render, focus: () => primary?.focus() };
}
