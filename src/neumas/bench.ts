// src/neumas/bench.ts — cartão "Bancada" da vista Neumas: desenho grande, campo nabc
// (somente leitura para o catálogo; editável para sequência do usuário/nova, com
// validade e "Já existe"), nomes do usuário (fichas ★ ×, "Novo nome…"), referência,
// nota e ações. Só DOM + eventos; o estado vem de fora (render). O DOM só é refeito
// quando o ITEM muda — senão campos em edição perderiam foco/cursor.
import { t, type MessageKey } from "../i18n";
import type { EffectiveEntry, Family } from "../neume/types";
import type { NabcValidity } from "../neume/validate-nabc";
import { nameNeume } from "../neume/naming";
import { normalizeNabc } from "../neume/overlay";
import { debounce } from "../preview/debounce";

export type BenchItem =
  | { kind: "entry"; entry: EffectiveEntry }
  | { kind: "draft"; family: Family };
export interface BenchStatus {
  /** Valor do campo nabc (rascunho, edição de sequência ou cadeia do catálogo). */
  chain: string;
  validity: NabcValidity;
  /** Outro item que já representa esta cadeia (deduplicação). */
  duplicate: { id: string; label: string } | null;
  composing: boolean;
  /** Texto já traduzido (vem de `t("neumas.saving|saved|saveError")`) ou "". */
  saveState: string;
}
export type NameCommit = "enter" | "blur" | "flush";
export interface BenchCallbacks {
  onChainInput(nabc: string): void;
  /** Enter (`how: "enter"`) ou saída (`"blur"`) do campo nabc. */
  onChainCommit(nabc: string, how: "enter" | "blur"): void;
  /** `false` (ou promessa de `false`) = não gravou: o texto digitado fica no campo. */
  /** `how`: "enter" (explícito) ou "blur"/"flush" (o usuário só saiu do campo: não roubar o foco). */
  onAddName(name: string, how: NameCommit): boolean | void | Promise<boolean | void>;
  onRemoveName(name: string): void;
  onPromoteName(name: string): void;
  onNote(note: string): void;
  onInsert(): void;
  onToggleHidden(): void;
  onDelete(): void;
  onCreateFrom(): void;
  /** Botão "Salvar sequência" do rascunho (o mesmo que Enter na cadeia). */
  onSaveDraft(): void;
  onGoTo(id: string): void;
  onToggleCompose(): void;
  /** Esc num campo da bancada: volta à grade. */
  onFieldEscape(): void;
}
export interface Bench {
  render(item: BenchItem | null, st: BenchStatus): void;
  /** Foca "Novo nome…". false se não há item. */
  focusName(): boolean;
  focusChain(): void;
  /** Grava já a nota pendente (debounce), se houver. */
  flushNote(): void;
  /** Grava já o nome digitado em "Novo nome…" e ainda não confirmado, se houver. */
  flushName(): void;
}

export type DrawFn = (family: Family, nabc: string) => Promise<Element>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(label: string, cls: string, run: () => void): HTMLButtonElement {
  const b = el("button", `sc-btn ${cls}`, label);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}
/** Campo inline: Esc volta à grade; Enter (fora de IME) confirma. Nada vaza para o editor. */
function fieldKeys(f: HTMLElement, onEnter: (() => void) | null, onEsc: () => void): void {
  f.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onEsc(); return; }
    if (e.key === "Enter" && onEnter && !e.shiftKey && !e.ctrlKey) {
      if (e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onEnter();
    }
  });
}

const VALIDITY_LABEL: Record<NabcValidity, MessageKey | ""> = { empty: "", valid: "bench.valid", invalid: "bench.invalid", unknown: "" };

