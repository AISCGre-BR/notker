/** welcome-probe.ts — harness da tela inicial e do guia de novo projeto (NÃO faz parte do
 *  app; sem Tauri). Query: ?theme=dark|light · ?empty=1 (sem recentes) · ?recovery=1 ·
 *  ?nothumb=1 (recentes sem miniatura) · ?guide=1|2|3 (passo atual do guia) · ?menu=1
 *  (Arquivo ▸ Abrir recente aberto; com ?norecent=1 mostra "Nenhum recente") · ?dump=1 (contraste e geometria no <pre id="dump">).
 *  Gera a miniatura REAL (nabc-lib → canvas → JPEG) do 04-dies-sanctificatus.
 *  Fim: document.title = "PROBE_DONE" (ou "PROBE_ERROR …"). */
import "parchment-design/parchment.css";
import "parchment-design/components.css";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "../src/ui/notker.css";
import { applyTheme } from "../src/app/theme";
import { setScreen } from "../src/app/screen";
import { createRegistry } from "../src/app/commands";
import { createMenubar } from "../src/ui/menubar";
import { createWelcome } from "../src/app/welcome";
import { mountNewProjectGuide } from "../src/app/new-project-guide";
import { scoreThumbnail } from "../src/app/thumbnail";
import type { RecentEntry } from "../src/app/recent";
import { createContrastChecker } from "./contrast";
import { setLocale, isLocale, t } from "../src/i18n";
const __lang = new URLSearchParams(location.search).get("lang");
if (isLocale(__lang)) { setLocale(__lang); document.documentElement.lang = __lang; }

const qs = new URLSearchParams(location.search);
applyTheme(qs.get("theme") === "dark" ? "dark" : "light");
const noop = () => {};

