import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { pdfFontFaces, firstFamily, missingFamilies, TEXT_FONT } from "../src/pdf/fonts";

const svgOf = (inner: string): SVGSVGElement => {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  return document.querySelector("svg")!;
};

describe("faces do PDF", () => {
  it("notas e sinais sempre; gregall/grelaon só pela família; serifa nos 4 estilos", () => {
    const st = pdfFontFaces(["stgall"]);
    expect(st.map((f) => `${f.family}/${f.style}`)).toEqual([
      "greciliae/normal", "greextra/normal", "gregall/normal",
      `${TEXT_FONT}/normal`, `${TEXT_FONT}/italic`, `${TEXT_FONT}/bold`, `${TEXT_FONT}/bolditalic`,
    ]);
    expect(pdfFontFaces(["laon"]).map((f) => f.family)).toContain("grelaon");
    expect(pdfFontFaces(["laon"]).map((f) => f.family)).not.toContain("gregall");
    const both = pdfFontFaces(["stgall", "laon", "stgall"]).map((f) => f.family);
    expect(both.filter((f) => f === "gregall")).toHaveLength(1);
    expect(both).toContain("grelaon");
  });
  it("firstFamily tira aspas e a lista de reserva", () => {
    expect(firstFamily("'Crimson Text', serif")).toBe("Crimson Text");
    expect(firstFamily('"SourceSerif4"')).toBe("SourceSerif4");
    expect(firstFamily(" greciliae ")).toBe("greciliae");
  });
  it("missingFamilies acha font-family em atributo e em style; as registradas não contam", () => {
    const svg = svgOf(
      `<text font-family="greciliae">a</text><text style="font-family:SourceSerif4;font-size:20px">b</text>` +
      `<text style="font-family:'Crimson Text', serif;font-size:64px">P</text><text font-family="gregall">c</text>`,
    );
    expect(missingFamilies(svg, pdfFontFaces(["stgall"]))).toEqual(["Crimson Text"]);
    expect(missingFamilies(svg, pdfFontFaces(["laon"]))).toEqual(["Crimson Text", "gregall"]);
  });
});

describe("arquivos versionados da serifa (OFL)", () => {
  it("os três TTFs e a licença estão no repositório", () => {
    for (const f of ["SourceSerif4-Regular.ttf", "SourceSerif4-It.ttf", "SourceSerif4-Semibold.ttf"]) {
      const buf = readFileSync(`src/assets/fonts/source-serif-4/${f}`);
      expect(statSync(`src/assets/fonts/source-serif-4/${f}`).size).toBeGreaterThan(100_000);
      expect(buf.readUInt32BE(0)).toBe(0x00010000); // TrueType (glyf), não CFF/OTF
    }
    const lic = readFileSync("src/assets/fonts/source-serif-4/LICENSE.md", "utf8");
    expect(lic).toContain("SIL Open Font License, Version 1.1");
  });
});
