// src/neume/overlay-io.ts  (IO Tauri — sem teste unitário; coberto no E2E)
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, BaseDirectory, mkdir, exists } from "@tauri-apps/plugin-fs";
import { type Overlay } from "./types";
import { emptyOverlay, parseOverlay, serializeOverlay } from "./overlay";

const FILE = "neume-overlay.json";
const FILTERS = [{ name: "Notker neumes", extensions: ["json"] }];

export async function loadUserOverlay(): Promise<Overlay> {
  if (!(await exists(FILE, { baseDir: BaseDirectory.AppData }))) return emptyOverlay();
  return parseOverlay(await readTextFile(FILE, { baseDir: BaseDirectory.AppData }));
}
export async function saveUserOverlay(o: Overlay): Promise<void> {
  await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
  await writeTextFile(FILE, serializeOverlay(o), { baseDir: BaseDirectory.AppData });
}
export async function exportOverlay(o: Overlay): Promise<void> {
  const path = await save({ filters: FILTERS, defaultPath: "meus-neumas.notker-neumes.json" });
  if (path) await writeTextFile(path, serializeOverlay(o));
}
export async function importOverlay(): Promise<Overlay | null> {
  const path = await open({ multiple: false, filters: FILTERS });
  if (typeof path !== "string") return null;
  return parseOverlay(await readTextFile(path));
}
