/** As dependências REAIS do Exportar PDF (nabc-lib no DOM, jsPDF + svg2pdf.js, diálogo e
 *  plugin-fs do Tauri). O main.ts importa este módulo DINAMICAMENTE: o jsPDF só é
 *  carregado quando alguém exporta. */
import type { PdfExportDeps } from "./export-pdf";
import { renderPiece } from "./render";
import { createJsPdfSink } from "./jspdf-sink";
import { PDF_FONT_URLS } from "./font-urls";
import { pickPdfPath, writePdf } from "../files/pdf-io";

/** Um quadro: espera o próximo repaint e devolve a vez ao laço de eventos. */
export const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function pdfBrowserDeps(
  measureHost: HTMLElement, hooks: { onStart?: () => void; onProgress?: (i: number, n: number) => void } = {},
): PdfExportDeps {
  return {
    pickPath: pickPdfPath,
    onStart: hooks.onStart,
    onProgress: hooks.onProgress,
    yieldFrame: nextFrame,
    render: (piece, o) => renderPiece(piece.content, { family: piece.family, widthPx: o.widthPx, red: o.red, host: measureHost }),
    createSink: (page, families) => createJsPdfSink(page, families, PDF_FONT_URLS),
    write: writePdf,
  };
}
