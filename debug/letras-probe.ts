/** letras-probe.ts — harness de diagnóstico (NÃO faz parte do app): "Letras na pauta".
 *  Renderiza no Chromium real um canto com troca de clave (c4 → c3 → f3), aplica o
 *  overlay como o main.ts faz e despeja a estrutura. Query: ?theme=dark|light,
 *  ?off=1 (overlay desligado), ?inspect=1 (despeja ChantLine/StaffLine/clave por pauta),
 *  ?w=<largura da linha>, ?doc=<gabc>. */
import "parchment-design/parchment.css";
import "parchment-design/components.css";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "../src/ui/notker.css";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyTheme } from "../src/app/theme";
import { NabcLibEngine } from "../src/preview/nabc-lib";
import { legendVisible, toggleLegend, setLegendLetters } from "../src/gabc/staff-legend";
import { clefsBySyllable } from "../src/gabc/staff-letters";
import { drawStaffLetters, clearStaffLetters } from "../src/preview/staff-letters";

const qs = new URLSearchParams(location.search);
applyTheme(qs.get("theme") === "dark" ? "dark" : "light");
const dumpEl = document.getElementById("dump")!;
const DOC = qs.get("doc") ?? "name: t;\n%%\n(c4) Pu(g)er(h) na(ixhi)tus(h) est(g) no(hi)bis(h) et(g) fi(f)li(g)us(h) da(ixhi)tus(h) est(g) no(hi)bis(h.)(:) (c3) cu(e)ius(f) im(g)pe(h)ri(g)um(f) su(e)per(f) hu(g)me(h)rum(g) e(f)ius(e.)(:) (f3) et(f) vo(g)ca(h)bi(g)tur(f) no(g)men(h) e(g)ius(f.)(::)";

async function main(): Promise<void> {
  let on = !qs.get("off");
  const host = document.getElementById("preview")!;
  const view = new EditorView({ parent: document.getElementById("app")!, state: EditorState.create({ doc: DOC, extensions: [legendVisible] }) });
  view.dispatch({ effects: toggleLegend.of(true) });
  const refresh = () => {
    const svg = host.querySelector("svg");
    if (!on) { clearStaffLetters(svg); return; }
    const clefs = clefsBySyllable(DOC);
    drawStaffLetters(svg, (first) => (first == null ? null : clefs[Math.min(first, clefs.length - 1)]));
  };
  setLegendLetters({ on: () => on, toggle: () => { on = !on; host.classList.toggle("staff-letters-on", on); refresh(); view.dispatch({}); } });
  host.classList.toggle("staff-letters-on", on);
  view.dispatch({});
  // largura útil como o panel.ts calcula (padding real do #preview)
  const cs = getComputedStyle(host);
  const inner = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 4;
  const r = await new NabcLibEngine().render(DOC, { widthPx: Number(qs.get("w") ?? inner) });
  host.innerHTML = r.svg;
  refresh();
  const svg = host.querySelector("svg")!;
  const clefs = clefsBySyllable(DOC);
  const rows: string[] = [`svg.x=${Math.round(svg.getBoundingClientRect().left)} host.padL=${cs.paddingLeft} clefsBySyllable=${clefs.join(",")}`];
  for (const [i, l] of [...svg.querySelectorAll(".ChantLine")].entries()) {
    const ys = [...l.querySelectorAll(".ChantLineInner > line.StaffLine")].map((x) => `${x.getAttribute("y1")}@x1=${Math.round(Number(x.getAttribute("x1")))}`);
    const firstSyl = /syllable-(\d+)/.exec([...l.querySelectorAll('[class*="syllable-"]')][0]?.getAttribute("class") ?? "")?.[1];
    const letters = [...l.querySelectorAll("text.staff-letter")];
    const lb = letters.map((t) => t.getBoundingClientRect());
    const clefG = l.querySelector(".ChantLineInner > g.syllable:not([class*='syllable-'])")?.getBoundingClientRect();
    rows.push(`linha${i} t=${l.getAttribute("transform")} staff=[${ys.join(" ")}] 1ªsílaba=${firstSyl} clave=${l.querySelector("title")?.textContent?.replace(/.*clave /, "").replace(")", "")} ` +
      `letras=${letters.map((t) => t.firstChild?.nodeValue).join("")} letrasX=[${Math.round(Math.min(...lb.map((b) => b.left)))},${Math.round(Math.max(...lb.map((b) => b.right)))}] claveX=${clefG ? Math.round(clefG.left) : "?"} ` +
      `cor=${letters[0] ? getComputedStyle(letters[0]).fill : "-"}`);
  }
  if (qs.get("inspect")) { dumpEl.style.cssText = "display:block;position:fixed;right:0;bottom:0;max-width:60vw;background:#fff;color:#000;font:10px monospace;white-space:pre-wrap;z-index:9"; }
  dumpEl.textContent = rows.join("\n");
  document.title = "PROBE_DONE";
}
main().catch((e) => { dumpEl.textContent = "ERRO: " + (e?.stack || String(e)); document.title = "PROBE_ERR"; });
