/** wave-panel.ts — a onda de interpretação (spec §7). Um bloco SVG por nota:
 *  largura ∝ duração final, altura ∝ fator (a "onda"); arrasto vertical ajusta
 *  o fator da nota sob o ponteiro; sílabas legendadas; divisiones como barras;
 *  cursor de playback; banner de interpretação desatualizada (hash divergente). */
import { WAVE_MIN, WAVE_MAX } from "../tuotilo/wave";

export interface WaveNoteView {
  syllableIndex: number;
  noteInSyllable: number;
  ms: number;                 // duração BASE neumática (sem o fator da onda)
  factor: number;             // fator atual (1 = neumático puro)
  text: string;               // texto da sílaba (só na 1ª nota dela; senão "")
  divisioAfter: "minima" | "minor" | "maior" | "finalis" | null;
}

export interface WavePanelHooks {
  onFactorChange(syllableIndex: number, noteInSyllable: number, factor: number): void;
  onReset(): void;            // "restaurar neumático" (global ou do banner)
}

export interface WavePanel {
  render(notes: WaveNoteView[]): void;
  setCursor(key: string | null): void; // "syl:nota" como em waveKey
  setStale(stale: boolean): void;
  destroy(): void;
}

const PX_PER_MS = 0.18;      // escala horizontal
const H_BASE = 46;           // altura do bloco com fator 1
const H_AREA = 130;          // área vertical útil
const DRAG_PX_PER_DOUBLE = 80; // arrastar 80px p/ cima dobra o fator

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
    const totalW = notes.reduce((a, n) => a + Math.max(8, n.ms * n.factor * PX_PER_MS) + 2, 24);
    const H = H_AREA + 38; // área + faixa de rótulos
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", String(Math.max(totalW, 200)));
    svg.setAttribute("height", String(H));
    svg.classList.add("wave-svg");

    let x = 12;
    for (const n of notes) {
      const w = Math.max(8, n.ms * n.factor * PX_PER_MS);
      const h = Math.min(H_AREA, H_BASE * n.factor);
      const y = H_AREA - h;
      const key = `${n.syllableIndex}:${n.noteInSyllable}`;

      const rect = document.createElementNS(svgNS, "rect");
      rect.classList.add("wave-note");
      if (key === cursorKey) rect.classList.add("playing");
      rect.setAttribute("data-key", key);
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      rect.addEventListener("pointerdown", (ev) => {
        drag = {
          key, syl: n.syllableIndex, note: n.noteInSyllable,
          startY: (ev as MouseEvent).clientY, startFactor: n.factor,
        };
        ev.preventDefault();
      });
      svg.appendChild(rect);

      if (n.text) {
        const label = document.createElementNS(svgNS, "text");
        label.classList.add("wave-label");
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(H_AREA + 16));
        label.textContent = n.text;
        svg.appendChild(label);
      }
      x += w + 2;

      if (n.divisioAfter) {
        const bar = document.createElementNS(svgNS, "line");
        bar.classList.add("wave-divisio");
        bar.setAttribute("data-kind", n.divisioAfter);
        bar.setAttribute("x1", String(x + 2));
        bar.setAttribute("x2", String(x + 2));
        bar.setAttribute("y1", "0");
        bar.setAttribute("y2", String(H_AREA));
        svg.appendChild(bar);
        x += 8;
      }
    }

    scroller.replaceChildren(svg);
  }

  function setCursor(key: string | null): void {
    cursorKey = key;
    scroller.querySelectorAll(".wave-note.playing").forEach((el) => el.classList.remove("playing"));
    if (key !== null) {
      scroller.querySelector(`.wave-note[data-key="${key}"]`)?.classList.add("playing");
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
