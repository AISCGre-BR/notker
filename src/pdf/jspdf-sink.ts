// src/pdf/jspdf-sink.ts
/** O `PdfSink` de verdade: jsPDF 2.5.2 + svg2pdf.js 2.7.0, vetorial, com as fontes
 *  EMBUTIDAS (registradas com o mesmo nome do `font-family` do SVG — ver fonts.ts).
 *  `putOnlyUsedFonts`: sem isso o jsPDF lista as 14 fontes-padrão (não embutidas) em toda
 *  página. Só navegador; importado dinamicamente na exportação. */
import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import type { PdfSink } from "./compose";
import { pdfFontFaces, TEXT_FONT, type FontFile, type FontUrls } from "./fonts";
import type { PageSize } from "./layout";
import type { Family } from "../neume/types";
import { t } from "../i18n";

const base64Cache = new Map<string, Promise<string>>();

/** TTF → base64 (uma vez por sessão por URL). */
function fontBase64(url: string): Promise<string> {
  let p = base64Cache.get(url);
  if (!p) {
    p = (async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(t("pdf.error.font", { url, status: String(r.status) }));
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    })();
    p.catch(() => base64Cache.delete(url));
    base64Cache.set(url, p);
  }
  return p;
}

export async function createJsPdfSink(size: PageSize, families: Iterable<Family>, urls: FontUrls): Promise<PdfSink> {
  const pdf = new jsPDF({ unit: "pt", format: size, orientation: "portrait", compress: true, putOnlyUsedFonts: true });
  const faces = pdfFontFaces(families);
  const files = new Set<FontFile>(faces.map((f) => f.file));
  const data = new Map<FontFile, string>();
  await Promise.all([...files].map(async (f) => { data.set(f, await fontBase64(urls[f])); }));
  for (const f of files) pdf.addFileToVFS(`${f}.ttf`, data.get(f)!);
  for (const face of faces) pdf.addFont(`${face.file}.ttf`, face.family, face.style);
  return {
    addPage: () => { pdf.addPage(size, "portrait"); },
    title(text, centerX, top, pt) {
      pdf.setFont(TEXT_FONT, "normal");
      pdf.setFontSize(pt);
      pdf.setTextColor(0, 0, 0);
      pdf.text(text, centerX, top, { align: "center", baseline: "top" });
    },
    async svg(el, box) {
      await svg2pdf(el, pdf, box);
    },
    bytes: () => new Uint8Array(pdf.output("arraybuffer")),
  };
}
