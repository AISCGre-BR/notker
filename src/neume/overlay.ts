// src/neume/overlay.ts
import type { NeumeEntry, EffectiveEntry, Overlay, OverlayEntry } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function emptyOverlay(): Overlay {
  return { schema: 1, kind: "notker-neume-overlay", entries: {} };
}

export function mergeEntry(base: NeumeEntry, ov: OverlayEntry | undefined): EffectiveEntry {
  const names = ov?.names ?? [];
  const displayNames = [...names, base.name];
  const terms = Array.from(new Set([...names.map(norm), ...base.terms]));
  const meaning = ov?.note ? (base.meaning ? `${base.meaning}\n${ov.note}` : ov.note) : base.meaning;
  return { ...base, displayNames, terms, meaning, hidden: ov?.hidden ?? false };
}

/** União não-destrutiva de dois overlays (nomes concatenados sem duplicar). */
export function mergeOverlays(a: Overlay, b: Overlay): Overlay {
  const out: Overlay = { schema: 1, kind: "notker-neume-overlay", entries: { ...a.entries } };
  for (const [id, e] of Object.entries(b.entries)) {
    const prev = out.entries[id];
    if (!prev) { out.entries[id] = { ...e }; continue; }
    const names = Array.from(new Set([...(prev.names ?? []), ...(e.names ?? [])]));
    out.entries[id] = {
      names: names.length ? names : undefined,
      note: prev.note ?? e.note,
      hidden: prev.hidden ?? e.hidden,
    };
  }
  return out;
}

export function serializeOverlay(o: Overlay): string { return JSON.stringify(o, null, 2); }

export function parseOverlay(text: string): Overlay {
  const o = JSON.parse(text);
  if (o?.kind !== "notker-neume-overlay" || o?.schema !== 1)
    throw new Error("arquivo de overlay inválido");
  o.entries ??= {};
  return o as Overlay;
}

/** Adiciona um nome a um id (mutação imutável). */
export function addName(o: Overlay, id: string, name: string): Overlay {
  const prev = o.entries[id] ?? {};
  const names = Array.from(new Set([...(prev.names ?? []), name]));
  return { ...o, entries: { ...o.entries, [id]: { ...prev, names } } };
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
  let changed = false;
  for (const e of entries) {
    if (e.displayNames.some((d) => d.trim().toLowerCase() === key)) continue;
    overlay = addName(overlay, e.id, n);
    changed = true;
  }
  return { overlay, changed };
}

/** Remove um nome de um id (mutação imutável). Esvazia `names` quando fica vazio. */
export function removeName(o: Overlay, id: string, name: string): Overlay {
  const prev = o.entries[id];
  if (!prev?.names) return o;
  const names = prev.names.filter((n) => n !== name);
  return { ...o, entries: { ...o.entries, [id]: { ...prev, names: names.length ? names : undefined } } };
}

/** Cópia profunda de um overlay (para editar um rascunho sem mutar o original). */
export function cloneOverlay(o: Overlay): Overlay {
  return {
    schema: 1,
    kind: "notker-neume-overlay",
    entries: Object.fromEntries(
      Object.entries(o.entries).map(([k, v]) => [k, { ...v, names: v.names ? [...v.names] : undefined }]),
    ),
  };
}
