/** Diálogo "Remover episemas e puncta mora": três botões liga/desliga (`aria-pressed`,
 *  segmentado do Parchment) sobre `openDialog` — sem checkbox nativo (WebKitGTK).
 *  O `openDialog` trata o segmentado como escolha única; aqui o clique é reinterpretado
 *  como liga/desliga por tipo, e o estado próprio (`on`) manda no resultado. */
import { openDialog } from "../ui/pd/dialog";
import type { MarkCounts, MarkKinds } from "./strip-marks";

const KINDS: { key: keyof MarkKinds; label: string }[] = [
  { key: "vertical", label: "Episemas verticais" },
  { key: "horizontal", label: "Episemas horizontais" },
  { key: "mora", label: "Puncta mora" },
];

export type StripScope = "pasted" | "imported" | "selection" | "chant";
const SCOPE_TEXT: Record<StripScope, string> = {
  pasted: "do trecho colado", imported: "do canto importado", selection: "do trecho selecionado", chant: "do canto atual",
};

/** Abre o diálogo; null = cancelado. `last` = escolha anterior da sessão; `scope` diz de onde sairão os sinais. */
export async function openStripDialog(host: HTMLElement, counts: MarkCounts, last?: MarkKinds, scope: StripScope = "chant"): Promise<MarkKinds | null> {
  const on: MarkKinds = { vertical: false, horizontal: false, mora: false };
  for (const k of KINDS) on[k.key] = counts[k.key] > 0 && (last ? last[k.key] : true);
  const anyOn = (): boolean => KINDS.some((k) => on[k.key]);

  const p = openDialog(host, {
    title: "Remover episemas e puncta mora",
    body: `Escolha o que tirar das notas ${SCOPE_TEXT[scope]}. O nabc, as letras e as divisões não são alterados.`,
    segs: [{
      key: "kinds", label: "Remover", value: "",
      options: KINDS.map((k) => ({ value: k.key, label: `${k.label} (${counts[k.key]})`, disabled: counts[k.key] === 0 })),
    }],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "elevated" },
      { id: "remove", label: "Remover", kind: "filled" },
    ],
  });

  // openDialog monta de forma síncrona: ajusta o DOM já presente no host.
  const btns = [...host.querySelectorAll<HTMLButtonElement>(".sc-seg button")];
  const action = [...host.querySelectorAll<HTMLButtonElement>(".sc-dialog__actions button")].find((b) => b.textContent === "Remover");
  const sync = (): void => {
    btns.forEach((b, i) => b.setAttribute("aria-pressed", String(on[KINDS[i].key])));
    if (action) action.disabled = !anyOn();
  };
  btns.forEach((b, i) => b.addEventListener("click", () => {
    const k = KINDS[i].key;
    if (!b.disabled) on[k] = !on[k];
    sync();
  }));
  sync();
  // O foco inicial foi para "Remover" antes de ele ser desabilitado: sem foco válido, Esc/Tab não chegam ao diálogo.
  const fa = document.activeElement;
  if (!fa || !host.contains(fa) || (fa as HTMLButtonElement).disabled) {
    [...host.querySelectorAll<HTMLButtonElement>(".sc-dialog__actions button")].find((b) => b.textContent === "Cancelar")?.focus();
  }
  // Enter confirma a ação padrão do openDialog; sem nada ligado, não pode confirmar.
  const guard = (e: KeyboardEvent): void => { if (e.key === "Enter" && !e.isComposing && !anyOn() && !(e.target instanceof HTMLButtonElement)) { e.stopPropagation(); e.preventDefault(); } };
  host.addEventListener("keydown", guard, true);

  const r = await p;
  host.removeEventListener("keydown", guard, true);
  if (r.action !== "remove" || !anyOn()) return null;
  return { ...on };
}
