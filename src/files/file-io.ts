import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const FILTERS = [{ name: "Gregorio", extensions: ["gabc"] }];

export async function openGabc(): Promise<{ path: string; content: string } | null> {
  const path = await open({ multiple: false, filters: FILTERS });
  if (typeof path !== "string") return null;
  return { path, content: await readTextFile(path) };
}

export async function saveGabc(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}

export async function saveAsGabc(content: string): Promise<string | null> {
  const path = await save({ filters: FILTERS });
  if (!path) return null;
  await writeTextFile(path, content);
  return path;
}
