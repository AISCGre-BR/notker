// src/app/locale-switch.ts
/** Trocar o idioma = gravar a preferência e RECARREGAR a janela (toda a interface é montada
 *  de novo no idioma novo). Antes, a mesma sequência do fechar da janela (guia com rascunho,
 *  "Salvar alterações?", nomes pendentes, retrato de recuperação); cancelou = nada muda.
 *  O projeto salvo (ou o exemplo) é reaberto depois da recarga (sessionStorage). */
import { saveLocalePref, type Locale } from "../i18n";

export const REOPEN_KEY = "notker.reopen";
export type Reopen = { kind: "path"; path: string } | { kind: "example" };

export interface LocaleSwitchDeps {
  current(): Locale;
  /** runCloseSequence com as dependências do fechar da janela. */
  close(): Promise<{ prevent: boolean }>;
  /** O que reabrir depois da recarga — lido DEPOIS do close (o Salvar pode ter dado um caminho). */
  reopenTarget(): Reopen | null;
  /** Antes de recarregar: mata o sidecar do LSP (o plugin-shell só mata filhos no
   *  RunEvent::Exit) e desfaz o onCloseRequested (o Tauri 2.11 não limpa ouvintes JS
   *  na recarga: o id antigo ficaria registrado). Falha aqui não impede a recarga. */
  teardown(): Promise<void>;
  reload(): void;
}

/** true = recarregando; false = mesmo idioma ou o usuário cancelou. */
export async function switchLocale(next: Locale, d: LocaleSwitchDeps): Promise<boolean> {
  if (next === d.current()) return false;
  const { prevent } = await d.close();
  if (prevent) return false;
  saveLocalePref(next);
  writeReopen(d.reopenTarget());
  try { await d.teardown(); } catch (e) { console.warn("[notker] idioma: teardown:", e); }
  d.reload();
  return true;
}

export function writeReopen(r: Reopen | null): void {
  try {
    if (r) sessionStorage.setItem(REOPEN_KEY, JSON.stringify(r));
    else sessionStorage.removeItem(REOPEN_KEY);
  } catch { /* sem storage: a recarga cai na tela inicial */ }
}

/** Lê e APAGA (uma recarga comum depois não reabre de novo). */
export function takeReopen(): Reopen | null {
  try {
    const raw = sessionStorage.getItem(REOPEN_KEY);
    sessionStorage.removeItem(REOPEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<{ kind: string; path: unknown }>;
    if (v?.kind === "example") return { kind: "example" };
    if (v?.kind === "path" && typeof v.path === "string" && v.path) return { kind: "path", path: v.path };
    return null;
  } catch {
    return null;
  }
}
