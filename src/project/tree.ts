// src/project/tree.ts
/** Modelo de projeto em ÁRVORE (spec §4.1). Funções PURAS e imutáveis: toda operação
 *  devolve um projeto novo — ou o MESMO objeto quando não há o que mudar.
 *  Invariantes: ids únicos; ≥ 1 canto; activeId aponta sempre para um canto. */
import type { Family } from "../neume/types";
import { t } from "../i18n";

export interface Interpretation { gabcBodyHash: string; factors: Record<string, number> }
export interface GroupNode { kind: "group"; id: string; title: string; children: TreeNode[]; collapsed?: boolean }
export interface ChantNode {
  kind: "chant"; id: string; title: string;
  family?: Family;                  // override da família padrão do projeto
  content: string;                  // .gabc PURO
  interpretation?: Interpretation;  // onda de interpretação (opcional)
}
export type TreeNode = GroupNode | ChantNode;
export interface NotkerProject {
  schema: 2; kind: "notker-project"; title: string; family: Family;  // família padrão
  root: TreeNode[];                 // ordem = ordem do usuário
  activeId: string;                 // sempre um ChantNode
  path?: string;                    // caminho do .notker; undefined = efêmero
}
export interface Location { parentId: string | null; index: number }
export interface VisibleRow { node: TreeNode; depth: number; parentId: string | null; index: number; setSize: number }
export interface RemoveResult {
  project: NotkerProject; removed: TreeNode; parentId: string | null; index: number;
  prevActiveId: string; createdId?: string;
}
export type ChantPatch = Partial<Pick<ChantNode, "title" | "content" | "family" | "interpretation">>;

export const genId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? "n" + Date.now().toString(36) + Math.random().toString(36).slice(2);

const placeholderTitle = (): string => t("project.defaultChant");

export function gabcSkeleton(name?: string, office?: string): string {
  const lines = [`name: ${name && name.trim() ? name.trim() : t("project.defaultChant")};`];
  if (office && office.trim()) lines.push(`office-part: ${office.trim()};`);
  lines.push("%%", "(c4) ");
  return lines.join("\n");
}

/** Extrai o `name:` do cabeçalho (antes de %%); fallback no rótulo dado. */
export function gabcName(content: string, fallback = t("project.untitled")): string {
  const head = content.split(/^%%/m)[0];
  const m = head.match(/^\s*name:\s*(.+?);/m);
  return m ? m[1].trim() : fallback;
}

export function newChant(opts: { title: string; content?: string; family?: Family }): ChantNode {
  return {
    kind: "chant", id: genId(), title: opts.title,
    content: opts.content ?? gabcSkeleton(opts.title),
    ...(opts.family ? { family: opts.family } : {}),
  };
}

export function newGroup(title = t("project.defaultGroup")): GroupNode {
  return { kind: "group", id: genId(), title, children: [] };
}

export function newProject(opts: { family: Family; name?: string; office?: string; title?: string }): NotkerProject {
  const title = (opts.name && opts.name.trim()) || opts.title || t("project.defaultChant");
  const chant: ChantNode = { kind: "chant", id: genId(), title, content: gabcSkeleton(opts.name, opts.office) };
  return { schema: 2, kind: "notker-project", title: opts.title ?? title, family: opts.family, root: [chant], activeId: chant.id };
}

export function ephemeralFromGabc(content: string, fileName: string): NotkerProject {
  const title = gabcName(content, fileName.replace(/\.gabc$/i, ""));
  const chant: ChantNode = { kind: "chant", id: genId(), title, content };
  return { schema: 2, kind: "notker-project", title, family: "stgall", root: [chant], activeId: chant.id };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export function subtreeHas(node: TreeNode, id: string): boolean {
  return node.id === id || (node.kind === "group" && node.children.some((c) => subtreeHas(c, id)));
}

export function findNode(p: NotkerProject, id: string): TreeNode | undefined {
  const rec = (nodes: TreeNode[]): TreeNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.kind === "group") { const r = rec(n.children); if (r) return r; }
    }
    return undefined;
  };
  return rec(p.root);
}

export function findChant(p: NotkerProject, id: string): ChantNode | undefined {
  const n = findNode(p, id);
  return n?.kind === "chant" ? n : undefined;
}

export function locate(p: NotkerProject, id: string): Location | undefined {
  const rec = (nodes: TreeNode[], parentId: string | null): Location | undefined => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === id) return { parentId, index: i };
      if (n.kind === "group") { const r = rec(n.children, n.id); if (r) return r; }
    }
    return undefined;
  };
  return rec(p.root, null);
}

export function parentOf(p: NotkerProject, id: string): GroupNode | null | undefined {
  const loc = locate(p, id);
  if (!loc) return undefined;
  return loc.parentId === null ? null : (findNode(p, loc.parentId) as GroupNode);
}

