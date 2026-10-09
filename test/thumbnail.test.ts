// test/thumbnail.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { thumbGeometry, svgSize, sizedSvg, rasterizeSvg, scoreThumbnail, withEmbeddedFonts, type RasterDeps } from "../src/app/thumbnail";
import type { PreviewEngine } from "../src/preview/engine";

const SVG = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text>x</text></svg>`;

function fakeCanvas(opts: { taint?: boolean; noCtx?: boolean; png?: boolean } = {}) {
  const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const raw = {
    width: 0, height: 0,
    getContext: vi.fn(() => (opts.noCtx ? null : ctx)),
    toDataURL: vi.fn((type: string, _q?: number) => {
      if (opts.taint) throw new DOMException("The canvas has been tainted", "SecurityError");
      return `data:${opts.png ? "image/png" : type};base64,QUJD`;
    }),
  };
  return { canvas: raw as unknown as HTMLCanvasElement, raw, ctx };
}
const img = {} as CanvasImageSource;
const deps = (c: HTMLCanvasElement, load: RasterDeps["loadImage"] = vi.fn(async () => img)) =>
  ({ deps: { loadImage: load, createCanvas: () => c } satisfies RasterDeps });

const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;
  vi.restoreAllMocks();
});

describe("thumbGeometry", () => {
  it("partitura longa: recorta o topo em 16:10 e reduz a 480 de largura", () => {
    expect(thumbGeometry(640, 2000)).toEqual({ canvasW: 480, canvasH: 300, srcH: 400, drawH: 300, scale: 0.75 });
  });
  it("partitura curta: completa em branco até 5:2", () => {
    expect(thumbGeometry(640, 100)).toEqual({ canvasW: 480, canvasH: 192, srcH: 100, drawH: 75, scale: 0.75 });
  });
  it("pequena não é ampliada; o lado maior nunca passa de 480", () => {
    expect(thumbGeometry(300, 150)).toMatchObject({ canvasW: 300, canvasH: 150, scale: 1 });
    const g = thumbGeometry(2000, 5000)!;
    expect(Math.max(g.canvasW, g.canvasH)).toBeLessThanOrEqual(480);
  });
  it("tamanho inválido → null", () => {
    expect(thumbGeometry(0, 10)).toBeNull();
    expect(thumbGeometry(Number.NaN, 10)).toBeNull();
  });
});

describe("svgSize / sizedSvg", () => {
  it("lê width/height (com ou sem px) e cai no viewBox", () => {
    expect(svgSize(SVG(640, 300))).toEqual({ w: 640, h: 300 });
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="640px" height="80px"/>')).toEqual({ w: 640, h: 80 });
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 500 250"/>')).toEqual({ w: 500, h: 250 });
  });
  it("largura relativa do nabc-lib (width=100%, altura em px, sem viewBox) usa a largura do render", () => {
    const nabc = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="815.99834"><rect width="100%" height="100%" fill="#ffffff"/></svg>';
    expect(svgSize(nabc)).toBeNull();
    expect(svgSize(nabc, 640)).toEqual({ w: 640, h: 815.99834 });
  });
  it("sem tamanho, não-SVG ou lixo → null", () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeNull();
    expect(svgSize("<div/>")).toBeNull();
    expect(svgSize("não é xml <")).toBeNull();
  });
  it("sizedSvg fixa width/height e mantém o conteúdo", () => {
    const out = sizedSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 250"><text>Ky</text></svg>', 500, 250);
    expect(out).toContain('width="500"');
    expect(out).toContain('height="250"');
    expect(out).toContain("<text>Ky</text>");
  });
});

describe("rasterizeSvg", () => {
  it("folha branca, topo recortado, JPEG 0,8; libera o blob", async () => {
    const f = fakeCanvas();
    const load = vi.fn(async () => img);
    expect(await rasterizeSvg(SVG(640, 2000), deps(f.canvas, load))).toBe("data:image/jpeg;base64,QUJD");
    expect(load).toHaveBeenCalledWith("blob:fake");
    expect([f.raw.width, f.raw.height]).toEqual([480, 300]);
    expect(f.ctx.fillStyle).toBe("#ffffff");
    expect(f.ctx.fillRect).toHaveBeenCalledWith(0, 0, 480, 300);
    expect(f.ctx.drawImage).toHaveBeenCalledWith(img, 0, 0, 640, 400, 0, 0, 480, 300);
    expect(f.raw.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
  it("canvas sujo (WebKitGTK) → undefined, sem lançar, e o blob é liberado", async () => {
    const f = fakeCanvas({ taint: true });
    expect(await rasterizeSvg(SVG(640, 300), deps(f.canvas))).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
  it("sem contexto 2D, imagem que não carrega ou saída não-JPEG → undefined", async () => {
    expect(await rasterizeSvg(SVG(640, 300), deps(fakeCanvas({ noCtx: true }).canvas))).toBeUndefined();
    expect(await rasterizeSvg(SVG(640, 300), deps(fakeCanvas().canvas, async () => { throw new Error("decode"); }))).toBeUndefined();
    expect(await rasterizeSvg(SVG(640, 300), deps(fakeCanvas({ png: true }).canvas))).toBeUndefined();
  });
  it("SVG sem tamanho nem carrega a imagem", async () => {
    const load = vi.fn(async () => img);
    expect(await rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', deps(fakeCanvas().canvas, load))).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });
  it("no jsdom de verdade (sem canvas nem blob URL) → undefined, sem lançar", async () => {
    URL.createObjectURL = origCreate;
    expect(await rasterizeSvg(SVG(640, 300))).toBeUndefined();
  });
});

describe("withEmbeddedFonts", () => {
  const FONTS = { greciliae: "data:font/ttf;base64,AAA", gregall: "data:font/ttf;base64,BBB", grelaon: "data:font/ttf;base64,CCC" };
  it("embute só as famílias que o SVG usa, logo depois da abertura do <svg>", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="9"><text font-family="greciliae">a</text><text style="font-family: gregall">b</text></svg>';
    const out = withEmbeddedFonts(svg, FONTS);
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="9"><style>@font-face{font-family:"greciliae";src:url(data:font/ttf;base64,AAA)}@font-face{font-family:"gregall";src:url(data:font/ttf;base64,BBB)}</style><text')).toBe(true);
    expect(out).not.toContain("grelaon");
  });
  it("sem família conhecida, devolve o SVG igual", () => {
    expect(withEmbeddedFonts(SVG(10, 10), FONTS)).toBe(SVG(10, 10));
  });
});

describe("scoreThumbnail", () => {
  it("repassa a família do canto ao motor (Laon não sai em St. Gall)", async () => {
    const engine: PreviewEngine = { id: "fake", render: vi.fn(async () => ({ svg: SVG(640, 200), sourceMap: [] })) };
    await scoreThumbnail("(c4) a(f)", { engine, family: "laon", fonts: async () => ({}), deps: deps(fakeCanvas().canvas).deps });
    expect(engine.render).toHaveBeenCalledWith("(c4) a(f)", { widthPx: 640, family: "laon" });
  });
  it("desenha o gabc a 640 px, embute as fontes e rasteriza (largura relativa do nabc-lib)", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="200"><text font-family="greciliae">x</text></svg>';
    const engine: PreviewEngine = { id: "fake", render: vi.fn(async () => ({ svg, sourceMap: [] })) };
    const f = fakeCanvas();
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:fake"; });
    const out = await scoreThumbnail("(c4) a(f)", { engine, fonts: async () => ({ greciliae: "data:font/ttf;base64,AAA" }), deps: deps(f.canvas).deps });
    expect(out).toBe("data:image/jpeg;base64,QUJD");
    expect(engine.render).toHaveBeenCalledWith("(c4) a(f)", { widthPx: 640 });
    const blobText = await new Promise<string>((resolve) => { // jsdom não tem Blob.text()
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(blob!);
    });
    expect(blobText).toContain('@font-face{font-family:"greciliae"');
    expect(blobText).toContain('width="640"');
  });
  it("partitura que não desenha, ou fontes que não carregam → undefined", async () => {
    const bad: PreviewEngine = { id: "fake", render: vi.fn(async () => { throw new Error("gabc inválido"); }) };
    expect(await scoreThumbnail("x", { engine: bad, fonts: async () => ({}), deps: deps(fakeCanvas().canvas).deps })).toBeUndefined();
    const ok: PreviewEngine = { id: "fake", render: vi.fn(async () => ({ svg: SVG(640, 200), sourceMap: [] })) };
    expect(await scoreThumbnail("x", { engine: ok, fonts: async () => { throw new Error("404"); }, deps: deps(fakeCanvas().canvas).deps })).toBeUndefined();
  });
});
