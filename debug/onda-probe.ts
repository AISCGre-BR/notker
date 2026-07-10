/** onda-probe.ts — harness de diagnóstico (NÃO faz parte do app).
 *  Renderiza um canto multi-sistema num browser real (getBBox/getCTM funcionam,
 *  ao contrário do jsdom), monta notas reais da timeline, desenha as lanes
 *  (com marcadores, quebra nas pausas, alguns alargamentos e uma guia de hover
 *  simulada) e despeja coordenadas. Servido por vite em /debug/onda-probe.html. */
import { NabcLibEngine } from "../src/preview/nabc-lib";
import { readSyllableBoxes, mapSystems, renderWaveLanes, WAVE_SPREAD, WAVE_LINE_SPACING_PX, type NoteIdent } from "../src/preview/wave-lanes";
import { extractAll } from "../src/tuotilo/signs";
import { buildTimeline } from "../src/tuotilo/timeline";
import { computeTimedNotes } from "../src/tuotilo/duration";
import { DEFAULT_PROFILE } from "../src/tuotilo/profile";

const dumpEl = document.getElementById("dump")!;
const r = (n: number) => Math.round(n);

async function main(): Promise<void> {
  const qs = new URLSearchParams(location.search);
  // Defaults seguem as constantes de produção — passar ?spread=X&ls=Y p/ experimentar.
  const spread = Number(qs.get("spread") ?? WAVE_SPREAD);
  const lineSpacing = Number(qs.get("ls") ?? WAVE_LINE_SPACING_PX);
  const doc = await fetch("/samples/04-dies-sanctificatus.gabc").then((x) => x.text());
  const engine = new NabcLibEngine();
  const host = document.getElementById("preview")!;
  const res = await engine.render(doc, { widthPx: 680, extraLineSpacingPx: lineSpacing, horizontalSpreadFactor: spread });
  host.innerHTML = res.svg;
  const svg = host.querySelector("svg")! as SVGSVGElement;

  // Notas reais da timeline (espelha o rebuildWave do main).
  const map = res.sourceMap;
  const reals = map.filter((s) => s.syllableIndex >= 1);
  const syls = extractAll(doc, map);
  const tl = buildTimeline(syls);
  const base = computeTimedNotes(tl, DEFAULT_PROFILE, 12345, "interpretado");
  const notes: NoteIdent[] = base.notes.map((n, i) => ({
    syllableIndex: n.syllableIndex,
    realSyllableIndex: reals[n.syllableIndex]?.syllableIndex ?? (n.syllableIndex + 1),
    noteInSyllable: n.noteInSyllable,
    pitch: n.pitch, alt: n.alt,
    factor: i % 6 === 3 ? 1.7 : 1, // alguns alargados p/ mostrar espessura+halo
    divisioAfter: n.pauseAfterMs > 0
      ? (tl.divisiones.find((d) => d.afterNoteIdx === n.idx)?.kind ?? null)
      : null,
  }));

  const boxes = readSyllableBoxes(svg);
  const systems = mapSystems(notes, boxes);
  renderWaveLanes(svg, systems, {});

  // Hover simulado numa nota p/ mostrar a linha-guia + realce no screenshot.
  const hit = svg.querySelector<SVGRectElement>('.wave-hit[data-key="6:2"]')
    ?? svg.querySelector<SVGRectElement>(".wave-hit");
  hit?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

  dumpEl.textContent = JSON.stringify({
    nNotes: notes.length,
    nSystems: systems.length,
    nDots: svg.querySelectorAll(".wave-dot").length,
    nBreaks: notes.filter((n) => n.divisioAfter).length,
    systems: systems.map((s, i) =>
      `sys${i} yTop=${r(s.yTop)} yBaseline=${r(s.yBaseline)} notas=${s.notes.length}`),
  }, null, 1);
  document.title = "PROBE_DONE";
}

main().catch((e) => {
  dumpEl.textContent = "ERRO: " + (e?.stack || String(e));
  document.title = "PROBE_ERR";
});
