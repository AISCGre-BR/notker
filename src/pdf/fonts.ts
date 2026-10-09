/** Fontes do PDF (spec do sub-projeto 3, §3). PURO: a tabela de quais TTFs entram e com
 *  que nome/estilo cada uma é registrada no jsPDF. O nome registrado é EXATAMENTE o
 *  `font-family` que o nabc-lib escreve no SVG — o svg2pdf.js casa um com o outro.
 *    greciliae (notas), greextra (sinais especiais): sempre;
 *    gregall (St. Gall) ou grelaon (Laon): a família do canto;
 *    SourceSerif4 (letra, capitular e título): a serifa do Parchment, OFL, versionada em
 *    src/assets/fonts/source-serif-4/ (o pacote @fontsource só traz woff2 variável, que o
 *    jsPDF não embute). */
import type { Family } from "../neume/types";

/** font-family da letra/capitular no SVG do PDF (ChantContext) e no jsPDF. */
export const TEXT_FONT = "SourceSerif4";

export type FontStyle = "normal" | "italic" | "bold" | "bolditalic";
export type FontFile =
  | "greciliae" | "greextra" | "gregall" | "grelaon"
  | "serif-regular" | "serif-italic" | "serif-semibold";
/** Arquivo → URL do TTF (resolvida pelo Vite em src/pdf/font-urls.ts). */
export type FontUrls = Readonly<Record<FontFile, string>>;

export interface PdfFontFace {
  /** Nome no jsPDF = font-family no SVG. */
  family: string;
  style: FontStyle;
  file: FontFile;
}

/** As faces que um PDF com cantos destas famílias precisa (sem repetir). */
export function pdfFontFaces(families: Iterable<Family>): PdfFontFace[] {
  const fams = new Set(families);
  const faces: PdfFontFace[] = [
    { family: "greciliae", style: "normal", file: "greciliae" },
    { family: "greextra", style: "normal", file: "greextra" },
  ];
  if (fams.has("stgall")) faces.push({ family: "gregall", style: "normal", file: "gregall" });
  if (fams.has("laon")) faces.push({ family: "grelaon", style: "normal", file: "grelaon" });
  faces.push(
    { family: TEXT_FONT, style: "normal", file: "serif-regular" },
    { family: TEXT_FONT, style: "italic", file: "serif-italic" },
    { family: TEXT_FONT, style: "bold", file: "serif-semibold" },
    { family: TEXT_FONT, style: "bolditalic", file: "serif-italic" },
  );
  return faces;
}

/** 1º nome de uma lista CSS `font-family` ("'Crimson Text', serif" → "Crimson Text"). */
export function firstFamily(css: string): string {
  const first = css.split(",")[0] ?? "";
  return first.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
}

/** Famílias usadas no SVG (atributo `font-family` ou `font-family:` no `style`) que NÃO
 *  estão entre as faces — cada uma sairia em Helvetica não embutida no PDF. */
export function missingFamilies(svg: Element, faces: readonly PdfFontFace[]): string[] {
  const known = new Set(faces.map((f) => f.family));
  const used = new Set<string>();
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    const attr = el.getAttribute("font-family");
    if (attr) used.add(firstFamily(attr));
    const m = /font-family\s*:\s*([^;]+)/.exec(el.getAttribute("style") ?? "");
    if (m) used.add(firstFamily(m[1]));
  }
  return [...used].filter((f) => f && !known.has(f)).sort();
}
