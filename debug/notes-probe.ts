/** notes-probe.ts — diagnóstico: posições reais por glifo/nota no modelo do nabc-lib
 *  vs. DOM (getBBox). Não faz parte do app. */
import * as lib from "@testneumz/nabc-lib";
import { NabcLibEngine } from "../src/preview/nabc-lib";
import { WAVE_SPREAD, WAVE_LINE_SPACING_PX } from "../src/preview/wave-lanes";
const dumpEl = document.getElementById("dump")!;
let renderer: any = null;
const proto = (lib as any).GregorianChantSVGRenderer.prototype;
const orig = proto.renderSvg;
proto.renderSvg = function (score: unknown) { renderer = this; return orig.call(this, score); };
async function main() {
  const doc = await fetch("/samples/" + (new URLSearchParams(location.search).get("sample") ?? "04-dies-sanctificatus.gabc")).then((x) => x.text());
  const res = await new NabcLibEngine().render(doc, { widthPx: 680, extraLineSpacingPx: WAVE_LINE_SPACING_PX, horizontalSpreadFactor: WAVE_SPREAD });
  document.getElementById("preview")!.innerHTML = res.svg;
  const out: any[] = [];
  renderer.lines.forEach((line: any, li: number) => {
    (line._syllables ?? []).forEach((syl: any) => {
      (syl.segments ?? []).forEach((seg: any, si: number) => {
        (seg.visualizers ?? []).forEach((v: any) => {
          out.push({ li, syl: syl.index, si, t: v.constructor.name, g: v._glyph?.name, nk: v.notes?.map((n: any) => Object.keys(n).join(',')).slice(0,1), shape: v.notes?.map((n: any) => n.shape ?? n.type), lb: [line.bounds?.x, line.bounds?.y], sb: [syl.bounds?.x], gb: [seg.bounds?.x], vb: [v.bounds?.x, v.bounds?.width], n: v.notes?.map((n: any) => n.pitch ?? n.pitchLetter ?? Object.keys(n).join(",")) });
        });
      });
    });
  });
  dumpEl.textContent = JSON.stringify(out);
  document.title = "PROBE_DONE";
}
main().catch((e) => { dumpEl.textContent = "ERRO: " + (e?.stack || String(e)); document.title = "PROBE_ERR"; });