export function childrenOf(p: NotkerProject, parentId: string | null): TreeNode[] | undefined {
  if (parentId === null) return p.root;
  const n = findNode(p, parentId);
  return n?.kind === "group" ? n.children : undefined;
}

export function flattenNodes(nodes: TreeNode[]): ChantNode[] {
  const out: ChantNode[] = [];
  const rec = (list: TreeNode[]): void => {
    for (const n of list) { if (n.kind === "chant") out.push(n); else rec(n.children); }
  };
  rec(nodes);
  return out;
}

export function flattenChants(p: NotkerProject): ChantNode[] { return flattenNodes(p.root); }
export function countChants(node: TreeNode): number { return flattenNodes([node]).length; }

export function visibleRows(p: NotkerProject): VisibleRow[] {
  const out: VisibleRow[] = [];
  const rec = (nodes: TreeNode[], depth: number, parentId: string | null): void => {
    nodes.forEach((node, index) => {
      out.push({ node, depth, parentId, index, setSize: nodes.length });
      if (node.kind === "group" && !node.collapsed) rec(node.children, depth + 1, node.id);
    });
  };
  rec(p.root, 0, null);
  return out;
}

export function getActiveChant(p: NotkerProject): ChantNode {
  return findChant(p, p.activeId) ?? flattenChants(p)[0];
}

export function effectiveFamily(p: NotkerProject, id: string): Family {
  return findChant(p, id)?.family ?? p.family;
}

export function invariantErrors(p: NotkerProject): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  const rec = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (seen.has(n.id)) errs.push(t("project.error.duplicateId", { id: n.id }));
      seen.add(n.id);
      if (n.kind === "group") rec(n.children);
    }
  };
  rec(p.root);
  if (flattenChants(p).length === 0) errs.push(t("project.error.noChant"));
  if (!findChant(p, p.activeId)) errs.push(t("project.error.badActive", { id: p.activeId }));
  return errs;
}

// ── Escrita (internos) ───────────────────────────────────────────────────────

const clamp = (i: number, max: number): number => Math.max(0, Math.min(max, i));

function allIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.kind === "group" ? [n.id, ...allIds(n.children)] : [n.id]));
}

function replaceIn(nodes: TreeNode[], id: string, fn: (n: TreeNode) => TreeNode): TreeNode[] | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) { const copy = nodes.slice(); copy[i] = fn(n); return copy; }
    if (n.kind === "group") {
      const sub = replaceIn(n.children, id, fn);
      if (sub) { const copy = nodes.slice(); copy[i] = { ...n, children: sub }; return copy; }
    }
  }
  return null;
}

function updateNode(p: NotkerProject, id: string, fn: (n: TreeNode) => TreeNode): NotkerProject {
  const root = replaceIn(p.root, id, fn);
  return root ? { ...p, root } : p;
}

/** Substitui a lista de filhos de `parentId` (null = raiz); null se o pai não é grupo. */
function withList(p: NotkerProject, parentId: string | null, fn: (list: TreeNode[]) => TreeNode[]): NotkerProject | null {
  if (parentId === null) return { ...p, root: fn(p.root) };
  const target = findNode(p, parentId);
  if (!target || target.kind !== "group") return null;
  return updateNode(p, parentId, (n) => ({ ...(n as GroupNode), children: fn((n as GroupNode).children) }));
}

// ── Escrita (públicas) ───────────────────────────────────────────────────────

export function setActive(p: NotkerProject, id: string): NotkerProject {
  return findChant(p, id) && p.activeId !== id ? { ...p, activeId: id } : p;
}

export function updateChant(p: NotkerProject, id: string, patch: ChantPatch): NotkerProject {
  if (!findChant(p, id)) return p;
  return updateNode(p, id, (n) => ({ ...(n as ChantNode), ...patch }));
}

export function renameNode(p: NotkerProject, id: string, title: string): NotkerProject {
  const trimmed = title.trim();
  const n = findNode(p, id);
  if (!trimmed || !n || n.title === trimmed) return p;
  return updateNode(p, id, (x) => ({ ...x, title: trimmed }));
}

export function setChantFamily(p: NotkerProject, id: string, family: Family): NotkerProject {
  if (!findChant(p, id)) return p;
  return updateNode(p, id, (n) => ({ ...(n as ChantNode), family }));
}

export function setCollapsed(p: NotkerProject, id: string, collapsed: boolean): NotkerProject {
  const n = findNode(p, id);
  if (!n || n.kind !== "group" || !!n.collapsed === collapsed) return p;
  return updateNode(p, id, (x) => {
    const { collapsed: _old, ...rest } = x as GroupNode;
    return collapsed ? { ...rest, collapsed: true } : rest;
  });
}

