// src/app/appdata-io.ts  (IO Tauri — testado com plugin-fs simulado)
/** Arquivos de texto na pasta de dados do app (AppData), dentro do escopo que a capability
 *  JÁ concede (`fs:allow-appdata-*-recursive`). Gravação atômica: escreve `<nome>.tmp` e
 *  renomeia por cima (um crash do processo não deixa JSON pela metade). Limite: contra falta
 *  de energia a durabilidade depende do sistema de arquivos (o plugin-fs não faz fsync).
 *  Gravações e remoções no MESMO arquivo são serializadas (mesmo `.tmp`), mesmo entre instâncias do slot.
 *  A existência de caminhos ARBITRÁRIOS (recentes) é checada pelo comando Rust
 *  `existing_paths` — sem abrir o escopo do fs para a pasta pessoal inteira. */
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import type { TextSlot } from "./text-slot";

export const RECENT_FILE = "recent.json";
export const RECOVERY_FILE = "recovery/session.json";
/** Vaga extra: o retrato de uma sessão anterior ainda não resolvida (Recuperar/Descartar). */
export const RECOVERY_PREV_FILE = "recovery/session.prev.json";

const opts = { baseDir: BaseDirectory.AppData };

const chains = new Map<string, Promise<unknown>>();

export function appDataSlot(name: string): TextSlot {
  const dir = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
  const tmp = `${name}.tmp`;
  async function doWrite(text: string): Promise<void> {
    await mkdir(dir, { ...opts, recursive: true }).catch(() => {});
    await writeTextFile(tmp, text, opts);
    await rename(tmp, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
  }
  /** Entra na cadeia por arquivo (write e remove nunca correm juntos); a cadeia segue após falha. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const r = (chains.get(name) ?? Promise.resolve()).then(job);
    chains.set(name, r.catch(() => {}));
    return r;
  }
  return {
    async read() {
      return (await exists(name, opts)) ? await readTextFile(name, opts) : null;
    },
    write(text) {
      return enqueue(() => doWrite(text));
    },
    remove() {
      return enqueue(async () => {
        if (await exists(name, opts)) await remove(name, opts);
        if (await exists(tmp, opts)) await remove(tmp, opts);
      });
    },
  };
}

/** Renomeia `from` por cima de `to` (substitui), entrando na fila de gravações dos DOIS
 *  arquivos. Sem `from`, nada a fazer. */
export async function rotateSlot(from: string, to: string): Promise<void> {
  const tail = Promise.all([chains.get(from), chains.get(to)]);
  const r = tail.then(async () => {
    if (!(await exists(from, opts))) return;
    await rename(from, to, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
  });
  const safe = r.catch(() => {});
  chains.set(from, safe);
  chains.set(to, safe);
  return r;
}

/** Para cada caminho, se ainda é um arquivo (comando Rust; não lê conteúdo). */
export function existingPaths(paths: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("existing_paths", { paths });
}
