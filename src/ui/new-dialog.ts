import type { Family } from "../neume/types";
import { openDialog } from "./pd/dialog";

export interface NewDocResult { family: Family; name?: string; office?: string }

/** Diálogo "Novo projeto" / "Novo canto" sobre o diálogo do Parchment (host
 *  pré-existente, segmentado em vez de radio — ver pd/dialog.ts). */
export async function newDocumentDialog(
  host: HTMLElement,
  opts: { title: string; warning?: string; okLabel?: string; family?: Family },
): Promise<NewDocResult | null> {
  const r = await openDialog(host, {
    title: opts.title,
    body: opts.warning,
    fields: [
      { key: "name", label: "Nome", placeholder: "Puer natus est", serif: true },
      { key: "office", label: "Ofício (opcional)", placeholder: "Intróito" },
    ],
    segs: [{ key: "family", label: "Família", value: opts.family ?? "stgall",
      options: [{ value: "stgall", label: "St. Gall" }, { value: "laon", label: "Laon" }] }],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "elevated" },
      { id: "ok", label: opts.okLabel ?? "Criar", kind: "filled" },
    ],
  });
  if (r.action !== "ok") return null;
  return {
    family: r.values.family === "laon" ? "laon" : "stgall",
    ...(r.values.name ? { name: r.values.name } : {}),
    ...(r.values.office ? { office: r.values.office } : {}),
  };
}
