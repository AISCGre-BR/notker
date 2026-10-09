// src/app/recent.ts
/** Recentes (spec §4.6 + adendo §11): até 10 projetos `.notker` em AppData `recent.json`,
 *  cada um com a meta da tela inicial (título, data, primeiros cantos, miniatura). PURO:
 *  o arquivo vem por um TextSlot e a checagem de existência por função (comando Rust). */
import { type NotkerProject, flattenChants } from "../project/tree";
import type { TextSlot } from "./text-slot";

export const MAX_RECENT = 10;
/** Quantos títulos de canto a meta guarda (lista do herói). */
export const META_CHANTS = 6;

export interface RecentMeta { title: string; updatedAt: string; chants: string[]; thumb?: string }
export interface RecentEntry { path: string; meta?: RecentMeta }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Só miniatura nossa (data URL de imagem): nada de URL arbitrária vinda de um JSON editado. */
const THUMB = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;

function parseMeta(v: unknown): RecentMeta | undefined {
  if (!isObj(v)) return undefined;
  const meta: RecentMeta = {
    title: typeof v.title === "string" ? v.title : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
    chants: Array.isArray(v.chants)
      ? v.chants.filter((c): c is string => typeof c === "string").slice(0, META_CHANTS)
      : [],
  };
  if (typeof v.thumb === "string" && THUMB.test(v.thumb)) meta.thumb = v.thumb;
  return meta;
}

/** Leitura TOLERANTE: lixo vira lista vazia; entradas inválidas ou repetidas somem. */
export function parseRecent(text: string | null): RecentEntry[] {
  if (!text) return [];
  let v: unknown;
  try { v = JSON.parse(text); } catch { return []; }
  const list: unknown[] = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.entries) ? v.entries : [];
  const out: RecentEntry[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!isObj(raw) || typeof raw.path !== "string" || !raw.path || seen.has(raw.path)) continue;
    seen.add(raw.path);
    const meta = parseMeta(raw.meta);
    out.push(meta ? { path: raw.path, meta } : { path: raw.path });
    if (out.length === MAX_RECENT) break;
  }
  return out;
}

export function serializeRecent(list: RecentEntry[]): string {
  return JSON.stringify({ schema: 1, kind: "notker-recent", entries: list.slice(0, MAX_RECENT) });
}

/** Põe na frente (sem repetir o caminho), no máximo 10. Sem miniatura nova, mantém a antiga. */
export function pushRecent(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const old = list.find((e) => e.path === entry.path);
  const thumb = entry.meta?.thumb ?? old?.meta?.thumb;
  const meta = entry.meta ? { ...entry.meta, ...(thumb ? { thumb } : {}) } : old?.meta;
  const next: RecentEntry = meta ? { path: entry.path, meta } : { path: entry.path };
  return [next, ...list.filter((e) => e.path !== entry.path)].slice(0, MAX_RECENT);
}

export function setRecentThumb(list: RecentEntry[], path: string, thumb: string): RecentEntry[] {
  if (!list.some((e) => e.path === path && e.meta)) return list;
  return list.map((e) => (e.path === path && e.meta ? { ...e, meta: { ...e.meta, thumb } } : e));
}

export function removeRecent(list: RecentEntry[], path: string): RecentEntry[] {
  return list.filter((e) => e.path !== path);
}

export function buildRecentMeta(p: NotkerProject, now: Date): RecentMeta {
  return {
    title: p.title,
    updatedAt: now.toISOString(),
    chants: flattenChants(p).slice(0, META_CHANTS).map((c) => c.title),
  };
}

/** Nome do arquivo sem pasta e sem `.notker`. */
export function displayName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.notker$/i, "");
}

/** Pasta imediata do arquivo (legenda do menu "Abrir recente", distingue títulos iguais). */
export function parentFolder(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

export function recentTitle(e: RecentEntry): string {
  return e.meta?.title.trim() || displayName(e.path);
}

/** "27 de abril" (ano só quando não é o corrente); vazio se a data não é legível. */
export function formatRecentDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return new Intl.DateTimeFormat("pt-BR", opts).format(d);
}

export interface RecentStore { load(): Promise<RecentEntry[]>; save(list: RecentEntry[]): Promise<void> }

/** `load` tira (e regrava sem) os caminhos que não existem mais; falha na checagem
 *  mantém a lista (melhor um recente morto que perder todos); falha na leitura = vazio. */
export function createRecentStore(
  slot: TextSlot, existing: (paths: string[]) => Promise<boolean[]>,
): RecentStore {
  const save = (list: RecentEntry[]): Promise<void> => slot.write(serializeRecent(list));
  return {
    save,
    async load() {
      let list: RecentEntry[];
      try { list = parseRecent(await slot.read()); } catch { return []; }
      if (list.length === 0) return list;
      let ok: boolean[];
      try { ok = await existing(list.map((e) => e.path)); } catch { return list; }
      const kept = list.filter((_, i) => ok[i] !== false);
      if (kept.length !== list.length) await save(kept).catch(() => {});
      return kept;
    },
  };
}
