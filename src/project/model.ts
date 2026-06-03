import type { Family } from "../neume/types";

export interface ProjectDoc {
  id: string;
  title: string;
  family?: Family;   // override do default do projeto
  content: string;   // texto .gabc PURO (em memória)
}
export interface NotkerProject {
  schema: 1;
  kind: "notker-project";
  title: string;
  family: Family;    // default do projeto
  docs: ProjectDoc[];
  activeId: string;
  path?: string;     // caminho do .notker em disco; undefined = efêmero
}

const genId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? "d" + Math.random().toString(36).slice(2));

function slug(s: string): string {
  return s.toLowerCase()
    .replace(/æ/g, "ae").replace(/œ/g, "oe")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "canto";
}

function gabcSkeleton(name?: string, office?: string): string {
  const lines: string[] = [];
  lines.push(`name: ${name && name.trim() ? name.trim() : "Novo"};`);
  if (office && office.trim()) lines.push(`office-part: ${office.trim()};`);
  lines.push("%%");
  lines.push("(c4) ");
  return lines.join("\n");
}

/** Extrai o `name:` do cabeçalho (antes de %%); fallback no rótulo dado. */
export function gabcName(content: string, fallback = "Sem título"): string {
  const head = content.split(/^%%/m)[0];
  const m = head.match(/^\s*name:\s*(.+?);/m);
  return m ? m[1].trim() : fallback;
}

export function newProject(opts: { family: Family; name?: string; office?: string; title?: string }): NotkerProject {
  const content = gabcSkeleton(opts.name, opts.office);
  const title = (opts.name && opts.name.trim()) || opts.title || "Novo";
  const doc: ProjectDoc = { id: genId(), title, content };
  return { schema: 1, kind: "notker-project", title: opts.title ?? title, family: opts.family, docs: [doc], activeId: doc.id };
}

export function ephemeralFromGabc(content: string, fileName: string): NotkerProject {
  const fallback = fileName.replace(/\.gabc$/i, "");
  const title = gabcName(content, fallback);
  const doc: ProjectDoc = { id: genId(), title, content };
  return { schema: 1, kind: "notker-project", title, family: "stgall", docs: [doc], activeId: doc.id };
}

export function getActiveDoc(p: NotkerProject): ProjectDoc {
  return p.docs.find((d) => d.id === p.activeId) ?? p.docs[0];
}
export function effectiveFamily(p: NotkerProject, docId: string): Family {
  const d = p.docs.find((x) => x.id === docId);
  return d?.family ?? p.family;
}
export function withActiveContent(p: NotkerProject, content: string): NotkerProject {
  return { ...p, docs: p.docs.map((d) => (d.id === p.activeId ? { ...d, content } : d)) };
}
export function setActive(p: NotkerProject, id: string): NotkerProject {
  return p.docs.some((d) => d.id === id) ? { ...p, activeId: id } : p;
}
export function setDocFamily(p: NotkerProject, id: string, family: Family): NotkerProject {
  return { ...p, docs: p.docs.map((d) => (d.id === id ? { ...d, family } : d)) };
}
export function addDoc(p: NotkerProject, opts: { title: string; content: string; family?: Family }): NotkerProject {
  const doc: ProjectDoc = { id: genId(), title: opts.title, content: opts.content, family: opts.family };
  return { ...p, docs: [...p.docs, doc] };
}
export function removeDoc(p: NotkerProject, id: string): NotkerProject {
  if (p.docs.length <= 1) return p; // nunca remove o último
  const docs = p.docs.filter((d) => d.id !== id);
  const activeId = p.activeId === id ? docs[0].id : p.activeId;
  return { ...p, docs, activeId };
}

interface ProjectJsonDoc { id: string; file: string; title: string; family?: Family }
interface ProjectJson {
  schema: 1; kind: "notker-project"; title: string; family: Family;
  documents: ProjectJsonDoc[]; active: string;
}

export function toBundle(p: NotkerProject): { project_json: string; files: Record<string, string> } {
  const files: Record<string, string> = {};
  const documents: ProjectJsonDoc[] = p.docs.map((d, i) => {
    const file = `gabc/${String(i + 1).padStart(3, "0")}-${slug(d.title)}.gabc`;
    files[file] = d.content;
    return { id: d.id, file, title: d.title, ...(d.family ? { family: d.family } : {}) };
  });
  const meta: ProjectJson = {
    schema: 1, kind: "notker-project", title: p.title, family: p.family,
    documents, active: p.activeId,
  };
  return { project_json: JSON.stringify(meta, null, 2), files };
}

export function fromBundle(projectJson: string, files: Record<string, string>, path: string | undefined): NotkerProject {
  const meta = JSON.parse(projectJson) as Partial<ProjectJson>;
  if (meta.kind !== "notker-project") throw new Error("não é um projeto Notker");
  const family: Family = meta.family === "laon" ? "laon" : "stgall";
  const docs: ProjectDoc[] = (meta.documents ?? []).map((d) => ({
    id: d.id || genId(),
    title: d.title || "Sem título",
    family: d.family === "laon" || d.family === "stgall" ? d.family : undefined,
    content: files[d.file] ?? "",
  }));
  if (docs.length === 0) docs.push({ id: genId(), title: "Sem título", content: "name: Novo;\n%%\n(c4) " });
  const activeId = docs.some((d) => d.id === meta.active) ? (meta.active as string) : docs[0].id;
  return { schema: 1, kind: "notker-project", title: meta.title || docs[0].title, family, docs, activeId, path };
}
