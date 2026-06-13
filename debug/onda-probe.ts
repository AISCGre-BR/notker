/** onda-probe.ts — harness de diagnóstico (NÃO faz parte do app).
 *  Renderiza um canto multi-sistema num browser real (getBBox/getCTM funcionam,
 *  ao contrário do jsdom), desenha as lanes e despeja as coordenadas reais.
 *  Servido por vite em /debug/onda-probe.html; capturado por chromium headless. */
import { NabcLibEngine } from "../src/preview/nabc-lib";
import { readSyllableBoxes, mapSystems, renderWaveLanes, type NoteIdent } from "../src/preview/wave-lanes";

const dumpEl = document.getElementById("dump")!;
const r = (n: number) => Math.round(n);

async function main(): Promise<void> {
  const doc = await fetch("/samples/04-dies-sanctificatus.gabc").then((x) => x.text());
  const engine = new NabcLibEngine();
  const host = document.getElementById("preview")!;
  const res = await engine.render(doc, { widthPx: 680, extraLineSpacingPx: 36 });
  host.innerHTML = res.svg;
  const svg = host.querySelector("svg")! as SVGSVGElement;

  const boxes = readSyllableBoxes(svg);
  const idxs = [...boxes.keys()].sort((a, b) => a - b);
  // 1 nota por sílaba real — suficiente p/ revelar a detecção de sistemas
  const notes: NoteIdent[] = idxs.map((idx) => ({
    syllableIndex: idx, realSyllableIndex: idx, noteInSyllable: 0,
    pitch: "f", alt: 0, factor: 1, divisioAfter: null,
  }));
  const systems = mapSystems(notes, boxes);
  renderWaveLanes(svg, systems, {});

  const dump = {
    nBoxes: [...boxes.values()].reduce((s, a) => s + a.length, 0),
    nSystems: systems.length,
    svgWidth: svg.getAttribute("width"),
    svgHeight: svg.getAttribute("height"),
    rootGroupTransform: svg.querySelector(".root-group")?.getAttribute("transform") ?? null,
    boxes: idxs.map((idx) => (boxes.get(idx) ?? []).map((b) =>
      `#${idx} x=${r(b.x)} y=${r(b.y)} w=${r(b.width)} h=${r(b.height)}`)).flat(),
    systems: systems.map((s, i) =>
      `sys${i} yBaseline=${r(s.yBaseline)} notas=${s.notes.length} xR=[${r(s.xRange[0])},${r(s.xRange[1])}]`),
  };
  dumpEl.textContent = JSON.stringify(dump, null, 1);
  document.title = "PROBE_DONE";
}

main().catch((e) => {
  dumpEl.textContent = "ERRO: " + (e?.stack || String(e));
  document.title = "PROBE_ERR";
});
