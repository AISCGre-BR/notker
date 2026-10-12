// src/pdf/scope.ts
/** O QUE entra no PDF (spec do sub-projeto 3, §1): canto atual, grupo selecionado (com
 *  subgrupos, na ordem da árvore) ou projeto inteiro. PURO. Cantos sem música (só o
 *  esqueleto `(c4)`) ficam de fora — uma peça sem pauta não vira título solto. */
import type { Family } from "../neume/types";
import { type NotkerProject, type ChantNode, findNode, findChant, flattenChants, flattenNodes, effectiveFamily } from "../project/tree";
import { t } from "../i18n";

export type PdfScope = "chant" | "group" | "project";

/** Uma peça do PDF: título (o da árvore), texto gabc e família efetiva. */
export interface PdfPiece { id: string; title: string; content: string; family: Family }

const CLEF = /^[cf]b?[1-4]$/i;

/** Há ao menos uma nota (altura gabc a–m, p) num grupo `(...)` do corpo? Clave, barras
 *  e espaços sozinhos não contam. Só a parte gabc (antes do 1º `|`) é olhada. */
export function hasMusic(content: string): boolean {
  const sep = content.indexOf("%%");
  const body = sep >= 0 ? content.slice(sep + 2) : content;
  for (const m of body.matchAll(/\(([^)]*)\)/g)) {
    const gabc = m[1].split("|")[0].trim();
    if (!gabc || CLEF.test(gabc)) continue;
    if (/[a-mp]/i.test(gabc.replace(/\b[cf]b?[1-4]\b/gi, ""))) return true;
  }
  return false;
}

function piece(p: NotkerProject, c: ChantNode): PdfPiece {
  return { id: c.id, title: c.title, content: c.content, family: effectiveFamily(p, c.id) };
}

/** O grupo do id dado, se for um grupo com ao menos um canto com música. */
export function exportableGroup(p: NotkerProject, id: string | null): { id: string; title: string } | null {
  if (!id) return null;
  const n = findNode(p, id);
  if (!n || n.kind !== "group") return null;
  return flattenNodes(n.children).some((c) => hasMusic(c.content)) ? { id: n.id, title: n.title } : null;
}

/** Peças do escopo, na ordem da árvore, só as que têm música. `groupId` só vale para "group". */
export function selectPieces(p: NotkerProject, scope: PdfScope, groupId: string | null = null): PdfPiece[] {
  let chants: ChantNode[];
  if (scope === "chant") {
    const c = findChant(p, p.activeId);
    chants = c ? [c] : [];
  } else if (scope === "group") {
    const n = groupId ? findNode(p, groupId) : undefined;
    chants = n && n.kind === "group" ? flattenNodes(n.children) : [];
  } else {
    chants = flattenChants(p);
  }
  return chants.filter((c) => hasMusic(c.content)).map((c) => piece(p, c));
}

/** Nome sugerido no diálogo de salvar: o título sem acentos, minúsculo, com hífens. */
export function pdfFileName(title: string): string {
  const slug = title
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `${slug || t("pdf.fileName")}.pdf`;
}

/** Título que dá nome ao arquivo: o do canto, o do grupo ou o do projeto. */
export function scopeTitle(p: NotkerProject, scope: PdfScope, groupId: string | null = null): string {
  if (scope === "chant") return findChant(p, p.activeId)?.title ?? p.title;
  if (scope === "group") {
    const n = groupId ? findNode(p, groupId) : undefined;
    return n?.title ?? p.title;
  }
  return p.title;
}
