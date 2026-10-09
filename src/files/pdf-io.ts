/** Onde gravar o PDF e a gravação. O diálogo de salvar (plugin-dialog) põe o caminho
 *  escolhido no escopo do plugin-fs — SÓ esse caminho, exato. Por isso o arquivo é gravado
 *  no caminho devolvido, sem acrescentar ".pdf" (outro caminho seria recusado pelo escopo);
 *  o nome sugerido já termina em .pdf. Permissão: `fs:allow-write-file` (bytes). */
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

const PDF_FILTER = { name: "PDF", extensions: ["pdf"] };

export async function pickPdfPath(defaultName: string): Promise<string | null> {
  const path = await save({ filters: [PDF_FILTER], defaultPath: defaultName });
  return path || null;
}

export async function writePdf(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes);
}