async function main(): Promise<void> {
  const commands = createRegistry();
  commands.register([{ id: "file.open", label: t("cmd.file.open"), run: noop, keys: ["Ctrl+O"] }]);
  const menubar = createMenubar(document.querySelector<HTMLElement>("#menubar")!, commands, [
    { label: t("menu.file"), items: [
      { cmd: "file.open", label: t("cmd.file.open"), shortcut: "Ctrl+O" },
      { label: t("menu.openRecent"), submenu: () => qs.get("norecent") ? [{ label: t("menu.noRecent"), run: noop, enabled: false }] : [
        { label: "Missa de Natal", caption: "Missas", run: noop },
        { label: "Vigília Pascal", caption: "Missas", run: noop },
        "---", { label: t("cmd.file.clearRecents"), run: noop },
      ] },
    ] },
    { label: t("menu.edit"), items: [] }, { label: t("menu.view"), items: [] }, { label: t("menu.help"), items: [] },
  ]);
  const rows: string[] = [];
  const gabc = await fetch("/samples/04-dies-sanctificatus.gabc").then((r) => r.text());
  const thumb = qs.get("nothumb") ? undefined : await scoreThumbnail(gabc);
  rows.push(qs.get("nothumb") ? "thumb: (desligada)" : thumb ? `thumb: ok ${thumb.length} bytes` : "thumb: NENHUMA");
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const recents: RecentEntry[] = qs.get("empty") ? [] : [
    { path: "/home/g/Missas/Natal.notker", meta: { title: "Missa de Natal", updatedAt: day(0), chants: ["Puer natus est", "Viderunt omnes", "Dies sanctificatus", "Tui sunt caeli", "Viderunt omnes (Communio)"], thumb } },
    { path: "/home/g/Missas/Pascoa.notker", meta: { title: "Vigília Pascal", updatedAt: day(3), chants: [], thumb } },
    { path: "/home/g/Oficio/Laudes.notker", meta: { title: "Laudes de domingo", updatedAt: day(40), chants: [] } },
    { path: "/home/g/x/Kyrie.notker", meta: { title: "Kyrie XI — Orbis factor", updatedAt: day(400), chants: [] } },
  ];
  const step = Number(qs.get("guide") ?? 0);
  if (step) {
    setScreen("guide");
    menubar.setTitle(t("landmark.newProject"));
    const g = mountNewProjectGuide(document.querySelector<HTMLElement>("#guide-host")!,
      { onCreate: noop, onCancel: noop, confirmDiscard: async () => false, pickGabc: async () => null },
      { title: "Missa de Natal", family: "laon", chantName: "Puer natus est", office: "Introitus", gabc: "" });
    for (let i = 1; i < step; i++) document.querySelector<HTMLButtonElement>(".notker-step.is-current .sc-btn--filled")!.click();
    g.focus();
  } else {
    setScreen("welcome");
    menubar.setTitle("Notker");
    createWelcome(document.querySelector<HTMLElement>("#welcome-host")!, {
      onNew: noop, onOpen: noop, onOpenRecent: noop, onOpenExample: noop, onRecover: noop, onDiscardRecovery: noop,
    }).render({ recents, recoveries: qs.get("recovery") === "2" ? [{ id: "current", title: "Missa de Natal" }, { id: "prev", title: "Vésperas de Páscoa" }] : qs.get("recovery") ? [{ id: "current", title: "Missa de Natal" }] : [] });
  }
  if (qs.get("menu")) {
    document.querySelector<HTMLElement>(".sc-menubar__top")!.click();
    document.querySelectorAll<HTMLElement>(".sc-menu__item")[1].click();
  }
  await document.fonts.ready;
  const c = createContrastChecker();
  const q = (s: string) => document.querySelector(s);
  c.check("menubar: título", q(".sc-menubar__title"));
  c.check("marca Notker", q(".notker-wordmark"));
  c.check("herói: título", q(".notker-hero__title"));
  c.check("herói: data", q(".notker-hero .notker-caption"));
  c.check("herói: canto", q(".notker-hero__chants li"));
  c.check("Continuar / Criar (preenchido)", q(".sc-btn--filled"));
  c.check("cabeçalho: Abrir… (elevado)", q(".notker-welcome__head .sc-btn--elevated"));
  c.check("cartão: título", q(".notker-recent__title"));
  c.check("cartão: data", q(".notker-recent .notker-caption"));
  c.check("escolha: rótulo", q(".notker-choice"));
  c.check("aviso de recuperação", q(".notker-recovery__text"));
  c.check("aviso: Recuperar", q(".notker-recovery__recover"));
  c.check("passo: rótulo atual", q(".notker-step.is-current .notker-step__label"));
  c.check("passo: rótulo futuro", q(".notker-step.is-todo .notker-step__label"));
  // (o círculo atual tem fundo em GRADIENTE rubrica: o medidor só lê background-color;
  //  o par on-rubric/rubric é o mesmo do botão preenchido, medido acima)
  c.check("passo: número futuro", q(".notker-step.is-todo .notker-step__circle"));
  c.check("passo: ✓ feito", q(".notker-step.is-done .notker-step__circle"));
  c.check("passo: resumo", q(".notker-step__summary"));
  c.check("passo: Alterar", q(".notker-step__change"));
  c.check("passo: dica", q(".notker-step__hint"));
  c.check("submenu: item", q(".notker-submenu .sc-menu__item"));
  c.check("submenu: legenda", q(".notker-submenu .sc-menu__kbd:not(:empty)"));
  const box = (s: string) => { const r = q(s)?.getBoundingClientRect(); return r ? `${Math.round(r.width)}×${Math.round(r.height)}` : "-"; };
  rows.push(...c.rows);
  rows.push(`geom: marca=${q(".notker-wordmark") ? getComputedStyle(q(".notker-wordmark")!).fontSize : "-"} herói=${box(".notker-hero")} cartão=${box(".notker-recent")} escolha=${box(".notker-choice")} guia=${box(".notker-guide__card")} círculo=${box(".notker-step__circle")} toolbar=${box("#toolbar")} filled=${document.querySelectorAll(".sc-btn--filled").length}`);
  rows.push(`FALHAS: ${c.fails()}`);
  const dump = document.getElementById("dump")!;
  dump.textContent = rows.join("\n");
  if (qs.get("dump")) dump.style.cssText = "display:block;position:fixed;inset:40px;z-index:9999;background:#fff;color:#000;font:12px monospace;padding:12px;overflow:auto";
  console.log(rows.join("\n"));
  document.title = "PROBE_DONE";
}
main().catch((e) => { document.title = "PROBE_ERROR " + String(e); console.error(e); });