export function revealNode(p: NotkerProject, id: string): NotkerProject {
  let next = p;
  let loc = locate(p, id);
  while (loc && loc.parentId !== null) {
    next = setCollapsed(next, loc.parentId, false);
    loc = locate(next, loc.parentId);
  }
  return next;
}

export function insertNode(p: NotkerProject, parentId: string | null, index: number, node: TreeNode): NotkerProject {
  if (allIds([node]).some((id) => findNode(p, id))) return p; // ids únicos
  return withList(p, parentId, (list) => {
    const i = clamp(index, list.length);
    return [...list.slice(0, i), node, ...list.slice(i)];
  }) ?? p;
}

export function moveNode(p: NotkerProject, id: string, parentId: string | null, index: number): NotkerProject {
  const loc = locate(p, id);
  const node = findNode(p, id);
  if (!loc || !node) return p;
  if (parentId !== null) {
    const target = findNode(p, parentId);
    if (!target || target.kind !== "group" || subtreeHas(node, parentId)) return p; // sem ciclos
  }
  const same = loc.parentId === parentId;
  const i = same && loc.index < index ? index - 1 : index;
  if (same && clamp(i, childrenOf(p, parentId)!.length - 1) === loc.index) return p;
  const without = withList(p, loc.parentId, (l) => l.filter((_, k) => k !== loc.index))!;
  return insertNode(without, parentId, i, node);
}

export function moveSibling(p: NotkerProject, id: string, delta: -1 | 1): NotkerProject {
  const loc = locate(p, id);
  if (!loc) return p;
  const j = loc.index + delta;
  if (j < 0 || j >= childrenOf(p, loc.parentId)!.length) return p;
  return withList(p, loc.parentId, (l) => {
    const copy = l.slice();
    [copy[loc.index], copy[j]] = [copy[j], copy[loc.index]];
    return copy;
  }) ?? p;
}

export function duplicateNode(p: NotkerProject, id: string): { project: NotkerProject; id: string } | null {
  const loc = locate(p, id);
  const n = findNode(p, id);
  if (!loc || !n) return null;
  const clone = (x: TreeNode): TreeNode => (x.kind === "chant"
    ? {
        ...x, id: genId(),
        ...(x.interpretation
          ? { interpretation: { gabcBodyHash: x.interpretation.gabcBodyHash, factors: { ...x.interpretation.factors } } }
          : {}),
      }
    : { ...x, id: genId(), children: x.children.map(clone) });
  const copy: TreeNode = { ...clone(n), title: t("project.copyOf", { title: n.title }) };
  return { project: insertNode(p, loc.parentId, loc.index + 1, copy), id: copy.id };
}

export function removeNode(p: NotkerProject, id: string): RemoveResult | null {
  const loc = locate(p, id);
  const removed = findNode(p, id);
  if (!loc || !removed) return null;
  let next = withList(p, loc.parentId, (l) => l.filter((_, i) => i !== loc.index))!;
  let createdId: string | undefined;
  if (subtreeHas(removed, p.activeId)) {
    const order = flattenChants(p);
    const gone = new Set(flattenNodes([removed]).map((x) => x.id));
    const pos = order.findIndex((x) => x.id === p.activeId);
    const neighbor = order.slice(pos + 1).find((x) => !gone.has(x.id))
      ?? order.slice(0, Math.max(0, pos)).reverse().find((x) => !gone.has(x.id));
    if (neighbor) next = { ...next, activeId: neighbor.id };
    else {
      const ph = newChant({ title: placeholderTitle() });
      next = { ...next, root: [...next.root, ph], activeId: ph.id };
      createdId = ph.id;
    }
  }
  return {
    project: next, removed, parentId: loc.parentId, index: loc.index, prevActiveId: p.activeId,
    ...(createdId ? { createdId } : {}),
  };
}

/** Desfaz um removeNode: reinsere no lugar (ou no fim da raiz se o pai sumiu), reativa o
 *  canto que estava ativo se ele saiu junto e tira o canto vazio criado, se intocado. */
export function restoreRemoved(p: NotkerProject, r: RemoveResult): NotkerProject {
  const parentOk = r.parentId === null || findNode(p, r.parentId)?.kind === "group";
  let next = insertNode(p, parentOk ? r.parentId : null, parentOk ? r.index : Infinity, r.removed);
  if (next === p) return p; // já restaurado
  if (subtreeHas(r.removed, r.prevActiveId)) next = setActive(next, r.prevActiveId);
  if (r.createdId) {
    const ph = findChant(next, r.createdId);
    if (ph && ph.title === placeholderTitle() && ph.content === gabcSkeleton(placeholderTitle()) && !ph.interpretation && next.activeId !== ph.id) {
      next = removeNode(next, ph.id)?.project ?? next;
    }
  }
  return revealNode(next, r.removed.id);
}
