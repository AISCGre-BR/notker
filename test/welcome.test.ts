// test/welcome.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWelcome, type WelcomeHandlers } from "../src/app/welcome";
import type { RecentEntry } from "../src/app/recent";

const NOW = new Date(2026, 9, 10, 12);
const JPG = "data:image/jpeg;base64,AAAA";
const entry = (n: number, extra: Partial<NonNullable<RecentEntry["meta"]>> = {}): RecentEntry => ({
  path: `/m/p${n}.notker`,
  meta: { title: `Projeto ${n}`, updatedAt: new Date(2026, 3, 20 + n, 12).toISOString(), chants: [], ...extra },
});

let host: HTMLElement;
let h: { [K in keyof WelcomeHandlers]: ReturnType<typeof vi.fn> };
beforeEach(() => {
  document.body.innerHTML = '<section id="welcome-host"></section>';
  host = document.getElementById("welcome-host")!;
  h = { onNew: vi.fn(), onOpen: vi.fn(), onOpenRecent: vi.fn(), onOpenExample: vi.fn(), onRecover: vi.fn(), onDiscardRecovery: vi.fn() };
});
const mount = () => createWelcome(host, h as unknown as WelcomeHandlers);
const texts = (sel: string) => [...host.querySelectorAll(sel)].map((e) => e.textContent);

describe("tela inicial sem recentes", () => {
  it("marca centralizada e 3 escolhas; Novo projeto com anel rubrica", () => {
    mount().render({ recents: [], recovery: null, now: NOW });
    expect(host.querySelector(".notker-start .notker-wordmark")!.textContent).toBe("Notker");
    expect(texts(".notker-choice")).toEqual(["Novo projeto", "Abrir…", "Projeto de exemplo"]);
    const choices = host.querySelectorAll<HTMLButtonElement>(".notker-choice");
    expect(choices[0].classList.contains("notker-choice--main")).toBe(true);
    expect([...choices].every((c) => c.querySelector("svg"))).toBe(true);
    expect(host.querySelector(".notker-hero")).toBeNull();
    choices[0].click(); choices[1].click(); choices[2].click();
    expect(h.onNew).toHaveBeenCalledTimes(1);
    expect(h.onOpen).toHaveBeenCalledTimes(1);
    expect(h.onOpenExample).toHaveBeenCalledTimes(1);
  });
  it("focus() vai para Novo projeto", () => {
    const w = mount();
    w.render({ recents: [], recovery: null });
    w.focus();
    expect(document.activeElement?.textContent).toBe("Novo projeto");
  });
});

describe("tela inicial com recentes", () => {
  it("cabeçalho: marca + Abrir… e Novo projeto elevados com ícone", () => {
    mount().render({ recents: [entry(1)], recovery: null, now: NOW });
    expect(host.querySelector(".notker-welcome__head .notker-wordmark")!.textContent).toBe("Notker");
    const btns = [...host.querySelectorAll<HTMLButtonElement>(".notker-welcome__head button")];
    expect(btns.map((b) => b.textContent)).toEqual(["Abrir…", "Novo projeto"]);
    expect(btns.every((b) => b.classList.contains("sc-btn--elevated") && b.querySelector("svg"))).toBe(true);
    btns[0].click(); btns[1].click();
    expect(h.onOpen).toHaveBeenCalled();
    expect(h.onNew).toHaveBeenCalled();
  });
  it("herói do mais recente: título, data, primeiros cantos e Continuar (única ação preenchida)", () => {
    const w = mount();
    w.render({ recents: [entry(1, { chants: ["Puer natus est", "Viderunt omnes"], thumb: JPG }), entry(2)], recovery: null, now: NOW });
    const hero = host.querySelector(".notker-hero")!;
    expect(hero.getAttribute("aria-label")).toBe("Projeto 1");
    expect(hero.querySelector(".notker-hero__title")!.textContent).toBe("Projeto 1");
    expect(hero.querySelector(".notker-caption")!.textContent).toBe("21 de abril");
    expect(texts(".notker-hero__chants li")).toEqual(["Puer natus est", "Viderunt omnes"]);
    expect(hero.querySelector<HTMLImageElement>("img.notker-thumb")!.src).toBe(JPG);
    expect(host.querySelectorAll(".sc-btn--filled")).toHaveLength(1);
    host.querySelector<HTMLButtonElement>(".sc-btn--filled")!.click();
    expect(h.onOpenRecent).toHaveBeenCalledWith("/m/p1.notker");
    w.focus();
    expect(document.activeElement?.textContent).toBe("Continuar");
  });
  it("até 3 cartões com os seguintes; clique abre; sem miniatura = retângulo vazio", () => {
    mount().render({ recents: [1, 2, 3, 4, 5].map((n) => entry(n)), recovery: null, now: NOW });
    const cards = host.querySelectorAll<HTMLButtonElement>(".notker-recent");
    expect([...cards].map((c) => c.querySelector(".notker-recent__title")!.textContent)).toEqual(["Projeto 2", "Projeto 3", "Projeto 4"]);
    expect(cards[0].querySelector(".notker-caption")!.textContent).toBe("22 de abril");
    expect(cards[0].querySelector(".notker-thumb--empty")).not.toBeNull();
    cards[2].click();
    expect(h.onOpenRecent).toHaveBeenCalledWith("/m/p4.notker");
  });
  it("um só recente: sem fileira de cartões; sem meta: nome do arquivo e sem data", () => {
    mount().render({ recents: [{ path: "/x/Vésperas.notker" }], recovery: null, now: NOW });
    expect(host.querySelector(".notker-recents")).toBeNull();
    expect(host.querySelector(".notker-hero__title")!.textContent).toBe("Vésperas");
    expect(host.querySelector(".notker-hero .notker-caption")).toBeNull();
  });
  it("renderizar de novo substitui (sem duplicar)", () => {
    const w = mount();
    w.render({ recents: [entry(1)], recovery: null, now: NOW });
    w.render({ recents: [entry(1)], recovery: null, now: NOW });
    expect(host.querySelectorAll(".notker-hero")).toHaveLength(1);
  });
});

describe("aviso de recuperação e segurança do texto", () => {
  it("aparece nas duas telas, com Descartar e Recuperar", () => {
    const w = mount();
    for (const recents of [[], [entry(1)]]) {
      w.render({ recents, recovery: { title: "Missa de Natal" }, now: NOW });
      const n = host.querySelector(".sc-note.notker-recovery")!;
      expect(n.querySelector(".notker-recovery__text")!.textContent).toBe("“Missa de Natal” não foi salvo na última sessão.");
      const [d, r] = [...n.querySelectorAll<HTMLButtonElement>("button")];
      expect([d.textContent, r.textContent]).toEqual(["Descartar", "Recuperar"]);
      d.click(); r.click();
    }
    expect(h.onDiscardRecovery).toHaveBeenCalledTimes(2);
    expect(h.onRecover).toHaveBeenCalledTimes(2);
  });
  it("títulos com marcação aparecem literais (nada de HTML do usuário)", () => {
    const evil = '<img src=x onerror="alert(1)">';
    mount().render({ recents: [entry(1, { title: evil, chants: [evil] }), entry(2, { title: evil })], recovery: { title: evil }, now: NOW });
    expect(host.querySelector(".notker-hero__title")!.textContent).toBe(evil);
    expect(host.querySelector(".notker-hero__chants li")!.textContent).toBe(evil);
    expect(host.querySelector(".notker-recent__title")!.textContent).toBe(evil);
    expect(host.querySelectorAll("img:not(.notker-thumb)")).toHaveLength(0);
  });
});
