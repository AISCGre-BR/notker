/** wave-panel.ts — a onda de interpretação redesenhada como linha contínua (a voz).
 *  Um path SVG por nota: x = tempo (ms × factor × PX_PER_MS), y = contorno melódico
 *  (staffOffset invertido). Trechos editados levemente rubricados. Hover sincronizado
 *  com a partitura via onHover. Arrasto vertical ajusta fator (exponencial). */
import { WAVE_MIN, WAVE_MAX } from "../tuotilo/wave";
import { staffOffset } from "../gabc/gabc-pitch";

export interface WaveNoteView {
  syllableIndex: number;
  noteInSyllable: number;
  ms: number;                 // duração BASE neumática (sem o fator da onda)
  factor: number;             // fator atual (1 = neumático puro)
  pitch: string;              // letra gabc (ex: "f", "h", "g")
  alt: number;                // -1 bemol | 0 natural | +1 sustenido
  text: string;               // texto da sílaba (só na 1ª nota dela; senão "")
  divisioAfter: "minima" | "minor" | "maior" | "finalis" | null;
}

export interface WavePanelHooks {
  onFactorChange(syllableIndex: number, noteInSyllable: number, factor: number): void;
  onReset(): void;            // "restaurar neumático" (global ou do banner)
  onHover(syllableIndex: number | null): void;
}

export interface WavePanel {
  render(notes: WaveNoteView[]): void;
  setCursor(key: string | null): void; // "syl:nota" como em waveKey
  setStale(stale: boolean): void;
  destroy(): void;
}

const PX_PER_MS = 0.18;
const H_LINE = 60;           // altura da área de linha (contorno melódico)
const LABEL_H = 20;          // altura da faixa de labels
const H = H_LINE + LABEL_H;
const DRAG_PX_PER_DOUBLE = 80;
const GAP_DIVISIO = 10;      // px de gap entre incisos

/** Calcula o y do segmento horizontal de uma nota pelo pitch. */
function pitchY(pitch: string): number {
  const off = staffOffset(pitch);
  const o = isNaN(off) ? 6 : Math.min(12, Math.max(0, off));
  return H_LINE - Math.round((o / 12) * (H_LINE - 4)) - 2;
}

/** Monta o tooltip de uma nota. */
function buildTooltip(n: WaveNoteView): string {
  const acc = n.alt === -1 ? "♭" : n.alt === 1 ? "♯" : "";
  const parts: string[] = [`${n.pitch}${acc}`];
  if (n.text) parts.push(n.text);
  parts.push(`nota ${n.noteInSyllable + 1}`);
  return parts.join(" · ");
}

