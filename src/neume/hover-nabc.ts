import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt, outermostNabcAt, nabcPartsAt } from "../editor/context";
import type { EffectiveEntry, Family } from "./types";
import { glyphSvgEl } from "./render";
import { describeToken } from "./decode";
import { nameNeume } from "./naming";

function familyLabel(f: Family): string {
  return f === "stgall" ? "St. Gall" : "Laon";
}

export function buildEntryRow(
  entry: EffectiveEntry, isActive: boolean,
  onName?: (ids: string[], name: string) => void | Promise<void>,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "neume-tip-row";
  row.appendChild(glyphSvgEl(entry.svg, 32));
  const info = document.createElement("div");
  info.className = "neume-tip-info";
  const names = document.createElement("strong");
  names.className = "neume-tip-name";
  names.textContent = entry.displayNames[0];
  const fam = document.createElement("span");
  fam.className = "neume-tip-fam";
  fam.textContent = familyLabel(entry.family as Family) + (isActive ? " · ativa" : "");
  info.append(names, document.createTextNode(" "), fam);
  if (entry.qualifiers.length) info.append(Object.assign(document.createElement("small"), { textContent: entry.qualifiers.join(" ") }));
  if (entry.meaning) info.append(Object.assign(document.createElement("div"), { textContent: entry.meaning }));
  row.appendChild(info);
  if (onName) {
    const showButton = (): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sc-btn neume-name-btn";
      b.textContent = "Nomear…";
      b.addEventListener("mousedown", (ev) => ev.preventDefault()); // não fecha o tooltip
      b.addEventListener("click", () => {
        const f = document.createElement("input");
        f.className = "sc-input neume-name-input";
        f.placeholder = "Novo nome";
        // nada por baixo (editor) reage a cliques/teclas no campo
        f.addEventListener("mousedown", (ev) => ev.stopPropagation());
        f.addEventListener("click", (ev) => ev.stopPropagation());
        f.addEventListener("keydown", (ev) => {
          ev.stopPropagation();
          if (ev.key === "Escape") { ev.preventDefault(); f.replaceWith(showButton()); }
          else if (ev.key === "Enter") {
            if (ev.isComposing) return; // IME / teclas mortas
            ev.preventDefault();
            const n = f.value.trim();
            if (!n) return;
            void onName([entry.id], n);
            if (!entry.displayNames.some((d) => d.toLowerCase() === n.toLowerCase())) {
              names.textContent = `${entry.displayNames[0]} · ${n}`;
            }
            f.replaceWith(showButton());
          }
        });
        b.replaceWith(f);
        f.focus();
      });
      return b;
    };
    row.appendChild(showButton());
  }
  return row;
}

export function buildPartLabel(best: EffectiveEntry): HTMLElement {
  const label = document.createElement("span");
  label.style.cssText = "font-size:0.85em;";
  const strong = document.createElement("strong");
  strong.textContent = best.displayNames[0];
  const em = document.createElement("em");
  em.textContent = familyLabel(best.family as Family);
  label.append(strong, " · ", em);
  return label;
}

export function buildUnknownInfo(
  token: string, displayNames: string[], baseFamily: Family | null,
  letters: string[], source?: string,
): HTMLElement {
  const info = document.createElement("div");
  displayNames.forEach((n, i) => {
    if (i > 0) info.append(" · ");
    const el = document.createElement(i === 0 ? "strong" : "span");
    el.textContent = n;
    info.append(el);
  });
  if (baseFamily) {
    const em = document.createElement("em");
    em.textContent = familyLabel(baseFamily);
    info.append(" · ", em);
  }
  const line = (build: (small: HTMLElement) => void): void => {
    const small = document.createElement("small");
    build(small);
    info.append(document.createElement("br"), small);
  };
  line((sm) => {
    const code = document.createElement("code");
    code.textContent = token;
    sm.append("composto: ", code);
  });
  if (letters.length) line((sm) => {
    const b = document.createElement("b");
    b.textContent = letters.join(", ");
    sm.append("letra significativa: ", b);
  });
  if (source) line((sm) => { sm.textContent = `fonte: ${source}`; });
  return info;
}

