// src/app/session.ts
/** "Salvar alterações?" (spec §4.5): ao abrir/criar outro projeto e ao fechar a janela.
 *  Regra de ouro: fechar NUNCA fica bloqueado — erro ao salvar reabre a pergunta com a
 *  mensagem, e "Não salvar" continua disponível. (Recentes e recuperação: etapa 1b-2.) */
import { openDialog } from "../ui/pd/dialog";

export type SaveChoice = "save" | "discard" | "cancel";
export interface UnsavedGuard {
  isDirty(): boolean;
  title(): string;
  save(): Promise<boolean>;
  ask(title: string, error?: string): Promise<SaveChoice>;
}

export async function askSaveChanges(host: HTMLElement, title: string, error?: string): Promise<SaveChoice> {
  const r = await openDialog(host, {
    title: `Salvar alterações em “${title}”?`,
    body: error ?? "Se não salvar, as alterações serão perdidas.",
    actions: [
      { id: "discard", label: "Não salvar", kind: "danger" },
      { id: "cancel", label: "Cancelar", kind: "elevated" },
      { id: "save", label: "Salvar", kind: "filled" },
    ],
  });
  return r.action === "save" ? "save" : r.action === "discard" ? "discard" : "cancel";
}

export async function resolveUnsaved(g: UnsavedGuard): Promise<boolean> {
  if (!g.isDirty()) return true;
  let error: string | undefined;
  for (;;) {
    const choice = await g.ask(g.title(), error);
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    try {
      return await g.save();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = `Não foi possível salvar: ${msg.replace(/\.+$/, "")}. Escolha “Não salvar” para continuar sem salvar.`;
    }
  }
}
