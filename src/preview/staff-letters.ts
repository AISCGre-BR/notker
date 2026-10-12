/** staff-letters.ts — overlay "Letras na pauta" na partitura da MESA (nunca no PDF nem na
 *  miniatura: ambos chamam o motor direto, sem o painel). Injetado após cada render.
 *
 *  Estrutura medida no Chromium (debug/letras-probe): cada sistema é
 *  `g.ChantLine[transform=translate(0,y)] > g.ChantLineInner`, com 4 `line.StaffLine`
 *  filhas em y1 = 0 / 16.32 / 32.64 / 48.96 (de cima para baixo) e a clave em x = 0
 *  (a pauta com capitular começa em x1 > 0, mas a clave/capitular estão sempre em x ≥ 0).
 *  As letras vão DENTRO do ChantLineInner (herdam o translate do sistema), em x negativo:
 *  um gutter fora da folha, no padding do #preview (o CSS deixa o <svg> com overflow
 *  visível) — não cobrem a clave nem a capitular e usam as cores do tema, não da folha. */
import { staffLetters } from "../gabc/staff-letters";
import { t, type MessageKey } from "../i18n";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Distância (px) entre a borda esquerda da folha e o FIM das letras das LINHAS. */
export const STAFF_LETTERS_GAP = 5;
/** Recuo extra (px) da coluna dos ESPAÇOS: em zigue-zague, cada coluna tem passo de uma
 *  pauta inteira (16,32 px) em vez de meio (8,16 px) — as letras não se encostam. */
export const STAFF_LETTERS_STAGGER = 8;
const LAYER = "staff-letters";

export function clearStaffLetters(svg: Element | null): void {
  svg?.querySelectorAll(`g.${LAYER}`).forEach((g) => g.remove());
}

/** MENOR índice syllable-N do sistema (a ordem no DOM não é garantida: uma troca de
 *  clave no fim do sistema anterior pode empurrar sílabas). */
function firstSyllable(line: Element): number | null {
  let min: number | null = null;
  for (const el of line.querySelectorAll('[class*="syllable-"]')) {
    const m = /(?:^|\s)syllable-(\d+)(?:\s|$)/.exec(el.getAttribute("class") ?? "");
    if (m && (min == null || Number(m[1]) < min)) min = Number(m[1]);
  }
  return min;
}

/** Desenha as letras à esquerda de cada pauta. `clefOf(1ª sílaba numerada do sistema)`
 *  devolve a clave ativa no início dele. Retorna quantas pautas receberam letras. */
export function drawStaffLetters(
  svg: Element | null,
  clefOf: (firstSyllable: number | null) => string | null,
): number {
  if (!svg) return 0;
  clearStaffLetters(svg);
  let drawn = 0;
  for (const inner of svg.querySelectorAll(".ChantLineInner")) {
    const ys = [...inner.querySelectorAll(":scope > line.StaffLine")]
      .map((l) => Number(l.getAttribute("y1")))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => b - a); // de baixo para cima
    if (ys.length === 0) continue;
    const clef = clefOf(firstSyllable(inner)) ?? "c4";
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", LAYER);
    layer.setAttribute("aria-hidden", "true");
    for (const p of staffLetters(clef, ys.length)) {
      const k = p.degree / 2;
      const y = Number.isInteger(k) ? ys[k] : (ys[Math.floor(k)] + ys[Math.ceil(k)]) / 2;
      const txt = document.createElementNS(SVG_NS, "text");
      txt.setAttribute("class", `staff-letter staff-letter--${p.kind}`);
      txt.setAttribute("x", String(-(STAFF_LETTERS_GAP + (p.kind === "space" ? STAFF_LETTERS_STAGGER : 0))));
      txt.setAttribute("y", String(Math.round(y * 100) / 100));
      txt.setAttribute("text-anchor", "end");
      txt.setAttribute("dominant-baseline", "central");
      txt.appendChild(document.createTextNode(p.letter));
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = t("staffLetters.title", { letter: p.letter, pitch: t(`pitch.${p.solfege}` as MessageKey), clef });
      txt.appendChild(title);
      layer.appendChild(txt);
    }
    inner.appendChild(layer);
    drawn++;
  }
  return drawn;
}