export function nabcHover(
  getTree: () => Tree | null,
  lookupByNabc: (nabc: string) => EffectiveEntry[],
  activeFamily: () => Family,
  onName?: (ids: string[], name: string) => void | Promise<void>,
) {
  return hoverTooltip((view, pos) => {
    const tree = getTree();
    if (!tree) return null;
    const doc = view.state.doc.toString();

    // Tenta primeiro o neuma MAIS EXTERNO (composto inteiro).
    let ctx = outermostNabcAt(tree as any, doc, pos);
    let token = ctx.inNabc
      ? doc.slice(ctx.tokenFrom, ctx.tokenTo).replace(/^\|/, "").trim()
      : "";

    let composite: EffectiveEntry[] = ctx.inNabc ? lookupByNabc(token) : [];

    // Fallback: token interno (parcial) se o composto não deu resultado.
    if (!ctx.inNabc || composite.length === 0) {
      const inner = nabcContextAt(tree as any, doc, pos);
      if (!inner.inNabc) return null;
      const innerToken = doc.slice(inner.tokenFrom, inner.tokenTo).replace(/^\|/, "").trim();
      const innerEntries = lookupByNabc(innerToken);
      if (!ctx.inNabc || innerEntries.length > 0) {
        ctx = inner;
        token = innerToken;
        composite = innerEntries;
      }
      if (!ctx.inNabc) return null;
    }

    // Partes elementares do neuma externo.
    const rawParts = nabcPartsAt(tree as any, doc, pos);

    // Ordena composto: família ativa primeiro.
    const af = activeFamily();
    const sorted = composite.slice().sort(
      (a, b) => Number(b.family === af) - Number(a.family === af),
    );

    return {
      pos: ctx.tokenFrom, end: ctx.tokenTo, above: true,
      create(_view: EditorView) {
        const dom = document.createElement("div");
        dom.className = "neume-tooltip";

        // ── Cabeçalho: neuma composto inteiro ──────────────────────────────
        if (sorted.length === 0) {
          // Token composto fora do catálogo: decodifica base + letras significativas
          // e mostra ao menos o neuma-base (com imagem, se o base existir no catálogo).
          // F4: fora do catálogo → motor de nomes (canônico(s) da sinopse +
          // sistemático + proveniência), em vez de só o nome-base.
          const desc = describeToken(token);
          const naming = nameNeume(token, af);
          const baseEntries = desc.isKnownBase ? lookupByNabc(desc.base) : [];
          const baseSorted = baseEntries.slice().sort(
            (a, b) => Number(b.family === af) - Number(a.family === af),
          );
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
          if (baseSorted.length > 0) row.appendChild(glyphSvgEl(baseSorted[0].svg, 32));
          const info = buildUnknownInfo(
            token, naming.displayNames,
            baseSorted.length > 0 ? (baseSorted[0].family as Family) : null,
            desc.letters, naming.provenance[0]?.source,
          );
          row.appendChild(info);
          dom.appendChild(row);
        } else {
          for (const entry of sorted) dom.appendChild(buildEntryRow(entry, entry.family === af, onName));
        }

        // ── Partes individuais (apenas para neumas genuinamente compostos) ──
        // Exibe somente quando há 2+ partes elementares distintas.
        if (rawParts.length >= 2) {
          const sep = document.createElement("div");
          sep.style.cssText =
            "margin-top:6px;padding-top:4px;border-top:1px solid var(--rule);" +
            "font-size:0.85em;color:var(--ink-muted);";
          sep.textContent = "partes:";
          dom.appendChild(sep);

          for (const part of rawParts) {
            const partText = doc.slice(part.from, part.to).replace(/^\|/, "").trim();
            const partEntries = lookupByNabc(partText);
            // Ordena a família ativa primeiro também nas partes.
            const partSorted = partEntries.slice().sort(
              (a, b) => Number(b.family === af) - Number(a.family === af),
            );

            const partRow = document.createElement("div");
            partRow.style.cssText =
              "display:flex;align-items:center;gap:6px;margin-top:3px;";

            if (partSorted.length > 0) {
              // Mostra apenas a entrada da família ativa (ou a primeira disponível).
              const best = partSorted[0];
              partRow.appendChild(glyphSvgEl(best.svg, 20));
              const label = buildPartLabel(best);
              partRow.appendChild(label);
            } else {
              // Sem entrada no DB: mostra o texto bruto.
              const label = document.createElement("span");
              label.style.cssText = "font-size:0.85em;font-family:monospace;";
              label.textContent = partText;
              partRow.appendChild(label);
            }

            dom.appendChild(partRow);
          }
        }

        return { dom };
      },
    };
  });
}
