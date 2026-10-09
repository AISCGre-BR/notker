// src/app/thumbnail.ts
/** Miniatura da partitura para os Recentes (adendo §11): o SVG do 1º canto rasterizado num
 *  canvas, lado maior 480 px, JPEG 0,8. Folha BRANCA, como a partitura nos dois temas
 *  (spec §2.5 — não é cor de interface). Recorta o topo (no máximo 16:10) e completa em
 *  branco até 5:2, para o herói e os cartões mostrarem as primeiras linhas.
 *  Qualquer falha (WebKitGTK sujar o canvas, SVG sem tamanho, imagem que não carrega) →
 *  undefined: a tela inicial mostra o retângulo `parchment-deep`. NUNCA lança. */
import { NabcLibEngine } from "../preview/nabc-lib";
import type { PreviewEngine } from "../preview/engine";
import type { Family } from "../neume/types";

export const THUMB_MAX_SIDE = 480;
/** Largura de linha do render da miniatura (px): ~3 sistemas legíveis em 480 px. */
export const THUMB_RENDER_WIDTH = 640;
const MAX_ASPECT = 0.625; // altura/largura máxima: 16:10
const MIN_ASPECT = 0.4;   // altura/largura mínima: 5:2
const SHEET = "#ffffff";  // folha da partitura (§2.5)

export interface ThumbGeometry {
  canvasW: number; canvasH: number;
  /** Altura (px do SVG) do recorte do topo que é desenhado. */
  srcH: number;
  /** Altura (px do canvas) que esse recorte ocupa. */
  drawH: number;
  scale: number;
}

export function thumbGeometry(w: number, h: number, maxSide = THUMB_MAX_SIDE): ThumbGeometry | null {
  if (!(w > 0) || !(h > 0)) return null;
  const frameH = Math.min(Math.max(h, w * MIN_ASPECT), w * MAX_ASPECT);
  const scale = Math.min(1, maxSide / Math.max(w, frameH));
  const srcH = Math.min(h, frameH);
  return {
    canvasW: Math.max(1, Math.round(w * scale)),
    canvasH: Math.max(1, Math.round(frameH * scale)),
    srcH,
    drawH: Math.max(1, Math.round(srcH * scale)),
    scale,
  };
}

function parseSvg(svg: string): SVGSVGElement | null {
  const el = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  return el && el.nodeName.toLowerCase() === "svg" ? (el as unknown as SVGSVGElement) : null;
}

const px = (v: string | null): number => {
  const m = /^\s*([\d.]+)\s*(px)?\s*$/.exec(v ?? "");
  return m ? parseFloat(m[1]) : NaN;
};

/** Tamanho em px: atributos width/height (px ou sem unidade); na falta, o viewBox; e,
 *  se a largura for relativa (o nabc-lib emite `width="100%"` com altura em px e SEM
 *  viewBox), a largura de linha usada no render (`fallbackWidth`). */
export function svgSize(svg: string, fallbackWidth?: number): { w: number; h: number } | null {
  const el = parseSvg(svg);
  if (!el) return null;
  let w = px(el.getAttribute("width"));
  let h = px(el.getAttribute("height"));
  if (!(w > 0 && h > 0)) {
    const vb = (el.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
  }
  if (!(w > 0) && h > 0 && fallbackWidth && fallbackWidth > 0) w = fallbackWidth;
  return w > 0 && h > 0 ? { w, h } : null;
}

/** O mesmo SVG com width/height explícitos e xmlns (uma imagem SVG sem tamanho intrínseco
 *  sai com 0×0 no WebKit). */
export function sizedSvg(svg: string, w: number, h: number): string {
  const el = parseSvg(svg);
  if (!el) return svg;
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h));
  if (!el.getAttribute("xmlns")) el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(el);
}

/** Embute (como @font-face com data URL) as fontes de canto que o SVG usa. Um SVG
 *  desenhado como IMAGEM não enxerga as fontes do documento — sem isto a miniatura sai só
 *  com pauta e letra, sem notas nem neumas. `fonts` = família → data URL. */
