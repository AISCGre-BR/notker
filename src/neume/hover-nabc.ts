import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt, outermostNabcAt, nabcPartsAt } from "../editor/context";
import type { EffectiveEntry, Family } from "./types";
import { glyphSvgEl } from "./render";
import { describeToken } from "./decode";

function familyLabel(f: Family): string {
  return f === "stgall" ? "St. Gall" : "Laon";
}

export function nabcHover(
  getTree: () => Tree | null,
  lookupByNabc: (nabc: string) => EffectiveEntry[],
  activeFamily: () => Family,
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
          const desc = describeToken(token);
          const baseEntries = desc.isKnownBase ? lookupByNabc(desc.base) : [];
          const baseSorted = baseEntries.slice().sort(
            (a, b) => Number(b.family === af) - Number(a.family === af),
          );
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
          if (baseSorted.length > 0) row.appendChild(glyphSvgEl(baseSorted[0].svg, 32));
          const info = document.createElement("div");
          const fam = baseSorted.length > 0
            ? ` · <em>${familyLabel(baseSorted[0].family as Family)}</em>` : "";
          info.innerHTML =
            `<strong>${desc.baseName}</strong>${fam}` +
            `<br><small>composto: <code>${token}</code></small>` +
            (desc.letters.length
              ? `<br><small>letra significativa: <b>${desc.letters.join(", ")}</b></small>` : "");
          row.appendChild(info);
          dom.appendChild(row);
        } else {
          for (const entry of sorted) {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";

            row.appendChild(glyphSvgEl(entry.svg, 32));

            const info = document.createElement("div");
            const isActive = entry.family === af;
            const familyStr = familyLabel(entry.family as Family);
            const activeMark = isActive ? " <small>• ativa</small>" : "";
            info.innerHTML =
              `<strong>${entry.displayNames[0]}</strong> · <em>${familyStr}</em>${activeMark}` +
              (entry.qualifiers.length ? `<br><small>${entry.qualifiers.join(" ")}</small>` : "") +
              (entry.meaning ? `<br>${entry.meaning}` : "");
            row.appendChild(info);
            dom.appendChild(row);
          }
        }

        // ── Partes individuais (apenas para neumas genuinamente compostos) ──
        // Exibe somente quando há 2+ partes elementares distintas.
        if (rawParts.length >= 2) {
          const sep = document.createElement("div");
          sep.style.cssText =
            "margin-top:6px;padding-top:4px;border-top:1px solid #ccc;" +
            "font-size:0.85em;color:#666;";
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
              const label = document.createElement("span");
              label.style.cssText = "font-size:0.85em;";
              label.innerHTML =
                `<strong>${best.displayNames[0]}</strong>` +
                ` · <em>${familyLabel(best.family as Family)}</em>`;
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
