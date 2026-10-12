/** Diálogo "Remover episemas e puncta mora": três botões liga/desliga (`aria-pressed`,
 *  segmentado do Parchment) sobre `openDialog` — sem checkbox nativo (WebKitGTK).
 *  O `openDialog` trata o segmentado como escolha única; aqui o clique é reinterpretado
 *  como liga/desliga por tipo, e o estado próprio (`on`) manda no resultado. */
import { openDialog } from "../ui/pd/dialog";
import { t, type MessageKey } from "../i18n";
import type { MarkCounts, MarkKinds } from "./strip-marks";

const KINDS: { key: keyof MarkKinds; labelKey: MessageKey }[] = [
  { key: "vertical", labelKey: "strip.kind.vertical" },
  { key: "horizontal", labelKey: "strip.kind.horizontal" },
  { key: "mora", labelKey: "strip.kind.mora" },
];

export type StripScope = "pasted" | "imported" | "selection" | "chant";

/** Abre o diálogo; null = cancelado. `last` = escolha anterior da sessão; `scope` diz de onde sairão os sinais. */
export async function openStripDialog(host: HTMLElement, counts: MarkCounts, last?: MarkKinds, scope: StripScope = "chant"): Promise<MarkKinds | null> {
  const on: MarkKinds = { vertical: false, horizontal: false, mora: false };
  for (const k of KINDS) on[k.key] = counts[k.key] > 0 && (last ? last[k.key] : true);
  const anyOn = (): boolean => KINDS.some((k) => on[k.key]);

  const p = openDialog(host, {
    title: t("strip.title"),
    body: t(`strip.body.${scope}` as MessageKey),
    segs: [{
      key: "kinds", label: t("strip.group"), value: "",
      options: KINDS.map((k) => ({ value: k.key, label: `${t(k.labelKey)} (${counts[k.key]})` })),
    }],
    actions: [
      { id: "cancel", label: t("common.cancel"), kind: "elevated" },
      { id: "remove", label: t("common.remove"), kind: "filled" },
    ],
  });

  // openDialog monta de forma síncrona: ajusta o DOM já presente no host.
  const btns = [...host.querySelectorAll<HTMLButtonElement>(".sc-seg button")];
  const action = host.querySelector<HTMLButtonElement>('.sc-dialog__actions button[data-action="remove"]');
  const sync = (): void => {
    btns.forEach((b, i) => b.setAttribute("aria-pressed", String(on[KINDS[i].key])));
    if (action) action.disabled = !anyOn();
  };
  // Contagem 0: aria-disabled (continua focável e é lido com "(0)"), nunca liga.
  const off = (i: number): boolean => counts[KINDS[i].key] === 0;
  btns.forEach((b, i) => { if (off(i)) b.setAttribute("aria-disabled", "true"); });
  btns.forEach((b, i) => b.addEventListener("click", () => {
    const k = KINDS[i].key;
    if (!off(i)) on[k] = !on[k];
    sync();
  }));
  sync();
  // O foco inicial foi para "Remover" antes de ele ser desabilitado: sem foco válido, Esc/Tab não chegam ao diálogo.
  const fa = document.activeElement;
  if (!fa || !host.contains(fa) || (fa as HTMLButtonElement).disabled) {
    host.querySelector<HTMLButtonElement>('.sc-dialog__actions button[data-action="cancel"]')?.focus();
  }
  // Enter confirma a ação padrão do openDialog; sem nada ligado, não pode confirmar.
  const guard = (e: KeyboardEvent): void => { if (e.key === "Enter" && !e.isComposing && !anyOn() && !(e.target instanceof HTMLButtonElement)) { e.stopPropagation(); e.preventDefault(); } };
  host.addEventListener("keydown", guard, true);

  const r = await p;
  host.removeEventListener("keydown", guard, true);
  if (r.action !== "remove" || !anyOn()) return null;
  return { ...on };
}
