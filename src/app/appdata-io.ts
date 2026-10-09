// src/app/appdata-io.ts  (IO Tauri — testado com plugin-fs simulado)
/** Arquivos de texto na pasta de dados do app (AppData), dentro do escopo que a capability
 *  JÁ concede (`fs:allow-appdata-*-recursive`). Gravação atômica: escreve `<nome>.tmp` e
 *  renomeia por cima (um corte de energia não deixa JSON pela metade).
 *  A existência de caminhos ARBITRÁRIOS (recentes) é checada pelo comando Rust
 *  `existing_paths` — sem abrir o escopo do fs para a pasta pessoal inteira. */
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import type { TextSlot } from "./text-slot";

export const RECENT_FILE = "recent.json";
export const RECOVERY_FILE = "recovery/session.json";

const opts = { baseDir: BaseDirectory.AppData };

export function appDataSlot(name: string): TextSlot {
  const dir = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
  return {
    async read() {
      return (await exists(name, opts)) ? await readTextFile(name, opts) : null;
    },
    async write(text) {
      await mkdir(dir, { ...opts, recursive: true }).catch(() => {});
      const tmp = `${name}.tmp`;
      await writeTextFile(tmp, text, opts);
      await rename(tmp, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    },
    async remove() {
      if (await exists(name, opts)) await remove(name, opts);
    },
  };
}

/** Para cada caminho, se ainda é um arquivo (comando Rust; não lê conteúdo). */
export function existingPaths(paths: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("existing_paths", { paths });
}
