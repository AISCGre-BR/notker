// src/app/locale-switch.ts
/** Trocar o idioma = gravar a preferência e RECARREGAR a janela (toda a interface é montada
 *  de novo no idioma novo). Antes, a mesma sequência do fechar da janela (guia com rascunho,
 *  "Salvar alterações?", nomes pendentes, retrato de recuperação); cancelou = nada muda.
 *  O projeto salvo (ou o exemplo) é reaberto depois da recarga (localStorage, lido e apagado). */
import { saveLocalePref, type Locale } from "../i18n";

export const REOPEN_KEY = "notker.reopen";
export type Reopen = { kind: "path"; path: string } | { kind: "gabc"; path: string } | { kind: "example" };

/** O que reabrir depois da recarga. Projeto salvo: o caminho. Exemplo: o exemplo. `.gabc` aberto
 *  direto: só se não sujo (sujo = o usuário disse "Não salvar"; as alterações se foram).
 *  Novo não salvo / tela inicial: nada (tela inicial). */
export function resolveReopenTarget(s: { projectOpen: boolean; path?: string; gabcPath?: string; exampleOpen: boolean; dirty: boolean }): Reopen | null {
  if (!s.projectOpen) return null;
  if (s.path) return { kind: "path", path: s.path };
  if (s.exampleOpen) return { kind: "example" };
  if (s.gabcPath && !s.dirty) return { kind: "gabc", path: s.gabcPath };
  return null;
}

export async function performReopen(
  r: Reopen | null,
  d: { openPath(p: string): Promise<void>; openGabc(p: string): Promise<void>; openExample(): Promise<void> },
): Promise<void> {
  if (r?.kind === "path") await d.openPath(r.path);
  else if (r?.kind === "gabc") await d.openGabc(r.path);
  else if (r?.kind === "example") await d.openExample();
}

export const STOP_TIMEOUT_MS = 2000;
/** `stop()` com limite: se travar, segue (a recarga não pode depender do sidecar). */
export async function stopWithTimeout(stop: () => Promise<void>, ms = STOP_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([stop(), new Promise<void>((r) => { timer = setTimeout(r, ms); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Desmonta antes de recarregar: espera o REGISTRO do ouvinte de fechar (a promessa, sem janela
 *  de tempo) para desfazê-lo, e para o sidecar com limite de 2 s. */
export async function teardownForReload(d: { closeListener: Promise<() => void> | null; stop: () => Promise<void> }): Promise<void> {
  try { (await d.closeListener)?.(); } catch { /* registro falhou: não há o que desfazer */ }
  try { await stopWithTimeout(d.stop); } catch (e) { console.warn("[notker] idioma: stop:", e); }
}

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
    if (r) localStorage.setItem(REOPEN_KEY, JSON.stringify(r));
    else localStorage.removeItem(REOPEN_KEY);
  } catch { /* sem storage: a recarga cai na tela inicial */ }
}

/** Lê e APAGA (uma recarga comum depois não reabre de novo). */
export function takeReopen(): Reopen | null {
  try {
    const raw = localStorage.getItem(REOPEN_KEY);
    localStorage.removeItem(REOPEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<{ kind: string; path: unknown }>;
    if (v?.kind === "example") return { kind: "example" };
    if (v?.kind === "gabc" && typeof v.path === "string" && v.path) return { kind: "gabc", path: v.path };
    if (v?.kind === "path" && typeof v.path === "string" && v.path) return { kind: "path", path: v.path };
    return null;
  } catch {
    return null;
  }
}
