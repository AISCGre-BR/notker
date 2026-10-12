// src/neume/overlay.ts
// Overlay de nomes do usuário (schema 2): nomes/nota/oculto por id do catálogo
// (`entries`) e sequências nabc criadas pelo usuário (`sequences`, id
// `seq:<família>:<nabc normalizado>`). O schema 1 é lido e migrado (sequences = {}).
// Todas as funções são PURAS e imutáveis: devolvem o MESMO objeto quando nada muda.
import type { NeumeEntry, EffectiveEntry, Family, Overlay, OverlayEntry, UserSequence } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const FUTURE_OVERLAY_MESSAGE = "Arquivo de nomes criado por uma versão mais nova do Notker.";
/** `created` de sequências lidas sem data (arquivo editado à mão). */
const EPOCH = "1970-01-01T00:00:00.000Z";

export function emptyOverlay(): Overlay {
  return { schema: 2, kind: "notker-neume-overlay", entries: {}, sequences: {} };
}

// ── ids de sequência ─────────────────────────────────────────────────────────
/** Cadeia nabc normalizada: sem espaços em branco (inclusive internos). */
export function normalizeNabc(nabc: string): string { return nabc.replace(/\s+/g, ""); }
export function sequenceId(family: Family, nabc: string): string { return `seq:${family}:${normalizeNabc(nabc)}`; }
export function isSequenceId(id: string): boolean { return id.startsWith("seq:"); }
export function parseSequenceId(id: string): { family: Family; nabc: string } | null {
  const m = /^seq:(stgall|laon):(.+)$/.exec(id);
  return m ? { family: m[1] as Family, nabc: m[2] } : null;
}

