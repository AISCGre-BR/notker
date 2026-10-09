// test/pdf-jspdf-sink.test.ts — o sink real (jsPDF) com as fontes do repositório, sem navegador
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createJsPdfSink } from "../src/pdf/jspdf-sink";
import type { FontUrls } from "../src/pdf/fonts";

const LIB = "node_modules/@testneumz/nabc-lib/dist/fonts";
const SS = "src/assets/fonts/source-serif-4";
const URLS: FontUrls = {
  greciliae: `${LIB}/greciliae.ttf`, greextra: `${LIB}/greextra.ttf`,
  gregall: `${LIB}/gregall.ttf`, grelaon: `${LIB}/grelaon.ttf`,
  "serif-regular": `${SS}/SourceSerif4-Regular.ttf`, "serif-italic": `${SS}/SourceSerif4-It.ttf`,
  "serif-semibold": `${SS}/SourceSerif4-Semibold.ttf`,
};

afterEach(() => { vi.unstubAllGlobals(); });
/** Larguras/alturas de todas as /MediaBox do PDF (o jsPDF escreve 595.2799999999999727). */
const mediaBoxes = (text: string): number[][] =>
  [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Math.round(+m[1] * 100) / 100, Math.round(+m[2] * 100) / 100]);

describe("sink jsPDF", () => {
  it("A4 com 2 páginas; título na serifa EMBUTIDA; só as fontes usadas no PDF", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      const buf = readFileSync(url);
      return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });
    const sink = await createJsPdfSink("a4", ["laon"], URLS);
    expect(fetched).not.toContain(URLS.gregall); // família Laon: gregall não é carregada
    expect(fetched).toContain(URLS.grelaon);
    sink.title("Puer natus est", 297.64, 56.69, 14);
    sink.addPage();
    const bytes = sink.bytes();
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(mediaBoxes(text)).toEqual([[595.28, 841.89], [595.28, 841.89]]);
    expect(text).toContain("/FontFile2");          // TrueType embutida
    expect(text).toContain("/BaseFont /SourceSerif4");
    expect(text).not.toContain("/BaseFont /Helvetica"); // putOnlyUsedFonts
  });
  it("Carta: página de 612 × 792 pt", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const buf = readFileSync(url);
      return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });
    const sink = await createJsPdfSink("letter", ["stgall"], URLS);
    sink.title("Kyrie", 306, 56.69, 14);
    expect(mediaBoxes(new TextDecoder("latin1").decode(sink.bytes()))).toEqual([[612, 792]]);
  });
});