export function createWavePanel(host: HTMLElement, hooks: WavePanelHooks): WavePanel {
  host.classList.add("wave-host");

  const toolbar = document.createElement("div");
  toolbar.className = "wave-toolbar";
  const resetBtn = document.createElement("button");
  resetBtn.className = "wave-reset";
  resetBtn.textContent = "Restaurar neumático";
  resetBtn.addEventListener("click", () => hooks.onReset());
  toolbar.appendChild(resetBtn);

  const staleHost = document.createElement("div");
  const scroller = document.createElement("div");
  scroller.className = "wave-scroller";
  host.append(toolbar, staleHost, scroller);

  let cursorKey: string | null = null;

  // ── Arrasto vertical: fator multiplicativo exponencial (sobe = alarga) ───
  let drag: { key: string; syl: number; note: number; startY: number; startFactor: number } | null = null;

  function onPointerMove(ev: PointerEvent | MouseEvent): void {
    if (!drag) return;
    const dy = drag.startY - ev.clientY; // cima = positivo
    const factor = Math.min(WAVE_MAX, Math.max(WAVE_MIN,
      drag.startFactor * Math.pow(2, dy / DRAG_PX_PER_DOUBLE)));
    hooks.onFactorChange(drag.syl, drag.note, factor);
  }
  function onPointerUp(): void { drag = null; }
  // listeners no host: blocos são re-renderizados a cada mudança
  host.addEventListener("pointermove", onPointerMove as EventListener);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointerleave", onPointerUp);

  function render(notes: WaveNoteView[]): void {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.classList.add("wave-svg");

    let x = 12;
    let yPrev: number | null = null;   // y da nota anterior no mesmo inciso
    let incisoBreak = false;           // verdadeiro quando a nota anterior tinha divisio

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const w = Math.max(8, n.ms * n.factor * PX_PER_MS);
      const key = `${n.syllableIndex}:${n.noteInSyllable}`;
      const y = pitchY(n.pitch);

      // yPrev efetivo: só herda do inciso anterior; quebra de inciso ou 1ª nota = próprio y
      const yStart = (yPrev !== null && !incisoBreak) ? yPrev : y;
      const ramp = (yStart !== y) ? Math.min(w * 0.4, 12) : 0;

      // ── path da nota (diagonal de entrada + horizontal) ─────────────────
      const path = document.createElementNS(svgNS, "path");
      path.classList.add("wave-line");
      if (n.factor !== 1) path.classList.add("edited");
      if (key === cursorKey) path.classList.add("playing");
      path.setAttribute("data-key", key);
      const d = ramp > 0
        ? `M ${x},${yStart} L ${x + ramp},${y} H ${x + w}`
        : `M ${x},${y} H ${x + w}`;
      path.setAttribute("d", d);
      svg.appendChild(path);

      // ── hit-area transparente para drag e hover ───────────────────────
      const hit = document.createElementNS(svgNS, "rect");
      hit.classList.add("wave-hit");
      hit.setAttribute("data-key", key);
      hit.setAttribute("x", String(x));
      hit.setAttribute("y", "0");
      hit.setAttribute("width", String(w));
      hit.setAttribute("height", String(H_LINE));

      // Tooltip
      const title = document.createElementNS(svgNS, "title");
      title.textContent = buildTooltip(n);
      hit.appendChild(title);

      // drag
      hit.addEventListener("pointerdown", (ev) => {
        drag = {
          key, syl: n.syllableIndex, note: n.noteInSyllable,
          startY: (ev as MouseEvent).clientY, startFactor: n.factor,
        };
        ev.preventDefault();
      });

      // hover — engrossar todos os paths da mesma sílaba
      hit.addEventListener("pointerenter", () => {
        hooks.onHover(n.syllableIndex);
        svg.querySelectorAll<SVGPathElement>(
          `.wave-line[data-key^="${n.syllableIndex}:"]`
        ).forEach((p) => p.classList.add("hovered"));
      });
      hit.addEventListener("pointerleave", () => {
        hooks.onHover(null);
        svg.querySelectorAll<SVGPathElement>(".wave-line.hovered")
          .forEach((p) => p.classList.remove("hovered"));
      });

      svg.appendChild(hit);

      // ── label de sílaba ───────────────────────────────────────────────
      if (n.text) {
        const label = document.createElementNS(svgNS, "text");
        label.classList.add("wave-label");
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(H_LINE + 16));
        label.textContent = n.text;
        svg.appendChild(label);
      }

      x += w;
      yPrev = y;
      incisoBreak = n.divisioAfter !== null;

      // ── divisio: barra vertical + gap ────────────────────────────────
      if (n.divisioAfter) {
        const bar = document.createElementNS(svgNS, "line");
        bar.classList.add("wave-divisio");
        bar.setAttribute("data-kind", n.divisioAfter);
        bar.setAttribute("x1", String(x + GAP_DIVISIO / 2));
        bar.setAttribute("x2", String(x + GAP_DIVISIO / 2));
        bar.setAttribute("y1", "0");
        bar.setAttribute("y2", String(H_LINE));
        svg.appendChild(bar);
        x += GAP_DIVISIO;
      }
    }

    // largura total + margem direita
    svg.setAttribute("width", String(Math.max(x + 12, 200)));
    svg.setAttribute("height", String(H));

    scroller.replaceChildren(svg);
  }

  function setCursor(key: string | null): void {
    cursorKey = key;
    scroller.querySelectorAll(".wave-line.playing").forEach((el) => el.classList.remove("playing"));
    if (key !== null) {
      scroller.querySelector(`.wave-line[data-key="${key}"]`)?.classList.add("playing");
    }
  }

  function setStale(stale: boolean): void {
    if (!stale) { staleHost.replaceChildren(); return; }
    const banner = document.createElement("div");
    banner.className = "wave-stale";
    const msg = document.createElement("span");
    msg.textContent = "interpretação desatualizada — o canto foi editado";
    const keep = document.createElement("button");
    keep.className = "wave-stale-keep";
    keep.textContent = "Manter";
    keep.addEventListener("click", () => setStale(false));
    const reset = document.createElement("button");
    reset.className = "wave-stale-reset";
    reset.textContent = "Resetar";
    reset.addEventListener("click", () => { hooks.onReset(); setStale(false); });
    banner.append(msg, keep, reset);
    staleHost.replaceChildren(banner);
  }

  return {
    render,
    setCursor,
    setStale,
    destroy(): void {
      host.removeEventListener("pointermove", onPointerMove as EventListener);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointerleave", onPointerUp);
      host.replaceChildren();
    },
  };
}
