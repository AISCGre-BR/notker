// src/project/format.ts
/** Formato .notker (spec §4.2): ZIP com project.json + .gabc PUROS (o Rust só
 *  empacota). Schema 2 = árvore + chants[]; o schema 1 (documents[]) é lido como raiz
 *  plana e regravado como 2. Leitura TOLERANTE: nenhum canto existente se perde. */
import type { Family } from "../neume/types";
import { t } from "../i18n";
import { gabcBodyHash } from "../tuotilo/wave";
import {
  type NotkerProject, type TreeNode, type ChantNode, type Interpretation,
  genId, gabcSkeleton, flattenChants, flattenNodes,
} from "./tree";

export const futureSchemaMessage = (): string => t("project.error.futureSchema");
export interface Bundle { project_json: string; files: Record<string, string> }
export interface ExportPlan { dirs: string[]; files: { path: string; content: string }[] }

type JsonTree = { chant: string } | { group: string; title: string; collapsed?: true; children: JsonTree[] };
interface ChantMeta { id: string; file: string; title: string; family?: Family }

export function slug(s: string, fallback = "canto"): string {
  return s.toLowerCase()
    .replace(/æ/g, "ae").replace(/œ/g, "oe")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

const id8 = (id: string): string => id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase() || "x";
const baseOf = (file: string): string => file.replace(/^gabc\//, "").replace(/\.gabc$/i, "");
const asFamily = (f: unknown): Family | undefined => (f === "laon" || f === "stgall" ? f : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function toBundle(p: NotkerProject): Bundle {
  const files: Record<string, string> = {};
  const used = new Set<string>();
  const chants: ChantMeta[] = [];
  for (const ch of flattenChants(p)) {
    const stem = `${slug(ch.title)}-${id8(ch.id)}`;
    let base = stem;
    for (let n = 2; used.has(base); n++) base = `${stem}-${n}`;
    used.add(base);
    const file = `gabc/${base}.gabc`;
    files[file] = ch.content;
    if (ch.interpretation && Object.keys(ch.interpretation.factors).length > 0) {
      files[`interpretation/${base}.json`] = JSON.stringify(ch.interpretation);
    }
    chants.push({ id: ch.id, file, title: ch.title, ...(ch.family ? { family: ch.family } : {}) });
  }
  const tree = (nodes: TreeNode[]): JsonTree[] => nodes.map((n) => (n.kind === "chant"
    ? { chant: n.id }
    : { group: n.id, title: n.title, ...(n.collapsed ? { collapsed: true as const } : {}), children: tree(n.children) }));
  const meta = {
    schema: 2, kind: "notker-project", title: p.title, family: p.family, active: p.activeId,
    tree: tree(p.root), chants,
  };
  return { project_json: JSON.stringify(meta, null, 2), files };
}

/** Lookup seguro: chaves herdadas ("__proto__", "constructor") e não-strings viram undefined. */
const fileOf = (files: Record<string, string>, k: string): string | undefined =>
  Object.hasOwn(files, k) && typeof files[k] === "string" ? files[k] : undefined;

function readInterp(files: Record<string, string>, file: string, content: string): Interpretation | undefined {
  const raw = fileOf(files, `interpretation/${baseOf(file)}.json`);
  if (raw === undefined) return undefined;
  try {
    const v = JSON.parse(raw) as Interpretation;
    if (v && typeof v.gabcBodyHash === "string" && isObj(v.factors)) {
      // Onda legada sem hash: adota o do texto (como o editor faz), senão ligar a onda sujaria o projeto.
      return v.gabcBodyHash === "" ? { ...v, gabcBodyHash: gabcBodyHash(content) } : v;
    }
  } catch { /* JSON inválido: a onda fica de fora, o canto não */ }
  return undefined;
}

function chantFrom(meta: Record<string, unknown>, files: Record<string, string>): ChantNode {
  const file = typeof meta.file === "string" ? meta.file : "";
  const family = asFamily(meta.family);
  const interpretation = file ? readInterp(files, file, fileOf(files, file) ?? "") : undefined;
  return {
    kind: "chant",
    id: typeof meta.id === "string" && meta.id ? meta.id : genId(),
    title: typeof meta.title === "string" && meta.title ? meta.title : t("project.untitled"),
    content: fileOf(files, file) ?? "",
    ...(family ? { family } : {}),
    ...(interpretation ? { interpretation } : {}),
  };
}

function readV1(meta: Record<string, unknown>, files: Record<string, string>): TreeNode[] {
  const seen = new Set<string>();
  return (Array.isArray(meta.documents) ? meta.documents : []).filter(isObj).map((d) => {
    const ch = chantFrom(d, files);
    if (seen.has(ch.id)) ch.id = genId();
    seen.add(ch.id);
    return ch;
  });
}

function readV2(meta: Record<string, unknown>, files: Record<string, string>): TreeNode[] {
  const byId = new Map<string, ChantNode>();
  const dups: ChantNode[] = []; // id repetido: não se perde o conteúdo, cai como órfão
  for (const raw of Array.isArray(meta.chants) ? meta.chants : []) {
    if (!isObj(raw)) continue;
    const ch = chantFrom(raw, files);
    if (!byId.has(ch.id)) byId.set(ch.id, ch);
    else { ch.id = genId(); dups.push(ch); }
  }
  const used = new Set<string>();
  const groupIds = new Set<string>();
  const walk = (list: unknown): TreeNode[] => {
    const out: TreeNode[] = [];
    if (!Array.isArray(list)) return out;
    for (const item of list) {
      if (!isObj(item)) continue;
      if (typeof item.chant === "string") {
        const ch = byId.get(item.chant);
        if (ch && !used.has(ch.id)) { used.add(ch.id); out.push(ch); }
      } else if (typeof item.group === "string") {
        let id = item.group;
        if (!id || groupIds.has(id) || byId.has(id)) id = genId();
        groupIds.add(id);
        out.push({
          kind: "group", id,
          title: typeof item.title === "string" && item.title ? item.title : t("project.group"),
          children: walk(item.children),
          ...(item.collapsed === true ? { collapsed: true } : {}),
        });
      }
    }
    return out;
  };
  const root = walk(meta.tree);
  for (const ch of byId.values()) if (!used.has(ch.id)) root.push(ch); // órfãos não se perdem
  root.push(...dups);
  return root;
}

function parseMeta(projectJson: string): Record<string, unknown> {
  let v: unknown;
  try { v = JSON.parse(projectJson); } catch { throw new Error(t("project.error.invalidJson")); }
  if (!isObj(v) || v.kind !== "notker-project") throw new Error(t("project.error.notNotker"));
  return v;
}

export function fromBundle(projectJson: string, files: Record<string, string>, path: string | undefined): NotkerProject {
  const meta = parseMeta(projectJson);
  const schema = meta.schema;
  if (typeof schema === "number" && schema > 2) throw new Error(futureSchemaMessage());
  const root = schema === 2 ? readV2(meta, files) : readV1(meta, files);
  if (flattenNodes(root).length === 0) {
    root.push({ kind: "chant", id: genId(), title: t("project.untitled"), content: gabcSkeleton() });
  }
  const chants = flattenNodes(root);
  const active = meta.active;
  const activeId = typeof active === "string" && chants.some((x) => x.id === active) ? active : chants[0].id;
  const title = meta.title;
  return {
    schema: 2, kind: "notker-project",
    title: typeof title === "string" && title ? title : chants[0].title,
    family: meta.family === "laon" ? "laon" : "stgall",
    root, activeId, path,
  };
}

export function gabcExportPlan(p: NotkerProject): ExportPlan {
  const plan: ExportPlan = { dirs: [], files: [] };
  const rec = (nodes: TreeNode[], prefix: string): void => {
    const w = Math.max(2, String(nodes.length).length);
    nodes.forEach((n, i) => {
      const name = `${String(i + 1).padStart(w, "0")}-${slug(n.title, n.kind === "group" ? t("project.exportSlug.group") : t("project.exportSlug.chant"))}`;
      if (n.kind === "chant") plan.files.push({ path: `${prefix}${name}.gabc`, content: n.content });
      else { plan.dirs.push(`${prefix}${name}`); rec(n.children, `${prefix}${name}/`); }
    });
  };
  rec(p.root, "");
  return plan;
}
