/** Exportar PDF de ponta a ponta, com as partes de fora injetadas (testável sem Tauri nem
 *  navegador): escolher o caminho → desenhar cada peça → paginar → compor → gravar.
 *  Uma peça que o motor não desenha (lança, ou não sai pauta nenhuma) fica de fora e é
 *  informada; se nenhuma sair, nada é gravado. */
import type { Family } from "../neume/types";
import { pageGeometry, type PageSize } from "./layout";
import { layoutPages, composePages, type ComposePiece, type PdfSink } from "./compose";
import type { RenderedPiece } from "./render";
import type { PdfOptions } from "./export-dialog";
import { pdfFileName, type PdfPiece } from "./scope";

export interface PdfExportDeps {
  pickPath(defaultName: string): Promise<string | null>;
  /** Chamado depois de escolhido o caminho, antes de desenhar (aviso "Gerando…"). */
  onStart?(): void;
  render(piece: PdfPiece, o: { widthPx: number; red: boolean }): Promise<RenderedPiece>;
  createSink(page: PageSize, families: Family[]): Promise<PdfSink>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}
export interface PdfExportResult { path: string; pages: number; pieces: number; failed: string[] }

/** null = o usuário cancelou o diálogo de salvar. LANÇA se não há o que exportar ou se a
 *  gravação falhar. */
export async function exportPdf(
  deps: PdfExportDeps, pieces: readonly PdfPiece[], fileTitle: string, o: PdfOptions,
): Promise<PdfExportResult | null> {
  if (pieces.length === 0) throw new Error("não há canto com notas para exportar.");
  const path = await deps.pickPath(pdfFileName(fileTitle));
  if (!path) return null;
  deps.onStart?.();
  const g = pageGeometry(o.page);
  const rendered: RenderedPiece[] = [];
  const ok: ComposePiece[] = [];
  const families = new Set<Family>();
  const failed: string[] = [];
  try {
    for (const p of pieces) {
      let r: RenderedPiece;
      try {
        r = await deps.render(p, { widthPx: g.lineWidthPx, red: o.red });
      } catch (e) {
        console.warn(`[notker] PDF: “${p.title}” não foi desenhado:`, e);
        failed.push(p.title);
        continue;
      }
      rendered.push(r);
      if (!r.lines.some((l) => l.heightPx > 0)) { failed.push(p.title); continue; }
      ok.push({ title: p.title, lines: r.lines });
      families.add(p.family);
    }
    if (ok.length === 0) throw new Error("nenhum canto pôde ser desenhado.");
    const pages = layoutPages(ok, g, o.newPagePerPiece);
    const sink = await deps.createSink(o.page, [...families]);
    await composePages(sink, ok, pages, g);
    await deps.write(path, sink.bytes());
    return { path, pages: pages.length, pieces: ok.length, failed };
  } finally {
    for (const r of rendered) r.dispose();
  }
}
