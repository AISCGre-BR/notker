// src/i18n/index.ts
/** Idioma da interface (pt-BR fonte, en, it). Sem dependência: `t(chave, params)` com
 *  interpolação `{nome}`, `tn(base, n)` para plural (`.one` quando n === 1, senão `.other`),
 *  datas e números pelo Intl no idioma escolhido.
 *
 *  Regras:
 *  - O idioma é fixado UMA vez por carga da página (`initLocale` no começo do boot); trocar
 *    de idioma grava a preferência e recarrega a janela (src/app/locale-switch.ts).
 *  - Antes de `initLocale` (e em todos os testes) o idioma é pt-BR: os testes existentes
 *    continuam valendo sem configuração.
 *  - Parâmetros numéricos saem formatados pelo Intl (1.189 / 1,189). Ids, anos e qualquer
 *    número que NÃO deva ganhar separador de milhar vão como STRING (`String(id)`).
 *  - Nunca chamar `t()` no nível de módulo (o texto ficaria congelado no idioma do import);
 *    o teste test/i18n-scan.test.ts impede. */
import { ptBR, type MessageKey } from "./pt-BR";
import { en } from "./en";
import { it } from "./it";

export type { MessageKey } from "./pt-BR";
export type Locale = "pt-BR" | "en" | "it";
export const LOCALES: readonly Locale[] = ["pt-BR", "en", "it"];
/** Rótulo de cada idioma no PRÓPRIO idioma (o menu nunca os traduz). */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { "pt-BR": "Português", en: "English", it: "Italiano" };
export const LOCALE_KEY = "notker.locale";

export type Dict = Readonly<Record<MessageKey, string>>;
const DICTS: Readonly<Record<Locale, Dict>> = { "pt-BR": ptBR, en, it };

/** Base de uma chave de plural (`foo` quando existem `foo.one` e `foo.other`). */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer B}.one` ? (`${B}.other` extends MessageKey ? B : never) : never
}[MessageKey];
export type Params = Readonly<Record<string, string | number>>;

let current: Locale = "pt-BR";

export function getLocale(): Locale { return current; }
/** Troca o idioma em memória (boot e testes). A interface já montada NÃO muda sozinha. */
export function setLocale(l: Locale): void { current = l; }

/** `navigator.language` → idioma: pt* → pt-BR, it* → it, en* → en; qualquer outro → en. */
export function detectLocale(lang: string | null | undefined): Locale {
  const l = (lang ?? "").trim().toLowerCase();
  if (l === "pt" || l.startsWith("pt-") || l.startsWith("pt_")) return "pt-BR";
  if (l === "it" || l.startsWith("it-") || l.startsWith("it_")) return "it";
  return "en";
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Preferência gravada (escolha manual); null = seguir o sistema. Storage pode estar bloqueado. */
export function loadLocalePref(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLocalePref(l: Locale): void {
  try { localStorage.setItem(LOCALE_KEY, l); } catch { /* sem storage: vale só nesta sessão */ }
}

/** Boot: preferência gravada ou idioma do sistema; marca `<html lang>`. */
export function initLocale(nav: { language?: string } | undefined = typeof navigator !== "undefined" ? navigator : undefined): Locale {
  const l = loadLocalePref() ?? detectLocale(nav?.language);
  setLocale(l);
  if (typeof document !== "undefined") document.documentElement.lang = l;
  return l;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(current).format(n);
}

export function formatDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(current, opts).format(d);
}

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    if (v === undefined) return m; // parâmetro faltando fica visível (e o teste de paridade acusa)
    return typeof v === "number" ? formatNumber(v) : v;
  });
}

export function t(key: MessageKey, params?: Params): string {
  const s = DICTS[current][key] ?? ptBR[key] ?? key;
  return interpolate(s, params);
}

/** Plural simples: `.one` se n === 1, senão `.other`; `{n}` já vem preenchido. */
export function tn(base: PluralKey, n: number, params?: Params): string {
  const key = `${base}.${n === 1 ? "one" : "other"}` as MessageKey;
  return t(key, { n, ...params });
}

/** Parâmetros `{nome}` de um texto (usado pelo teste de paridade). */
export function paramsOf(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

export const DICTIONARIES = DICTS;
