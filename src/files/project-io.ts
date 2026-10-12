import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { type NotkerProject, getActiveChant, ephemeralFromGabc } from "../project/tree";
import { fromBundle, toBundle, gabcExportPlan } from "../project/format";

const NOTKER_FILTER = { name: "Projeto Notker", extensions: ["notker"] };
const GABC_FILTER = { name: "Gregorio", extensions: ["gabc"] };

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Abre um `.notker` (descompacta via Rust) ou um `.gabc` solto (projeto efêmero). */
export async function openProject(): Promise<NotkerProject | null> {
  const path = await open({ multiple: false, filters: [NOTKER_FILTER, GABC_FILTER] });
  if (typeof path !== "string") return null;
  if (/\.notker$/i.test(path)) return openProjectAt(path);
  const content = await readTextFile(path);
  return ephemeralFromGabc(content, baseName(path));
}

/** Abre um `.notker` pelo caminho (Recentes). Quem lê é o Rust (`read_project`), então não
 *  depende do escopo do plugin-fs (que só conhece arquivos escolhidos NESTA sessão). LANÇA. */
export async function openProjectAt(path: string): Promise<NotkerProject> {
  const bundle = await invoke<{ project_json: string; files: Record<string, string> }>(
    "read_project", { path },
  );
  return fromBundle(bundle.project_json, bundle.files, path);
}

/** Escolhe um `.gabc` e devolve nome (sem extensão) e conteúdo. */
export async function pickGabcFile(): Promise<{ name: string; content: string } | null> {
  const path = await open({ multiple: false, filters: [GABC_FILTER] });
  if (typeof path !== "string") return null;
  return { name: baseName(path).replace(/\.gabc$/i, ""), content: await readTextFile(path) };
}

/** Salva o projeto como `.notker`. Sem caminho, ou com `saveAs`, pede um; o GTK não
 *  acrescenta a extensão sozinho, então ela é garantida aqui. */
export async function saveProject(p: NotkerProject, opts: { saveAs?: boolean } = {}): Promise<string | null> {
  let path = opts.saveAs ? undefined : p.path;
  if (!path) {
    const name = (p.title || "Projeto").replace(/[\\/:*?"<>|]+/g, "-");
    const chosen = await save({ filters: [NOTKER_FILTER], defaultPath: `${name}.notker` });
    if (!chosen) return null;
    path = /\.notker$/i.test(chosen) ? chosen : `${chosen}.notker`;
  }
  const bundle = toBundle(p);
  await invoke("write_project", { path, project_json: bundle.project_json, files: bundle.files });
  return path;
}

/** Exporta o canto ativo como `.gabc` Gregorio puro (o buffer já é puro). */
export async function exportCurrentGabc(p: NotkerProject): Promise<string | null> {
  const path = await save({ filters: [GABC_FILTER] });
  if (!path) return null;
  await writeTextFile(path, getActiveChant(p).content);
  return path;
}

/** Exporta TODOS os cantos numa pasta escolhida espelhando a árvore: cada grupo vira
 *  subpasta e cada item leva prefixo de ordem (spec §4.2). `recursive: true` põe as
 *  subpastas no escopo do plugin-fs. */
export async function exportAllGabc(p: NotkerProject): Promise<number> {
  const dir = await open({ directory: true, recursive: true });
  if (typeof dir !== "string") return 0;
  const plan = gabcExportPlan(p);
  for (const d of plan.dirs) await mkdir(`${dir}/${d}`, { recursive: true });
  for (const f of plan.files) await writeTextFile(`${dir}/${f.path}`, f.content);
  return plan.files.length;
}
