import { describe, it, expect, vi } from "vitest";
import { exportPdf, type PdfExportDeps } from "../src/pdf/export-pdf";
import type { PdfSink } from "../src/pdf/compose";
import type { RenderedPiece } from "../src/pdf/render";
import type { PdfPiece } from "../src/pdf/scope";
import type { PdfOptions } from "../src/pdf/export-dialog";
import { pageGeometry } from "../src/pdf/layout";

const pc = (id: string, family: "stgall" | "laon" = "stgall"): PdfPiece => ({ id, title: `T-${id}`, content: `(c4) ${id}(f)`, family });
const OPTS: PdfOptions = { scope: "project", page: "a4", red: true, newPagePerPiece: false };

function deps(over: Partial<PdfExportDeps> = {}) {
  const log: string[] = [];
  const disposed: string[] = [];
  const sink: PdfSink = {
    addPage: () => { log.push("page"); },
    title: (t) => { log.push(`title:${t}`); },
    svg: async (el) => { log.push(`svg:${el.id}`); },
    bytes: () => new Uint8Array([37, 80, 68, 70]),
  };
  const d: PdfExportDeps & { log: string[]; disposed: string[] } = {
    log, disposed,
    pickPath: vi.fn(async (name: string) => `/out/${name}`),
    onStart: vi.fn(() => { log.push("start"); }),
    render: vi.fn(async (p: PdfPiece): Promise<RenderedPiece> => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = `${p.id}-0`;
      return { lines: [{ heightPx: 150, svg }], dispose: () => { disposed.push(p.id); } };
    }),
    createSink: vi.fn(async () => sink),
    write: vi.fn(async () => {}),
    ...over,
  };
  return d;
}

describe("exportPdf", () => {
  it("caminho com o nome sugerido → aviso → desenha na largura da página → compõe → grava; libera os SVGs", async () => {
    const d = deps();
    const r = await exportPdf(d, [pc("a"), pc("b", "laon")], "Missa de Natal", OPTS);
    expect(d.pickPath).toHaveBeenCalledWith("missa-de-natal.pdf");
    expect(d.render).toHaveBeenCalledWith(pc("a"), { widthPx: pageGeometry("a4").lineWidthPx, red: true });
    expect(d.createSink).toHaveBeenCalledWith("a4", ["stgall", "laon"]);
    expect(d.log).toEqual(["start", "title:T-a", "svg:a-0", "title:T-b", "svg:b-0"]);
    expect(d.write).toHaveBeenCalledWith("/out/missa-de-natal.pdf", new Uint8Array([37, 80, 68, 70]));
    expect(r).toEqual({ path: "/out/missa-de-natal.pdf", pages: 1, pieces: 2, failed: [] });
    expect(d.disposed).toEqual(["a", "b"]);
  });
  it("Carta e preto chegam ao motor e ao sink", async () => {
    const d = deps();
    await exportPdf(d, [pc("a")], "x", { ...OPTS, page: "letter", red: false });
    expect(d.render).toHaveBeenCalledWith(pc("a"), { widthPx: pageGeometry("letter").lineWidthPx, red: false });
    expect(d.createSink).toHaveBeenCalledWith("letter", ["stgall"]);
  });
  it("cancelar o diálogo de salvar: nada é desenhado nem gravado", async () => {
    const d = deps({ pickPath: vi.fn(async () => null) });
    expect(await exportPdf(d, [pc("a")], "x", OPTS)).toBeNull();
    expect(d.render).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
  });
  it("peça que o motor não desenha fica de fora e é informada; as outras saem", async () => {
    const d = deps();
    const base = d.render;
    d.render = vi.fn(async (p: PdfPiece, o: { widthPx: number; red: boolean }) => {
      if (p.id === "bad") throw new Error("parser");
      if (p.id === "nada") return { lines: [], dispose: () => { d.disposed.push("nada"); } };
      return base(p, o);
    });
    const r = await exportPdf(d, [pc("a"), pc("bad"), pc("nada")], "x", OPTS);
    expect(r!.failed).toEqual(["T-bad", "T-nada"]);
    expect(r!.pieces).toBe(1);
    expect(d.disposed).toEqual(["a", "nada"]);
  });
  it("nenhuma peça desenhada, lista vazia ou gravação que falha: lança (e libera os SVGs)", async () => {
    const d1 = deps({ render: vi.fn(async () => { throw new Error("x"); }) });
    await expect(exportPdf(d1, [pc("a")], "x", OPTS)).rejects.toThrow("nenhum canto pôde ser desenhado");
    expect(d1.write).not.toHaveBeenCalled();
    await expect(exportPdf(deps(), [], "x", OPTS)).rejects.toThrow("não há canto com notas");
    const d2 = deps({ write: vi.fn(async () => { throw new Error("forbidden path"); }) });
    await expect(exportPdf(d2, [pc("a")], "x", OPTS)).rejects.toThrow("forbidden path");
    expect(d2.disposed).toEqual(["a"]);
  });
});