export function withEmbeddedFonts(svg: string, fonts: Readonly<Record<string, string>>): string {
  const faces = Object.entries(fonts)
    .filter(([family]) => svg.includes(family))
    .map(([family, data]) => `@font-face{font-family:"${family}";src:url(${data})}`)
    .join("");
  if (!faces) return svg;
  return svg.replace(/<svg\b[^>]*>/, (open) => `${open}<style>${faces}</style>`);
}

let fontData: Promise<Readonly<Record<string, string>>> | null = null;
/** Fontes de canto como data URL (uma vez por sessão; ~1,5 MB, só para as miniaturas). */
export function chantFontData(): Promise<Readonly<Record<string, string>>> {
  fontData ??= (async () => {
    const { CHANT_FONT_URLS } = await import("../preview/nabc-fonts");
    const entries = await Promise.all(Object.entries(CHANT_FONT_URLS).map(async ([family, url]) => {
      const blob = await (await fetch(url)).blob();
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).replace(/^data:[^;,]*/, "data:font/ttf"));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      return [family, data] as const;
    }));
    return Object.fromEntries(entries);
  })();
  fontData.catch(() => { fontData = null; }); // falhou: tenta de novo na próxima
  return fontData;
}

export interface RasterDeps {
  loadImage(url: string): Promise<CanvasImageSource>;
  createCanvas(): HTMLCanvasElement;
}
const browserDeps: RasterDeps = {
  async loadImage(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  },
  createCanvas: () => document.createElement("canvas"),
};

/** SVG → JPEG (data URL) ou undefined. Blob URL (mesma origem) em vez de data: — o WebKit
 *  trata data: SVG com mais desconfiança ao desenhar no canvas. */
export async function rasterizeSvg(
  svg: string, opts: { widthPx?: number; deps?: RasterDeps } = {},
): Promise<string | undefined> {
  const deps = opts.deps ?? browserDeps;
  let url: string | null = null;
  try {
    const size = svgSize(svg, opts.widthPx);
    const g = size && thumbGeometry(size.w, size.h);
    if (!size || !g) return undefined;
    url = URL.createObjectURL(new Blob([sizedSvg(svg, size.w, size.h)], { type: "image/svg+xml" }));
    const img = await deps.loadImage(url);
    const canvas = deps.createCanvas();
    canvas.width = g.canvasW;
    canvas.height = g.canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = SHEET;
    ctx.fillRect(0, 0, g.canvasW, g.canvasH);
    ctx.drawImage(img, 0, 0, size.w, g.srcH, 0, 0, g.canvasW, g.drawH);
    const out = canvas.toDataURL("image/jpeg", 0.8); // SecurityError se o canvas ficou "sujo"
    return out.startsWith("data:image/jpeg") ? out : undefined;
  } catch (e) {
    console.warn("[notker] miniatura indisponível:", e);
    return undefined;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** Miniatura do gabc na família do canto (desenhado pelo nabc-lib a 640 px de largura, com as fontes de canto
 *  embutidas). Nunca lança. */
export async function scoreThumbnail(
  gabc: string,
  opts: { engine?: PreviewEngine; family?: Family; fonts?: () => Promise<Readonly<Record<string, string>>>; deps?: RasterDeps } = {},
): Promise<string | undefined> {
  try {
    const engine = opts.engine ?? new NabcLibEngine();
    const r = await engine.render(gabc, { widthPx: THUMB_RENDER_WIDTH, family: opts.family });
    const fonts = await (opts.fonts ?? chantFontData)();
    return await rasterizeSvg(withEmbeddedFonts(r.svg, fonts), { widthPx: THUMB_RENDER_WIDTH, deps: opts.deps });
  } catch (e) {
    console.warn("[notker] miniatura: a partitura não foi desenhada:", e);
    return undefined;
  }
}
