// src/app/recovery.ts
/** Recuperação de sessão (spec §4.6): enquanto o projeto tiver alterações não salvas, a
 *  cada 30 s (e só se mudou) grava um retrato do projeto — o MESMO bundle do .notker — em
 *  AppData `recovery/session.json`. Salvar/descartar/fechar apaga. Na abertura do app, um
 *  retrato presente vira o aviso "Recuperar" na tela inicial.
 *  Uma vaga só. `clear()` apaga só o que ESTA sessão gravou (ou adotou ao recuperar): o
 *  retrato de uma sessão que caiu fica até Recuperar/Descartar, ou até outra sessão com
 *  alterações gravar o seu por cima. */
import type { NotkerProject } from "../project/tree";
import { type Bundle, toBundle, fromBundle } from "../project/format";
import { projectFingerprint } from "./dirty";
import type { TextSlot } from "./text-slot";

export const RECOVERY_INTERVAL_MS = 30_000;

export interface RecoverySnapshot {
  schema: 1; kind: "notker-recovery"; title: string; path?: string; savedAt: string; bundle: Bundle;
}

export function makeSnapshot(p: NotkerProject, now: Date): RecoverySnapshot {
  return {
    schema: 1, kind: "notker-recovery", title: p.title,
    ...(p.path ? { path: p.path } : {}),
    savedAt: now.toISOString(), bundle: toBundle(p),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Leitura TOLERANTE: ausente, truncado ou estranho → null (sem aviso, sem erro). */
export function parseSnapshot(text: string | null): RecoverySnapshot | null {
  if (!text) return null;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!isObj(v) || v.kind !== "notker-recovery" || v.schema !== 1) return null;
  if (typeof v.title !== "string" || typeof v.savedAt !== "string") return null;
  const b = v.bundle;
  if (!isObj(b) || typeof b.project_json !== "string" || !isObj(b.files)) return null;
  if (!Object.values(b.files).every((x) => typeof x === "string")) return null;
  return {
    schema: 1, kind: "notker-recovery", title: v.title,
    ...(typeof v.path === "string" && v.path ? { path: v.path } : {}),
    savedAt: v.savedAt,
    bundle: { project_json: b.project_json, files: b.files as Record<string, string> },
  };
}

/** Projeto do retrato, com o caminho original (se havia). LANÇA se o bundle não abrir. */
export function projectFromSnapshot(s: RecoverySnapshot): NotkerProject {
  return fromBundle(s.bundle.project_json, s.bundle.files, s.path);
}

export interface RecoveryWriter {
  /** Grava o retrato se há projeto a proteger e ele mudou desde o último. */
  tick(): Promise<void>;
  /** Apaga o retrato desta sessão (nada se ela não gravou nem adotou nenhum). */
  clear(): Promise<void>;
  /** O retrato na vaga passa a ser desta sessão (projeto recuperado). */
  adopt(): void;
  start(): void;
  stop(): void;
}

export function createRecoveryWriter(opts: {
  slot: TextSlot;
  /** Projeto a proteger agora, ou null (nenhum aberto ou sem alterações). */
  current: () => NotkerProject | null;
  intervalMs?: number;
  now?: () => Date;
  onWrite?: () => void;
}): RecoveryWriter {
  const now = opts.now ?? (() => new Date());
  let last: string | null = null;
  let owned = false;
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | null = null;
  // Tudo em fila: um clear() nunca corre no meio de uma gravação (senão o retrato voltaria).
  const queue = (job: () => Promise<void>): Promise<void> => (chain = chain.then(job, job));

  const keyOf = (p: NotkerProject | null): string | null =>
    p ? `${projectFingerprint(p)}\u0000${p.path ?? ""}` : null;

  async function write(): Promise<void> {
    try {
      const p = opts.current();
      if (!p) return;
      const key = keyOf(p);
      if (key === last) return;
      await opts.slot.write(JSON.stringify(makeSnapshot(p, now())));
      last = key;
      owned = true;
      opts.onWrite?.();
    } catch (e) {
      console.warn("[notker] recuperação: não foi possível gravar o retrato:", e);
    }
  }
  async function erase(): Promise<void> {
    // O estado atual (se houver) foi descartado: só uma edição nova volta a gravar.
    try { last = keyOf(opts.current()); } catch { last = null; }
    if (!owned) return;
    owned = false;
    try { await opts.slot.remove(); } catch (e) { console.warn("[notker] recuperação: não foi possível apagar o retrato:", e); }
  }
  return {
    tick: () => queue(write),
    clear: () => queue(erase),
    adopt() { owned = true; },
    start() {
      if (!timer) timer = setInterval(() => { void queue(write); }, opts.intervalMs ?? RECOVERY_INTERVAL_MS);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}
