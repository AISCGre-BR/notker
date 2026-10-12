import { describe, it, expect } from "vitest";
import { pdfContextSettings, gabcBody, measureLines, isolateLine, lineExtent, glyphInkRight, SIDE_BLEED_PX } from "../src/pdf/render";
import { TEXT_FONT } from "../src/pdf/fonts";

/** SVG no formato do nabc-lib: fundo, root-group com 3 ChantLine, comentário. */
function chantSvg(): SVGSVGElement {
  document.body.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" class="gregorio-chant" width="100%" height="400">' +
    '<rect width="100%" height="100%" fill="#ffffff"></rect>' +
    '<g class="root-group">' +
    '<g class="ChantLine" transform="translate(0,26)"><text>A</text></g>' +
    '<g class="ChantLine" transform="translate(0,153)"><text>B</text></g>' +
    '<g class="ChantLine" transform="translate(0,280)"></g>' +
    "</g>" +
    '<text class="commentary" x="625" y="0"></text></svg>';
  return document.querySelector("svg")!;
}
const rect = (top: number, bottom: number) => () => ({ top, bottom, left: 0, right: 642, width: 642, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

describe("contexto do nabc-lib para o PDF", () => {
  it("largura, família, cor do nabc, serifa embutida, sem elementos interativos", () => {
    expect(pdfContextSettings({ family: "laon", widthPx: 642, red: true })).toEqual({
      lineWidthPx: 642, nabcMode: "laon", nabcColor: "red",
      lyricTextFont: TEXT_FONT, dropCapTextFont: TEXT_FONT, annotationTextFont: TEXT_FONT,
      renderInteractiveElements: false,
    });
    expect(pdfContextSettings({ family: "stgall", widthPx: 664, red: false })).toMatchObject({ nabcMode: "gall", nabcColor: "#000000", lineWidthPx: 664 });
  });
  it("gabcBody tira o cabeçalho (o nabc-lib desenharia name:/mode: como letra)", () => {
    expect(gabcBody("name: A;\nmode: 1;\n%%\n(c4) a(f)")).toBe("\n(c4) a(f)");
    expect(gabcBody("(c4) a(f)")).toBe("(c4) a(f)");
  });
});

describe("corte em pautas", () => {
  it("measureLines: caixa real de cada ChantLine relativa ao topo do SVG", () => {
    const svg = chantSvg();
    svg.getBoundingClientRect = rect(100, 500);
    const lines = svg.querySelectorAll<SVGGElement>("g.ChantLine");
    lines[0].getBoundingClientRect = rect(115, 246.5);   // letra abaixo do translate
    lines[1].getBoundingClientRect = rect(243.5, 368.3); // sobrepõe a de cima (neumas altos)
    lines[2].getBoundingClientRect = rect(0, 0);         // vazia
    const boxes = measureLines(svg);
    expect(boxes[0]).toMatchObject({ top: 15, height: 131.5 });
    expect(boxes[1].top).toBeCloseTo(143.5, 5);
    expect(boxes[1].height).toBeCloseTo(124.8, 5);
    expect(boxes[2].height).toBe(0);
  });
  it("isolateLine: clone só com a pauta pedida, sem fundo nem comentário, viewBox recortado", () => {
    const svg = chantSvg();
    const one = isolateLine(svg, 1, { top: 143.5, height: 124.8 }, 642);
    expect(one).not.toBe(svg);
    expect(one.querySelectorAll("g.ChantLine")).toHaveLength(1);
    expect(one.querySelector("g.ChantLine text")!.textContent).toBe("B");
    expect(one.querySelector(":scope > rect")).toBeNull();
    expect(one.querySelector(".commentary")).toBeNull();
    expect(one.getAttribute("viewBox")).toBe(`${-SIDE_BLEED_PX} 143.5 ${642 + 2 * SIDE_BLEED_PX} 124.8`);
    expect(one.getAttribute("width")).toBe(String(642 + 2 * SIDE_BLEED_PX));
    expect(one.getAttribute("height")).toBe("124.8");
    expect(svg.querySelectorAll("g.ChantLine")).toHaveLength(3); // o original não muda
  });
  it("isolateLine: tinta que passa da largura (custos) alarga o viewBox dos dois lados", () => {
    const svg = chantSvg();
    const right = isolateLine(svg, 1, { top: 143.5, height: 124.8, left: 0, right: 660 }, 642);
    expect(right.getAttribute("viewBox")).toBe(`${-SIDE_BLEED_PX} 143.5 ${660 + SIDE_BLEED_PX + SIDE_BLEED_PX} 124.8`);
    expect(right.getAttribute("width")).toBe(String(660 + 2 * SIDE_BLEED_PX));
    const left = isolateLine(svg, 1, { top: 0, height: 10, left: -9, right: 640 }, 642);
    expect(left.getAttribute("viewBox")).toBe(`-11 0 ${642 + SIDE_BLEED_PX + 11} 10`);
  });
  it("measureLines: devolve também a caixa horizontal; lineExtent dá o x e a largura do recorte", () => {
    const svg = chantSvg();
    svg.getBoundingClientRect = rect(100, 500);
    const g0 = svg.querySelector<SVGGElement>("g.ChantLine")!;
    g0.getBoundingClientRect = () => ({ top: 115, bottom: 200, left: 30, right: 700, width: 670, height: 85, x: 30, y: 115, toJSON: () => ({}) }) as DOMRect;
    svg.getBoundingClientRect = () => ({ top: 100, bottom: 500, left: 20, right: 700, width: 680, height: 400, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect;
    const b = measureLines(svg)[0];
    expect(b.left).toBe(10);
    expect(b.right).toBe(680);
    expect(lineExtent(b, 642)).toEqual({ x: -SIDE_BLEED_PX, width: 680 + 2 * SIDE_BLEED_PX });
    expect(lineExtent({ top: 0, height: 1 }, 642)).toEqual({ x: -SIDE_BLEED_PX, width: 642 + 2 * SIDE_BLEED_PX });
  });
  it("glyphInkRight: a tinta da glifo (canvas) pode passar do avanço — custos —, conforme o text-anchor", () => {
    expect(glyphInkRight("start", 100, 104, 9)).toBe(109);
    expect(glyphInkRight("end", 96, 104, 3)).toBe(107);
    expect(glyphInkRight("middle", 100, 104, 7)).toBe(109);
  });
  it("isolateLine: letra do ℣/℟/A/ (tspan filho sem fonte dentro de greextra) ganha a serifa embutida", () => {
    const svg = chantSvg();
    const line = svg.querySelectorAll("g.ChantLine")[1];
    const NS = "http://www.w3.org/2000/svg";
    line.innerHTML = "";
    const t = document.createElementNS(NS, "text");
    const outer = document.createElementNS(NS, "tspan");
    outer.setAttribute("font-family", "greextra");
    const inner = document.createElementNS(NS, "tspan");
    inner.textContent = "V";
    const bar = document.createElementNS(NS, "tspan");
    bar.setAttribute("font-family", "greextra");
    bar.textContent = "\uE041";
    outer.append(inner, bar);
    const plain = document.createElementNS(NS, "tspan");
    plain.setAttribute("font-family", "greextra");
    const sub = document.createElementNS(NS, "tspan");
    sub.textContent = "\uE000"; // sem letra latina: não mexe
    plain.appendChild(sub);
    t.append(outer, plain);
    line.appendChild(t);
    const one = isolateLine(svg, 1, { top: 0, height: 10 }, 642);
    const tsp = one.querySelectorAll("tspan");
    expect(tsp[1].getAttribute("font-family")).toBe(TEXT_FONT); // o "V"
    expect(tsp[2].getAttribute("font-family")).toBe("greextra"); // a barra segue em greextra
    expect(tsp[0].getAttribute("font-family")).toBe("greextra");
    expect(tsp[4].getAttribute("font-family")).toBeNull();
    expect(svg.querySelectorAll("tspan")[1].getAttribute("font-family")).toBeNull(); // original intacto
  });
});
