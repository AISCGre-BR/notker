// src/neume/overlay-io.ts  (IO Tauri — sem teste unitário; coberto no E2E)
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, BaseDirectory, mkdir, exists } from "@tauri-apps/plugin-fs";
import { t } from "../i18n";
import { type Overlay } from "./types";
import { emptyOverlay, parseOverlay, serializeOverlay } from "./overlay";

const FILE = "neume-overlay.json";
/** Cópia do arquivo schema 1 feita na 1ª leitura por esta versão (volta segura a uma versão antiga). */
const BACKUP_V1 = "neume-overlay.schema1.json";
const namesFilter = () => [{ name: t("fileFilter.names"), extensions: ["json"] }];

export async function loadUserOverlay(): Promise<Overlay> {
  if (!(await exists(FILE, { baseDir: BaseDirectory.AppData }))) return emptyOverlay();
  const text = await readTextFile(FILE, { baseDir: BaseDirectory.AppData });
  const o = parseOverlay(text); // lança em arquivo inválido/versão nova: quem chama NÃO grava por cima
  try {
    if ((JSON.parse(text) as { schema?: unknown }).schema === 1 && !(await exists(BACKUP_V1, { baseDir: BaseDirectory.AppData }))) {
      await writeTextFile(BACKUP_V1, text, { baseDir: BaseDirectory.AppData });
    }
  } catch { /* cópia de segurança é best-effort */ }
  return o;
}
export async function saveUserOverlay(o: Overlay): Promise<void> {
  await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
  await writeTextFile(FILE, serializeOverlay(o), { baseDir: BaseDirectory.AppData });
}
export async function exportOverlay(o: Overlay): Promise<void> {
  const path = await save({ filters: namesFilter(), defaultPath: "meus-neumas.notker-neumes.json" });
  if (path) await writeTextFile(path, serializeOverlay(o));
}
export async function importOverlay(): Promise<Overlay | null> {
  const path = await open({ multiple: false, filters: namesFilter() });
  if (typeof path !== "string") return null;
  return parseOverlay(await readTextFile(path));
}
