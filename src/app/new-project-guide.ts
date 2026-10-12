// src/app/new-project-guide.ts
/** Criação guiada de projeto (adendo §11, no estilo do Mocquereau): cartão central com
 *  passos — 1 Projeto (título) · 2 Família padrão (segmentado) · 3 Primeiro canto (nome,
 *  ofício e, opcional, gabc colado ou importado). Nada é criado até "Criar projeto".
 *  Esc cancela (com rascunho, pede confirmação). Sem radio/select nativos (WebKitGTK).
 *  Texto do usuário SEMPRE por textContent/value. */
import { t, type MessageKey } from "../i18n";
import type { Family } from "../neume/types";
import { type NotkerProject, newChant, gabcSkeleton, gabcName } from "../project/tree";
import { icon } from "../ui/pd/icons";

export interface NewProjectDraft { title: string; family: Family; chantName: string; office: string; gabc: string }

export const emptyDraft = (): NewProjectDraft => ({ title: "", family: "stgall", chantName: "", office: "", gabc: "" });
/** Há algo digitado que o Esc jogaria fora (a família sozinha não conta). */
export const hasDraft = (d: NewProjectDraft): boolean =>
  [d.title, d.chantName, d.office, d.gabc].some((s) => s.trim() !== "");
export const familyName = (f: Family): string => (f === "laon" ? "Laon" : "St. Gall");

/** O projeto do rascunho. gabc colado vale como está (o cabeçalho dele manda; o ofício
 *  do guia só entra no esqueleto); sem nome, o canto usa o `name:` do gabc ou "Novo". */
export function projectFromDraft(d: NewProjectDraft): NotkerProject {
  const pasted = d.gabc.trim() !== "";
  const chantTitle = d.chantName.trim() || (pasted ? gabcName(d.gabc, t("project.defaultChant")) : t("project.defaultChant"));
  const chant = newChant({ title: chantTitle, content: pasted ? d.gabc : gabcSkeleton(chantTitle, d.office) });
  return {
    schema: 2, kind: "notker-project", title: d.title.trim() || t("project.untitled"),
    family: d.family, root: [chant], activeId: chant.id,
  };
}

export interface GuideDeps {
  onCreate(d: NewProjectDraft): void;
  onCancel(): void;
  /** Esc/Cancelar com rascunho: true = descartar. */
  confirmDiscard(): Promise<boolean>;
  pickGabc(): Promise<{ name: string; content: string } | null>;
}
export interface GuideHandle { destroy(): void; focus(): void; draft(): NewProjectDraft }

type Step = 0 | 1 | 2;
const LABELS = ["guide.step.project", "guide.step.family", "guide.step.firstChant"] as const satisfies readonly MessageKey[];
let seq = 0;

function btn(label: string, cls: string, run: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", run);
  return b;
}
function hint(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "notker-step__hint";
  p.textContent = text;
  return p;
}
/** keyCode 229 = tecla tratada pelo IME (o WebKitGTK nem sempre marca isComposing). */
const composing = (e: KeyboardEvent): boolean => e.isComposing || e.keyCode === 229;
const enterKey = (e: KeyboardEvent): boolean => e.key === "Enter" && !composing(e);