export function createBench(host: HTMLElement, cb: BenchCallbacks, draw: DrawFn): Bench {
  const card = el("section", "sc-panel neumas-bench");
  card.setAttribute("aria-label", t("bench.label"));
  host.appendChild(card);

  let key = "";
  let refs: {
    figure: HTMLElement; chain: HTMLInputElement; validity: HTMLElement; dup: HTMLElement;
    names: HTMLElement; newName: HTMLInputElement; note: HTMLTextAreaElement | null;
    hide: HTMLButtonElement | null; save: HTMLElement; compose: HTMLButtonElement | null;
    family: Family; editable: boolean; draft: boolean; savedChain: string;
    composeHelp: HTMLElement | null; saveSeq: HTMLButtonElement | null; refBody: HTMLElement;
  } | null = null;
  let drawn = "";
  /** Nota gravada do item atual e debounce da gravação ao digitar. */
  let savedNote = "";
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  const writeNote = (): void => {
    if (noteTimer !== null) { clearTimeout(noteTimer); noteTimer = null; }
    const ta = refs?.note;
    if (ta && ta.value !== savedNote) { savedNote = ta.value; cb.onNote(ta.value); }
  };
  let drawToken = 0;
  let commitNameRef: ((how: NameCommit) => void) | null = null;
  /** Campo "Novo nome…" do item na tela (null enquanto o DOM é refeito): um blur causado pela
   *  remoção do campo antigo nunca grava o texto no item novo. */
  let liveName: HTMLInputElement | null = null;
  /** Texto cuja gravação ainda não terminou (Enter seguido de blur não grava duas vezes). */
  let nameInflight: string | null = null;
  /** Último texto recusado (repetido etc.): sair do campo de novo não repete o aviso; Enter sim. */
  let nameRefused: string | null = null;

  /** Desenha e aplica só se o token ainda vale; desenho que rejeita mantém a figura anterior (sem rejeição solta). */
  const paint = (token: number, family: Family, nabc: string): void => {
    let p: Promise<Element>;
    try { p = Promise.resolve(draw(family, nabc)); } catch { return; }
    p.then((node) => {
      if (token === drawToken && refs) refs.figure.replaceChildren(node);
    }).catch(() => { /* desenho falhou: mantém a figura anterior */ });
  };
  const redraw = debounce((family: Family, nabc: string) => {
    const token = ++drawToken;
    paint(token, family, nabc);
  }, 120);
  const ensureDrawing = (family: Family, nabc: string, now: boolean): void => {
    const k = `${family}:${nabc}`;
    if (k === drawn) return;
    drawn = k;
    if (now) { redraw.cancel(); paint(++drawToken, family, nabc); }
    else redraw(family, nabc);
  };

  function build(item: BenchItem, st: BenchStatus): void {
    liveName = null;
    nameInflight = null;
    nameRefused = null;
    card.replaceChildren();
    const entry = item.kind === "entry" ? item.entry : null;
    const family = item.kind === "entry" ? item.entry.family : item.family;
    const editable = item.kind === "draft" || !!entry?.userSequence;

    const head = el("div", "sc-panel__head");
    const title = el("h2", "sc-panel__title",
      item.kind === "draft" ? t("bench.title.draft") : entry!.userSequence ? t("bench.title.mine") : entry!.synthetic ? t("bench.title.catalog") : t("bench.title.glyph"));
    head.appendChild(title);
    const body = el("div", "neumas-bench__body");

    const figure = el("div", "neumas-figure");
    figure.setAttribute("aria-hidden", "true");

    // ── cadeia nabc ──
    const chainField = el("label", "sc-field neumas-chain");
    chainField.appendChild(el("span", undefined, "nabc"));
    const row = el("div", "neumas-chain__row");
    const chain = el("input", "sc-input neumas-chain__input");
    chain.spellcheck = false;
    chain.autocomplete = "off";
    chain.value = st.chain;
    chain.readOnly = !editable;
    chain.setAttribute("aria-label", t("bench.chain.label"));
    const validity = el("span", "neumas-validity");
    validity.setAttribute("aria-live", "polite");
    row.append(chain, validity);
    let saveSeq: HTMLButtonElement | null = null;
    if (item.kind === "draft") {
      saveSeq = button(t("bench.saveSequence"), "sc-btn--filled neumas-save-seq", () => cb.onSaveDraft());
      row.appendChild(saveSeq);
    }
    chainField.appendChild(row);
    if (item.kind === "draft") chainField.appendChild(el("div", "neumas-chain__hint", t("bench.chain.hint")));
    const dup = el("div", "neumas-dup");
    if (editable) {
      chain.addEventListener("input", () => cb.onChainInput(chain.value));
      chain.addEventListener("blur", () => cb.onChainCommit(chain.value, "blur"));
      fieldKeys(chain, () => cb.onChainCommit(chain.value, "enter"), () => {
        // Esc numa sequência já gravada CANCELA a edição: restaura o valor gravado antes
        // de sair do campo (o blur seguinte não grava nada).
        if (entry?.userSequence && refs && chain.value !== refs.savedChain) { chain.value = refs.savedChain; cb.onChainInput(chain.value); }
        cb.onFieldEscape();
      });
    } else {
      fieldKeys(chain, null, () => cb.onFieldEscape());
    }
    let compose: HTMLButtonElement | null = null;
    let composeHelp: HTMLElement | null = null;
    const chainActions = el("div", "neumas-chain__actions");
    if (editable) {
      compose = button(t("bench.compose"), "sc-btn--elevated neumas-compose", () => cb.onToggleCompose());
      compose.dataset.tip = t("bench.compose.tip");
      chainActions.appendChild(compose);
      composeHelp = el("div", "neumas-compose-help");
      composeHelp.setAttribute("aria-live", "polite");
    } else {
      chainActions.appendChild(button(t("bench.createFrom"), "sc-btn--elevated neumas-create-from", () => cb.onCreateFrom()));
    }

    // ── nomes do usuário ──
    const namesBlock = el("div", "neumas-names");
    const namesHead = el("div", "neumas-names__head");
    namesHead.appendChild(el("span", "neumas-label", t("bench.yourNames")));
    const save = el("span", "neumas-savestate");
    save.setAttribute("aria-live", "polite");
    namesHead.appendChild(save);
    namesBlock.appendChild(namesHead);
    const names = el("div", "neumas-names__chips");
    const newName = el("input", "sc-input neumas-newname");
    newName.placeholder = t("bench.newName.placeholder");
    newName.setAttribute("aria-label", t("palette.newName"));
    /** Enter e saída do campo seguem o mesmo caminho. `false` = não gravou: o texto fica. */
    const commitName = (how: NameCommit): void => {
      if (newName !== liveName) return;
      const n = newName.value.trim();
      if (!n || nameInflight === n) return;
      if (how !== "enter" && nameRefused === n) return;
      nameRefused = null;
      nameInflight = n; // antes de chamar: a gravação pode mexer no foco e o blur voltaria aqui
      let r: boolean | void | Promise<boolean | void>;
      try { r = cb.onAddName(n, how); } catch (err) { nameInflight = null; throw err; }
      if (r && typeof (r as Promise<unknown>).then === "function") {
        void (r as Promise<boolean | void>).then(
          (ok) => {
            if (nameInflight === n) nameInflight = null;
            if (ok === false) nameRefused = n;
            else if (newName.value.trim() === n) newName.value = "";
          },
          () => { if (nameInflight === n) nameInflight = null; },
        );
        return;
      }
      nameInflight = null;
      if (r === false) nameRefused = n; else newName.value = "";
    };
    commitNameRef = commitName;
    fieldKeys(newName, () => commitName("enter"), () => {
      newName.value = ""; // Esc cancela o que foi digitado (o blur seguinte não grava)
      cb.onFieldEscape();
    });
    newName.addEventListener("blur", () => commitName("blur"));
    liveName = newName;
    namesBlock.append(names, newName);

    // ── referência ──
    const ref = el("div", "neumas-ref");
    ref.appendChild(el("span", "neumas-label", t("bench.reference")));
    const refBody = el("div", "neumas-ref__body");
    ref.appendChild(refBody);
    if (entry) {
      const naming = nameNeume(entry.nabc, entry.family);
      refBody.appendChild(el("div", "neumas-ref__name", entry.name));
      if (naming.systematic && naming.systematic !== entry.name) refBody.appendChild(el("div", "neumas-ref__sys", naming.systematic));
      const prov = entry.provenance?.[0];
      if (prov) refBody.appendChild(el("div", "neumas-ref__src", prov.source));
    }

    // ── nota ──
    let note: HTMLTextAreaElement | null = null;
    const noteField = el("label", "sc-field neumas-note");
    if (entry) {
      noteField.appendChild(el("span", undefined, t("bench.note")));
      note = el("textarea", "sc-textarea neumas-note__input");
      note.rows = 2;
      note.value = entry.userNote ?? "";
      savedNote = note.value;
      note.addEventListener("input", () => {
        if (noteTimer !== null) clearTimeout(noteTimer);
        noteTimer = setTimeout(writeNote, 400);
      });
      note.addEventListener("blur", () => writeNote());
      fieldKeys(note, null, () => cb.onFieldEscape());
      noteField.appendChild(note);
    }

    // ── ações ──
    const actions = el("div", "neumas-actions");
    const insert = button(t("bench.insert"), "sc-btn--elevated neumas-insert", () => cb.onInsert());
    insert.dataset.tip = t("bench.insert.tip");
    actions.appendChild(insert);
    let hide: HTMLButtonElement | null = null;
    if (entry) {
      hide = button(entry.hidden ? t("bench.show") : t("bench.hide"), "sc-btn--elevated neumas-hide", () => cb.onToggleHidden());
      actions.appendChild(hide);
    }
    if (entry?.userSequence) actions.appendChild(button(t("bench.deleteSequence"), "sc-btn--elevated sc-btn--danger neumas-delete", () => cb.onDelete()));

    if (composeHelp) chainActions.appendChild(composeHelp);
    body.append(figure, chainField, dup, chainActions, namesBlock, ref);
    if (entry) body.appendChild(noteField);
    body.append(actions);
    card.append(head, body);
    refs = {
      figure, chain, validity, dup, names, newName, note, hide, save, compose, family, editable,
      draft: item.kind === "draft", savedChain: entry?.userSequence ? entry.nabc : "", composeHelp, saveSeq, refBody,
    };
    drawn = "";
  }

  function patch(item: BenchItem, st: BenchStatus): void {
    const r = refs!;
    const entry = item.kind === "entry" ? item.entry : null;
    if (document.activeElement !== r.chain && r.chain.value !== st.chain) r.chain.value = st.chain;
    const vkey = VALIDITY_LABEL[st.validity];
    r.validity.textContent = r.editable && vkey ? t(vkey) : "";
    r.validity.dataset.state = st.validity;
    r.chain.setAttribute("aria-invalid", String(r.editable && st.validity === "invalid"));
    r.dup.replaceChildren();
    if (st.duplicate && r.editable) {
      r.dup.append(el("span", undefined, t("bench.duplicate", { label: st.duplicate.label })));
      const go = button(t("bench.goTo"), "sc-btn--elevated neumas-goto", () => cb.onGoTo(st.duplicate!.id));
      r.dup.appendChild(go);
    }
    r.compose?.setAttribute("aria-pressed", String(st.composing));
    if (r.composeHelp) r.composeHelp.textContent = st.composing ? t("bench.composeHelp") : "";
    if (r.saveSeq) r.saveSeq.disabled = !((st.validity === "valid" || st.validity === "unknown") && st.chain.trim() && !st.duplicate);
    if (entry?.userSequence) r.savedChain = entry.nabc;
    if (r.draft) {
      const ok = (st.validity === "valid" || st.validity === "unknown") && normalizeNabc(st.chain);
      if (ok) {
        const nm = nameNeume(normalizeNabc(st.chain), r.family);
        r.refBody.replaceChildren(el("div", "neumas-ref__name", nm.displayNames[0] ?? nm.systematic));
      } else r.refBody.replaceChildren(el("div", "neumas-ref__sys", t("bench.validLater")));
    }
    // nomes
    r.names.replaceChildren();
    const userNames = entry?.userNames ?? [];
    userNames.forEach((n, i) => {
      const chip = el("span", "sc-chip neumas-name" + (i === 0 ? " sc-chip--active" : ""));
      chip.appendChild(el("span", "neumas-name__text", n));
      if (i > 0) {
        const star = el("button", "neumas-name__star", "★");
        star.type = "button";
        star.setAttribute("aria-label", t("bench.makePrimary", { name: n }));
        star.addEventListener("click", () => cb.onPromoteName(n));
        chip.appendChild(star);
      }
      const x = el("button", "neumas-name__remove", "×");
      x.type = "button";
      x.setAttribute("aria-label", t("bench.removeName", { name: n }));
      x.addEventListener("click", () => cb.onRemoveName(n));
      chip.appendChild(x);
      r.names.appendChild(chip);
    });
    if (!userNames.length) r.names.appendChild(el("span", "neumas-names__none", t("bench.noNames")));
    if (r.note && entry) {
      savedNote = entry.userNote ?? "";
      if (document.activeElement !== r.note && noteTimer === null) r.note.value = savedNote;
    }
    if (r.hide && entry) r.hide.textContent = entry.hidden ? t("bench.show") : t("bench.hide");
    r.save.textContent = st.saveState;
    r.save.dataset.state = st.saveState;
    // CSS por tipo (o texto muda com o idioma).
    r.save.dataset.kind = st.saveState === t("neumas.saved") ? "saved" : st.saveState === t("neumas.saveError") ? "error" : "";
    ensureDrawing(r.family, st.chain, item.kind === "entry" && !entry?.userSequence);
  }

  return {
    render(item, st) {
      const k = !item ? "" : item.kind === "draft" ? `draft:${item.family}` : `entry:${item.entry.id}`;
      if (!item) {
        key = ""; refs = null; liveName = null; redraw.cancel();
        card.replaceChildren(el("div", "sc-empty", t("bench.empty")));
        return;
      }
      if (k !== key) { key = k; build(item, st); }
      patch(item, st);
    },
    focusName() { if (!refs) return false; refs.newName.focus(); return true; },
    flushNote() { writeNote(); },
    flushName() { commitNameRef?.("flush"); },
    focusChain() { if (!refs) return; refs.chain.focus(); refs.chain.setSelectionRange(refs.chain.value.length, refs.chain.value.length); },
  };
}