// ── acesso genérico (catálogo ou sequência) ──────────────────────────────────
export function overlayItem(o: Overlay, id: string): OverlayEntry | UserSequence | undefined {
  const bag: Record<string, OverlayEntry> = isSequenceId(id) ? o.sequences : o.entries;
  return Object.hasOwn(bag, id) ? bag[id] : undefined;
}
/** Grava `patch` no item `id`. Sequência inexistente: não cria (devolve `o`). */
function patchItem(o: Overlay, id: string, patch: Partial<OverlayEntry>): Overlay {
  if (isSequenceId(id)) {
    const prev = Object.hasOwn(o.sequences, id) ? o.sequences[id] : undefined;
    if (!prev) return o;
    return { ...o, sequences: { ...o.sequences, [id]: clean({ ...prev, ...patch }) } };
  }
  const prev = Object.hasOwn(o.entries, id) ? o.entries[id] : {};
  return { ...o, entries: { ...o.entries, [id]: clean({ ...prev, ...patch }) } };
}
/** Tira chaves `undefined` (o JSON gravado fica limpo e o round-trip, estável). */
function clean<T extends object>(x: T): T {
  const out = { ...x } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

// ── entradas efetivas ────────────────────────────────────────────────────────
export function mergeEntry(base: NeumeEntry, ov: OverlayEntry | undefined): EffectiveEntry {
  const names = ov?.names ?? [];
  const displayNames = [...names, base.name];
  const terms = Array.from(new Set([...names.map(norm), ...base.terms]));
  const meaning = ov?.note ? (base.meaning ? `${base.meaning}\n${ov.note}` : ov.note) : base.meaning;
  return {
    ...base, displayNames, terms, meaning, hidden: ov?.hidden ?? false,
    userNames: [...names], ...(ov?.note ? { userNote: ov.note } : {}),
  };
}

// ── nomes ────────────────────────────────────────────────────────────────────
/** Adiciona um nome a um id. Sequência inexistente: devolve `o` (nada muda). */
export function addName(o: Overlay, id: string, name: string): Overlay {
  const prev = overlayItem(o, id);
  if (isSequenceId(id) && !prev) return o;
  if (prev?.names?.includes(name)) return o;
  return patchItem(o, id, { names: [...(prev?.names ?? []), name] });
}

/**
 * Cadastra `name` em todas as entradas, exceto nas que já exibem o nome
 * (igual, sem distinguir caixa, após trim; acentos preservados).
 */
export function addNameToEntries(
  o: Overlay,
  entries: { id: string; displayNames: string[] }[],
  name: string,
): { overlay: Overlay; changed: boolean } {
  const n = name.trim();
  if (!n) return { overlay: o, changed: false };
  const key = n.toLowerCase();
  let overlay = o;
  for (const e of entries) {
    if (e.displayNames.some((d) => d.trim().toLowerCase() === key)) continue;
    overlay = addName(overlay, e.id, n);
  }
  return { overlay, changed: overlay !== o };
}

/** Remove um nome de um id. Esvazia `names` quando fica vazio. */
export function removeName(o: Overlay, id: string, name: string): Overlay {
  const prev = overlayItem(o, id);
  if (!prev?.names?.includes(name)) return o;
  const names = prev.names.filter((n) => n !== name);
  return patchItem(o, id, { names: names.length ? names : undefined });
}

/** Põe `name` como primeiro (principal) da lista do usuário. */
export function promoteName(o: Overlay, id: string, name: string): Overlay {
  const prev = overlayItem(o, id);
  if (!prev?.names?.includes(name) || prev.names[0] === name) return o;
  return patchItem(o, id, { names: [name, ...prev.names.filter((n) => n !== name)] });
}

export function setNote(o: Overlay, id: string, note: string): Overlay {
  const n = note.trim();
  const prev = overlayItem(o, id);
  if ((prev?.note ?? "") === n) return o;
  return patchItem(o, id, { note: n || undefined });
}

export function setHidden(o: Overlay, id: string, hidden: boolean): Overlay {
  const prev = overlayItem(o, id);
  if ((prev?.hidden ?? false) === hidden) return o;
  return patchItem(o, id, { hidden: hidden || undefined });
}

// ── sequências ───────────────────────────────────────────────────────────────
/** Cria a sequência (ou devolve a existente com `existed: true`). Cadeia vazia: erro. */
export function addSequence(
  o: Overlay, family: Family, nabc: string, created: string,
): { overlay: Overlay; id: string; existed: boolean } {
  const n = normalizeNabc(nabc);
  if (!n) throw new Error("cadeia nabc vazia");
  const id = sequenceId(family, n);
  if (Object.hasOwn(o.sequences, id)) return { overlay: o, id, existed: true };
  return { overlay: { ...o, sequences: { ...o.sequences, [id]: { family, nabc: n, created } } }, id, existed: false };
}

export function removeSequence(o: Overlay, id: string): { overlay: Overlay; removed: UserSequence | null } {
  if (!Object.hasOwn(o.sequences, id)) return { overlay: o, removed: null };
  const { [id]: removed, ...rest } = o.sequences;
  return { overlay: { ...o, sequences: rest }, removed };
}

/** Desfazer da exclusão: devolve a sequência; se o id voltou a existir, une os nomes. */
export function restoreSequence(o: Overlay, id: string, seq: UserSequence): Overlay {
  const cur = Object.hasOwn(o.sequences, id) ? o.sequences[id] : undefined;
  const merged = cur ? mergeItem(cur, seq) : { ...seq, names: seq.names ? [...seq.names] : undefined };
  return { ...o, sequences: { ...o.sequences, [id]: clean(merged) } };
}

/** Troca a cadeia de uma sequência (o id muda junto). Se a nova cadeia já é de outra
 *  sequência, nada muda e `collision` diz qual. */
export function changeSequenceNabc(
  o: Overlay, id: string, nabc: string,
): { overlay: Overlay; id: string; collision: string | null } {
  const prev = Object.hasOwn(o.sequences, id) ? o.sequences[id] : undefined;
  const n = normalizeNabc(nabc);
  if (!prev || !n) return { overlay: o, id, collision: null };
  const next = sequenceId(prev.family, n);
  if (next === id) return { overlay: o, id, collision: null };
  if (Object.hasOwn(o.sequences, next)) return { overlay: o, id, collision: next };
  const { [id]: _old, ...rest } = o.sequences;
  return { overlay: { ...o, sequences: { ...rest, [next]: { ...prev, nabc: n } } }, id: next, collision: null };
}

// ── união, cópia, (de)serialização ───────────────────────────────────────────
function mergeItem<T extends OverlayEntry>(prev: T, e: OverlayEntry): T {
  const names = Array.from(new Set([...(prev.names ?? []), ...(e.names ?? [])]));
  return clean({ ...prev, names: names.length ? names : undefined, note: prev.note ?? e.note, hidden: prev.hidden ?? e.hidden });
}

/** União não-destrutiva de dois overlays (nomes concatenados sem duplicar). */
export function mergeOverlays(a: Overlay, b: Overlay): Overlay {
  const out = cloneOverlay(a);
  for (const [id, e] of Object.entries(b.entries)) {
    out.entries[id] = Object.hasOwn(out.entries, id) ? mergeItem(out.entries[id], e) : cloneItem(e);
  }
  for (const [id, s] of Object.entries(b.sequences)) {
    out.sequences[id] = Object.hasOwn(out.sequences, id) ? mergeItem(out.sequences[id], s) : cloneItem(s);
  }
  return out;
}

function cloneItem<T extends OverlayEntry>(e: T): T {
  return clean({ ...e, names: e.names ? [...e.names] : undefined });
}

/** Cópia profunda (para editar sem aliasing com o original). */
export function cloneOverlay(o: Overlay): Overlay {
  return {
    schema: 2,
    kind: "notker-neume-overlay",
    entries: Object.fromEntries(Object.entries(o.entries).map(([k, v]) => [k, cloneItem(v)])),
    sequences: Object.fromEntries(Object.entries(o.sequences).map(([k, v]) => [k, cloneItem(v)])),
  };
}

export function serializeOverlay(o: Overlay): string { return JSON.stringify(o, null, 2); }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** Lê nomes/nota/oculto tolerando lixo: só strings não vazias, sem repetir. */
function readItem(x: unknown): OverlayEntry {
  if (!isObj(x)) return {};
  const names = Array.isArray(x.names)
    ? Array.from(new Set(x.names.filter((n): n is string => typeof n === "string").map((n) => n.trim()).filter(Boolean)))
    : [];
  return clean({
    names: names.length ? names : undefined,
    note: typeof x.note === "string" && x.note.trim() ? x.note : undefined,
    hidden: x.hidden === true ? true : undefined,
  });
}

/** Lê schema 1 (migra: `sequences = {}`) ou 2. Schema maior: FUTURE_OVERLAY_MESSAGE.
 *  Sequências são re-chaveadas pelo id canônico (as que colidem têm os nomes unidos). */
export function parseOverlay(text: string): Overlay {
  const o: unknown = JSON.parse(text);
  if (!isObj(o) || o.kind !== "notker-neume-overlay") throw new Error("arquivo de overlay inválido");
  if (typeof o.schema === "number" && o.schema > 2) throw new Error(FUTURE_OVERLAY_MESSAGE);
  if (o.schema !== 1 && o.schema !== 2) throw new Error("arquivo de overlay inválido");
  const out = emptyOverlay();
  if (isObj(o.entries)) {
    for (const [id, e] of Object.entries(o.entries)) {
      if (isSequenceId(id) || id === "__proto__") continue; // fora do lugar / perigoso: ignora
      out.entries[id] = readItem(e);
    }
  }
  if (o.schema === 2 && isObj(o.sequences)) {
    for (const s of Object.values(o.sequences)) {
      if (!isObj(s) || (s.family !== "stgall" && s.family !== "laon") || typeof s.nabc !== "string") continue;
      const nabc = normalizeNabc(s.nabc);
      if (!nabc) continue;
      const id = sequenceId(s.family, nabc);
      const seq: UserSequence = {
        ...readItem(s), family: s.family, nabc,
        created: typeof s.created === "string" ? s.created : EPOCH,
      };
      out.sequences[id] = Object.hasOwn(out.sequences, id) ? mergeItem(out.sequences[id], seq) : seq;
    }
  }
  return out;
}

/** Quantos itens têm nomes do usuário e quantas sequências existem. */
export function overlayCounts(o: Overlay): { named: number; sequences: number } {
  const named = Object.values(o.entries).filter((e) => e.names?.length).length;
  return { named, sequences: Object.keys(o.sequences).length };
}
