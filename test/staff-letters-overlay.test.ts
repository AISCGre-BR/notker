// test/staff-letters-overlay.test.ts — Task 4: overlay das letras sobre um SVG falso
// com a MESMA estrutura do nabc-lib (medida no Chromium: g.ChantLine > g.ChantLineInner >
// 4 × line.StaffLine com y1 = 0 / 16.32 / 32.64 / 48.96, de cima para baixo).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setLocale } from "../src/i18n";
import { drawStaffLetters, clearStaffLetters, STAFF_LETTERS_GAP, STAFF_LETTERS_STAGGER } from "../src/preview/staff-letters";

const NS = "http://www.w3.org/2000/svg";
function chantLine(ty: number, firstSyl: number | null, x1 = 0): string {
  const ls = [0, 16.32, 32.64, 48.96]
    .map((y) => `<line x1="${x1}" y1="${y}" x2="560" y2="${y}" class="StaffLine"></line>`).join("");
  const syl = firstSyl == null ? "" : `<g class="syllable syllable-${firstSyl}" transform="translate(90,0)"></g><g class="syllable syllable-${firstSyl + 1}"></g>`;
  return `<g class="ChantLine" transform="translate(0,${ty})"><g class="ChantLineInner">` +
    `<text>X</text>${ls}<g class="syllable" transform="translate(0,0)"></g>${syl}</g></g>`;
}
function fakeSvg(): SVGSVGElement {
  document.body.innerHTML =
    `<div id="preview"><svg xmlns="${NS}" class="gregorio-chant" width="100%" height="300">` +
    `<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"></rect>` +
    `<g class="root-group" transform="translate(0, 18.84)">` +
    chantLine(0, 1, 68.2) + chantLine(100.3, 15) + chantLine(200.6, 31) +
    `</g></svg></div>`;
  return document.querySelector("svg")!;
}

describe("drawStaffLetters", () => {
  let svg: SVGSVGElement;
  beforeEach(() => { svg = fakeSvg(); });

  it("desenha 7 letras por pauta, no sistema de coordenadas de cada ChantLineInner", () => {
    const n = drawStaffLetters(svg, () => "c4");
    expect(n).toBe(3);
    const inners = svg.querySelectorAll(".ChantLineInner");
    inners.forEach((inner) => {
      const g = inner.querySelector(":scope > g.staff-letters");
      expect(g).not.toBeNull();
      expect(g!.getAttribute("aria-hidden")).toBe("true");
      const texts = [...g!.querySelectorAll("text.staff-letter")];
      expect(texts.map((t) => t.firstChild?.nodeValue)).toEqual(["d", "e", "f", "g", "h", "i", "j"]);
    });
  });

  it("y = centro da linha/espaço (linha de baixo = d em 48.96; espaço e = 40.8; j = 0)", () => {
    drawStaffLetters(svg, () => "c4");
    const texts = [...svg.querySelectorAll(".ChantLineInner")[1].querySelectorAll("text.staff-letter")];
    const ys = texts.map((t) => Number(t.getAttribute("y")));
    [48.96, 40.8, 32.64, 24.48, 16.32, 8.16, 0].forEach((y, i) => expect(ys[i]).toBeCloseTo(y, 2));
    expect(texts[0].classList.contains("staff-letter--line")).toBe(true);
    expect(texts[1].classList.contains("staff-letter--space")).toBe(true);
  });

  it("fica num gutter À ESQUERDA do SVG (x negativo, ancorado no fim): não cobre clave nem capitular", () => {
    drawStaffLetters(svg, () => "c4");
    for (const t of svg.querySelectorAll("text.staff-letter")) {
      expect(t.getAttribute("text-anchor")).toBe("end");
      expect(t.getAttribute("dominant-baseline")).toBe("central");
    }
    expect(STAFF_LETTERS_GAP).toBeGreaterThan(0);
    expect(STAFF_LETTERS_STAGGER).toBeGreaterThan(0);
  });

  it("zigue-zague: linhas na coluna junto à folha, espaços uma coluna mais à esquerda", () => {
    drawStaffLetters(svg, () => "c4");
    for (const t of svg.querySelectorAll("text.staff-letter--line")) expect(Number(t.getAttribute("x"))).toBe(-STAFF_LETTERS_GAP);
    for (const t of svg.querySelectorAll("text.staff-letter--space")) {
      expect(Number(t.getAttribute("x"))).toBe(-(STAFF_LETTERS_GAP + STAFF_LETTERS_STAGGER));
    }
  });

  it("a clave de cada pauta vem da 1ª sílaba numerada dela; o solfejo vai no <title>", () => {
    const seen: (number | null)[] = [];
    drawStaffLetters(svg, (first) => { seen.push(first); return first === 15 ? "c3" : first === 31 ? "f3" : "c4"; });
    expect(seen).toEqual([1, 15, 31]);
    const titleOf = (line: number, i: number) =>
      svg.querySelectorAll(".ChantLineInner")[line].querySelectorAll("text.staff-letter")[i].querySelector("title")!.textContent;
    expect(titleOf(0, 6)).toBe("j — dó (clave c4)");
    expect(titleOf(1, 4)).toBe("h — dó (clave c3)");
    expect(titleOf(2, 4)).toBe("h — fá (clave f3)");
  });

  it("redesenhar não duplica; clearStaffLetters remove tudo", () => {
    drawStaffLetters(svg, () => "c4");
    drawStaffLetters(svg, () => "c4");
    expect(svg.querySelectorAll("g.staff-letters")).toHaveLength(3);
    clearStaffLetters(svg);
    expect(svg.querySelectorAll("g.staff-letters, text.staff-letter")).toHaveLength(0);
  });

  it("pauta sem StaffLine é pulada; SVG nulo não quebra", () => {
    svg.querySelectorAll(".ChantLineInner")[2].querySelectorAll("line.StaffLine").forEach((l) => l.remove());
    expect(drawStaffLetters(svg, () => "c4")).toBe(2);
    expect(drawStaffLetters(null, () => "c4")).toBe(0);
    expect(() => clearStaffLetters(null)).not.toThrow();
  });
});

describe("letras na pauta — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("tooltip com o nome da nota e a clave no idioma", () => {
    setLocale("it");
    const svg = fakeSvg();
    drawStaffLetters(svg, () => "c4");
    const titleOf = (line: number, i: number) =>
      svg.querySelectorAll(".ChantLineInner")[line].querySelectorAll("text.staff-letter")[i].querySelector("title")!.textContent;
    expect(titleOf(0, 6)).toBe("j — do (chiave di c4)");
  });
});
