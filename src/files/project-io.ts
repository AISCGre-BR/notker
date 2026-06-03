import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  type NotkerProject, getActiveDoc, ephemeralFromGabc, fromBundle, toBundle,
} from "../project/model";

const NOTKER_FILTER = { name: "Projeto Notker", extensions: ["notker"] };
const GABC_FILTER = { name: "Gregorio", extensions: ["gabc"] };

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Abre um `.notker` (descompacta via Rust) ou um `.gabc` solto (projeto efêmero). */
export async function openProject(): Promise<NotkerProject | null> {
  const path = await open({ multiple: false, filters: [NOTKER_FILTER, GABC_FILTER] });
  if (typeof path !== "string") return null;
  if (/\.notker$/i.test(path)) {
    const bundle = await invoke<{ project_json: string; files: Record<string, string> }>(
      "read_project", { path },
    );
    return fromBundle(bundle.project_json, bundle.files, path);
  }
  const content = await readTextFile(path);
  return ephemeralFromGabc(content, baseName(path));
}

/** Salva o projeto como `.notker`. Se não tem path, pede um (Salvar como). */
export async function saveProject(p: NotkerProject): Promise<string | null> {
  let path = p.path;
  if (!path) {
    const chosen = await save({ filters: [NOTKER_FILTER] });
    if (!chosen) return null;
    path = chosen;
  }
  const bundle = toBundle(p);
  await invoke("write_project", { path, project_json: bundle.project_json, files: bundle.files });
  return path;
}

/** Exporta o canto ativo como `.gabc` Gregorio puro (o buffer já é puro). */
export async function exportCurrentGabc(p: NotkerProject): Promise<string | null> {
  const path = await save({ filters: [GABC_FILTER] });
  if (!path) return null;
  await writeTextFile(path, getActiveDoc(p).content);
  return path;
}

/** Exporta TODOS os cantos como `.gabc` numa pasta escolhida (um arquivo por doc). */
export async function exportAllGabc(p: NotkerProject): Promise<number> {
  const dir = await open({ directory: true });
  if (typeof dir !== "string") return 0;
  let n = 0;
  for (let i = 0; i < p.docs.length; i++) {
    const d = p.docs[i];
    const safe = (d.title || "canto").replace(/[^A-Za-z0-9_-]+/g, "-");
    await writeTextFile(`${dir}/${String(i + 1).padStart(3, "0")}-${safe}.gabc`, d.content);
    n++;
  }
  return n;
}
