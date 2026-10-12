/** Diálogo "Exportar PDF" (spec do sub-projeto 3, §1) sobre o diálogo do Parchment:
 *  host pré-existente, escolhas em segmentados (`aria-pressed`) — nada de radio/checkbox
 *  nativos (WebKitGTK). "Neumas em vermelho" liga/desliga = segmentado Vermelhos · Pretos. */
import { openDialog } from "../ui/pd/dialog";
import type { PdfScope } from "./scope";
import type { PageSize } from "./layout";
import { t } from "../i18n";

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
    title: t("pdf.title"),
    body: t("pdf.body"),
    segs: [
      { key: "scope", label: t("pdf.scope"), value: scope, options: [
        { value: "chant", label: t("pdf.scope.chant"), disabled: !can("chant") },
        { value: "group", label: ctx.group ? t("pdf.scope.group", { title: ctx.group.title }) : t("pdf.scope.groupNone"), disabled: !can("group") },
        { value: "project", label: t("pdf.scope.project") },
      ] },
      { key: "page", label: t("pdf.page"), value: o.page, options: [{ value: "a4", label: "A4" }, { value: "letter", label: t("pdf.page.letter") }] },
      { key: "color", label: t("pdf.color"), value: o.red ? "red" : "black",
        options: [{ value: "red", label: t("pdf.color.red") }, { value: "black", label: t("pdf.color.black") }] },
      { key: "flow", label: t("pdf.flow"), value: o.newPagePerPiece ? "page" : "flow",
        options: [{ value: "flow", label: t("pdf.flow.flow") }, { value: "page", label: t("pdf.flow.page") }] },
    ],
    actions: [
      { id: "cancel", label: t("common.cancel"), kind: "elevated" },
      { id: "export", label: t("pdf.export"), kind: "filled" },
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
