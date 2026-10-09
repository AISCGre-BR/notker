/** Diálogo "Exportar PDF" (spec do sub-projeto 3, §1) sobre o diálogo do Parchment:
 *  host pré-existente, escolhas em segmentados (`aria-pressed`) — nada de radio/checkbox
 *  nativos (WebKitGTK). "Neumas em vermelho" liga/desliga = segmentado Vermelhos · Pretos. */
import { openDialog } from "../ui/pd/dialog";
import type { PdfScope } from "./scope";
import type { PageSize } from "./layout";

export interface PdfOptions { scope: PdfScope; page: PageSize; red: boolean; newPagePerPiece: boolean }
export const DEFAULT_PDF_OPTIONS: Omit<PdfOptions, "scope"> = { page: "a4", red: true, newPagePerPiece: false };

export interface PdfDialogContext {
  /** O canto atual tem música? (senão "Canto atual" fica indisponível) */
  chantHasMusic: boolean;
  /** Grupo selecionado na árvore com música, ou null ("Grupo" indisponível). */
  group: { id: string; title: string } | null;
  /** Escolhas da última exportação nesta sessão (página, cor, quebra). */
  last?: Partial<PdfOptions>;
}

/** Abre o diálogo; null = cancelado. O escopo inicial é o da última vez, se ainda
 *  disponível; senão Canto atual; sem música no canto, Projeto inteiro. */
export async function exportPdfDialog(host: HTMLElement, ctx: PdfDialogContext): Promise<PdfOptions | null> {
  const can = (s: PdfScope): boolean => (s === "chant" ? ctx.chantHasMusic : s === "group" ? !!ctx.group : true);
  const want = ctx.last?.scope;
  const scope: PdfScope = want && can(want) ? want : ctx.chantHasMusic ? "chant" : "project";
  const o = { ...DEFAULT_PDF_OPTIONS, ...ctx.last };
  const r = await openDialog(host, {
    title: "Exportar PDF",
    body: "Partitura em folha branca, margens de 2 cm, com o título de cada peça.",
    segs: [
      { key: "scope", label: "O que exportar", value: scope, options: [
        { value: "chant", label: "Canto atual", disabled: !can("chant") },
        { value: "group", label: ctx.group ? `Grupo “${ctx.group.title}”` : "Grupo selecionado", disabled: !can("group") },
        { value: "project", label: "Projeto inteiro" },
      ] },
      { key: "page", label: "Página", value: o.page, options: [{ value: "a4", label: "A4" }, { value: "letter", label: "Carta" }] },
      { key: "color", label: "Neumas St. Gall/Laon", value: o.red ? "red" : "black",
        options: [{ value: "red", label: "Em vermelho" }, { value: "black", label: "Em preto" }] },
      { key: "flow", label: "Peças", value: o.newPagePerPiece ? "page" : "flow",
        options: [{ value: "flow", label: "Uma após a outra" }, { value: "page", label: "Cada uma em nova página" }] },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "elevated" },
      { id: "export", label: "Exportar…", kind: "filled" },
    ],
  });
  if (r.action !== "export") return null;
  const picked = r.values.scope as PdfScope;
  return {
    scope: can(picked) ? picked : "project",
    page: r.values.page === "letter" ? "letter" : "a4",
    red: r.values.color !== "black",
    newPagePerPiece: r.values.flow === "page",
  };
}