export function mountNewProjectGuide(
  host: HTMLElement, deps: GuideDeps, initial: NewProjectDraft = emptyDraft(),
): GuideHandle {
  const d: NewProjectDraft = { ...initial };
  const uid = ++seq;
  let step: Step = 0;
  let asking = false;
  let alive = true;
  const card = document.createElement("div");
  card.className = "notker-guide__card";
  host.replaceChildren(card);

  function go(next: Step): void { step = next; render(); focusCurrent(); }
  function create(): void { if (alive) deps.onCreate({ ...d }); }

  function field(label: string, placeholder: string, value: string, set: (v: string) => void, cls = "sc-input"): HTMLInputElement {
    const i = document.createElement("input");
    i.className = cls;
    i.value = value;
    i.placeholder = placeholder;
    i.setAttribute("aria-label", label);
    i.addEventListener("input", () => set(i.value));
    return i;
  }
  function next(label: string, run: () => void): HTMLElement {
    const row = document.createElement("div");
    row.className = "notker-step__next";
    row.appendChild(btn(label, "sc-btn sc-btn--filled", run));
    return row;
  }

  function body(i: Step): HTMLElement[] {
    if (i === 0) {
      const ti = field(t("guide.projectTitle"), t("guide.projectTitle.placeholder"), d.title, (v) => { d.title = v; }, "sc-input notker-guide__title");
      ti.addEventListener("keydown", (e) => { if (enterKey(e)) { e.preventDefault(); go(1); } });
      return [ti, next(t("common.continue"), () => go(1))];
    }
    if (i === 1) {
      const seg = document.createElement("div");
      seg.className = "sc-seg";
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", t("guide.step.family"));
      const fams: Family[] = ["stgall", "laon"];
      const buttons = fams.map((f) => {
        const b = btn(familyName(f), "", () => {
          d.family = f;
          buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        });
        b.dataset.family = f;
        b.setAttribute("aria-pressed", String(d.family === f));
        b.addEventListener("keydown", (e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const other = buttons[buttons[0] === b ? 1 : 0];
          other.click();
          other.focus();
        });
        return b;
      });
      seg.append(...buttons);
      return [hint(t("guide.family.hint")), seg, next(t("common.continue"), () => go(2))];
    }
    const onEnter = (e: KeyboardEvent) => { if (enterKey(e)) { e.preventDefault(); create(); } };
    const name = field(t("guide.chantName"), "Puer natus est", d.chantName, (v) => { d.chantName = v; }, "sc-input notker-guide__serif");
    name.addEventListener("keydown", onEnter);
    const office = field(t("guide.office"), t("guide.office.placeholder"), d.office, (v) => { d.office = v; });
    office.addEventListener("keydown", onEnter);
    const ta = document.createElement("textarea");
    ta.className = "sc-input sc-textarea notker-guide__gabc";
    ta.value = d.gabc;
    ta.spellcheck = false;
    ta.placeholder = "name: Puer natus est;\n%%\n(c4) Pu(g)er(h) ...";
    ta.setAttribute("aria-label", t("guide.gabc.label"));
    ta.addEventListener("input", () => { d.gabc = ta.value; });
    const imp = btn(t("cmd.project.importGabc"), "sc-btn sc-btn--elevated", () => {
      void deps.pickGabc().catch(() => null).then((f) => {
        if (!f || !alive) return;
        d.gabc = f.content;
        ta.value = f.content;
        if (!d.chantName.trim()) { d.chantName = gabcName(f.content, f.name); name.value = d.chantName; }
      });
    });
    const row = document.createElement("div");
    row.className = "notker-step__next";
    const grow = document.createElement("span");
    grow.className = "notker-grow";
    row.append(imp, grow, btn(t("guide.create"), "sc-btn sc-btn--filled", create));
    return [name, office, hint(t("guide.gabc.hint")), ta, row];
  }

  function render(): void {
    const ol = document.createElement("ol");
    ol.className = "notker-steps";
    ([0, 1, 2] as Step[]).forEach((i) => {
      const state = i < step ? "done" : i === step ? "current" : "todo";
      const li = document.createElement("li");
      li.className = `notker-step is-${state}`;
      if (state === "current") li.setAttribute("aria-current", "step");
      const circle = document.createElement("span");
      circle.className = "notker-step__circle";
      circle.setAttribute("aria-hidden", "true");
      if (state === "done") circle.appendChild(icon("check"));
      else circle.textContent = String(i + 1);
      const main = document.createElement("div");
      main.className = "notker-step__main";
      const label = document.createElement("div");
      label.className = "notker-step__label";
      label.id = `notker-step-${uid}-${i}`;
      label.textContent = t(LABELS[i]);
      main.appendChild(label);
      if (state === "done") {
        const sum = document.createElement("div");
        sum.className = "notker-step__summary";
        sum.textContent = i === 0 ? d.title.trim() || t("project.untitled") : familyName(d.family);
        main.appendChild(sum);
      }
      if (state === "current") main.append(...body(i));
      li.append(circle, main);
      if (state === "done") {
        const change = btn(t("guide.change"), "sc-btn notker-step__change", () => go(i));
        change.setAttribute("aria-describedby", label.id);
        li.appendChild(change);
      } else li.appendChild(document.createElement("span"));
      ol.appendChild(li);
    });
    card.replaceChildren(ol, btn(t("common.cancel"), "sc-btn notker-guide__cancel", () => { void requestCancel(); }));
  }

  function focusCurrent(): void {
    card.querySelector<HTMLElement>('.notker-step.is-current input, .notker-step.is-current [aria-pressed="true"]')?.focus();
  }

  async function requestCancel(): Promise<void> {
    if (asking || !alive) return;
    if (hasDraft(d)) {
      asking = true;
      try { if (!(await deps.confirmDiscard())) return; }
      finally { asking = false; }
    }
    if (alive) deps.onCancel();
  }

  // Esc em qualquer ponto do guia (inclusive num campo: aqui ele não tem outro sentido),
  // menos compondo acento (IME) ou com diálogo/menu aberto (que tratam o próprio Esc).
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "Escape" || e.defaultPrevented || composing(e) || asking) return;
    if (document.querySelector('[role="dialog"], [role="menu"]')) return;
    e.preventDefault();
    void requestCancel();
  }
  document.addEventListener("keydown", onKey);
  render();

  return {
    destroy() {
      alive = false;
      document.removeEventListener("keydown", onKey);
      host.replaceChildren();
    },
    focus: focusCurrent,
    draft: () => ({ ...d }),
  };
}
