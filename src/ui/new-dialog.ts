import type { Family } from "../neume/types";
import { openDialog } from "./pd/dialog";
import { t } from "../i18n";

export interface NewDocResult { family: Family; name?: string; office?: string }

/** Diálogo "Novo projeto" / "Novo canto" sobre o diálogo do Parchment (host
 *  pré-existente, segmentado em vez de radio — ver pd/dialog.ts). */
export async function newDocumentDialog(
  host: HTMLElement,
  opts: { title: string; okLabel?: string; family?: Family },
): Promise<NewDocResult | null> {
  const r = await openDialog(host, {
    title: opts.title,
    fields: [
      { key: "name", label: t("newChant.name"), placeholder: "Puer natus est", serif: true },
      { key: "office", label: t("guide.office"), placeholder: t("newChant.office.placeholder") },
    ],
    segs: [{ key: "family", label: t("common.family"), value: opts.family ?? "stgall",
      options: [{ value: "stgall", label: "St. Gall" }, { value: "laon", label: "Laon" }] }],
    actions: [
      { id: "cancel", label: t("common.cancel"), kind: "elevated" },
      { id: "ok", label: opts.okLabel ?? t("common.create"), kind: "filled" },
    ],
  });
  if (r.action !== "ok") return null;
  return {
    family: r.values.family === "laon" ? "laon" : "stgall",
    ...(r.values.name ? { name: r.values.name } : {}),
    ...(r.values.office ? { office: r.values.office } : {}),
  };
}
