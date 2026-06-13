// test/wave-panel.test.ts — render e interação da onda (linha contínua).
// Nota: jsdom não tem PointerEvent — usamos MouseEvent com o mesmo nome de evento.
// O listener usa addEventListener("pointerdown", ...) pelo nome, não pela classe.
import { describe, it, expect, vi } from "vitest";
import { createWavePanel, type WaveNoteView } from "../src/ui/wave-panel";

// Se o ambiente não tiver PointerEvent, usamos MouseEvent com o nome correto.
const PE = typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;

function host(): HTMLElement {
  document.body.innerHTML = `<div id="w"></div>`;
  return document.querySelector<HTMLElement>("#w")!;
}

function notes(): WaveNoteView[] {
  return [
    { syllableIndex: 0, noteInSyllable: 0, ms: 380, factor: 1,   pitch: "f", alt:  0, text: "Ve", divisioAfter: null },
    { syllableIndex: 0, noteInSyllable: 1, ms: 497, factor: 1,   pitch: "h", alt: -1, text: "",   divisioAfter: null },
    { syllableIndex: 1, noteInSyllable: 0, ms: 380, factor: 1.4, pitch: "g", alt:  0, text: "ni", divisioAfter: "minor" },
    { syllableIndex: 2, noteInSyllable: 0, ms: 380, factor: 1,   pitch: "f", alt:  0, text: "tor", divisioAfter: null },
  ];
}

describe("wave-panel — render", () => {
  it("WP1. wave-line paths existem (1 por nota); hit-areas com data-key corretos; largura proporcional ao fator", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    // 1 path por nota = 4
    const paths = document.querySelectorAll<SVGPathElement>(".wave-line");
    expect(paths).toHaveLength(4);
    expect(paths[0].getAttribute("data-key")).toBe("0:0");
    expect(paths[1].getAttribute("data-key")).toBe("0:1");
    expect(paths[2].getAttribute("data-key")).toBe("1:0");
    expect(paths[3].getAttribute("data-key")).toBe("2:0");

    // 1 hit-area por nota = 4
    const hits = document.querySelectorAll<SVGRectElement>(".wave-hit");
    expect(hits).toHaveLength(4);
    expect(hits[0].getAttribute("data-key")).toBe("0:0");
    expect(hits[2].getAttribute("data-key")).toBe("1:0");

    // largura do hit da nota 2 (factor 1.4) é ~1.4× a da nota 0 (factor 1)
    const w0 = Number(hits[0].getAttribute("width"));
    const w2 = Number(hits[2].getAttribute("width"));
    expect(w2 / w0).toBeCloseTo((380 * 1.4) / 380, 2);
  });

  it("WP2. labels de sílaba (.wave-label) contém Ve, ni, tor; divisio: 1 elemento", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    const labels = [...document.querySelectorAll(".wave-label")].map((e) => e.textContent);
    expect(labels).toContain("Ve");
    expect(labels).toContain("ni");
    expect(labels).toContain("tor");
    expect(document.querySelectorAll(".wave-divisio")).toHaveLength(1);
  });

  it("WP3. tooltip do hit-area: alt=-1 contém ♭; alt=0 não contém ♭ nem ♯", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    // nota 1: pitch "h", alt -1 → tooltip com ♭
    const hit1 = document.querySelector<SVGRectElement>('.wave-hit[data-key="0:1"]')!;
    const title1 = hit1.querySelector("title");
    expect(title1).not.toBeNull();
    expect(title1!.textContent).toContain("♭");

    // nota 0: pitch "f", alt 0 → tooltip sem ♭ nem ♯
    const hit0 = document.querySelector<SVGRectElement>('.wave-hit[data-key="0:0"]')!;
    const title0 = hit0.querySelector("title");
    expect(title0).not.toBeNull();
    expect(title0!.textContent).not.toContain("♭");
    expect(title0!.textContent).not.toContain("♯");
  });

  it("WP4. cursor: setCursor acende a nota; null limpa", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    p.setCursor("1:0");
    expect(document.querySelectorAll(".wave-line.playing")).toHaveLength(1);
    expect(document.querySelector('.wave-line[data-key="1:0"]')!.classList.contains("playing")).toBe(true);
    p.setCursor(null);
    expect(document.querySelectorAll(".wave-line.playing")).toHaveLength(0);
  });

  it("WP5. banner: setStale(true) mostra aviso com botões manter/resetar", () => {
    const onReset = vi.fn();
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset, onHover: vi.fn() });
    p.render(notes());
    p.setStale(true);
    const banner = document.querySelector<HTMLElement>(".wave-stale");
    expect(banner).not.toBeNull();
    (banner!.querySelector(".wave-stale-reset") as HTMLElement).click();
    expect(onReset).toHaveBeenCalled();
    p.setStale(false);
    expect(document.querySelector(".wave-stale")).toBeNull();
  });

  it("WP9. classe edited no path com factor=1.4; factor=1 não tem edited", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    // nota 2: syllableIndex=1, noteInSyllable=0, factor=1.4 → edited
    const editedPath = document.querySelector<SVGPathElement>('.wave-line[data-key="1:0"]')!;
    expect(editedPath.classList.contains("edited")).toBe(true);
    // nota 0: factor=1 → sem edited
    const normalPath = document.querySelector<SVGPathElement>('.wave-line[data-key="0:0"]')!;
    expect(normalPath.classList.contains("edited")).toBe(false);
  });
});

describe("wave-panel — arrasto vertical", () => {
  it("WP6. pointerdown+move p/ cima emite onFactorChange com fator > 1 na nota", () => {
    const onFactorChange = vi.fn();
    const p = createWavePanel(host(), { onFactorChange, onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    const hit = document.querySelector<SVGRectElement>('.wave-hit[data-key="0:1"]')!;
    hit.dispatchEvent(new PE("pointerdown", { clientY: 100, bubbles: true }));
    hit.dispatchEvent(new PE("pointermove", { clientY: 60, bubbles: true }));
    hit.dispatchEvent(new PE("pointerup", { bubbles: true }));
    expect(onFactorChange).toHaveBeenCalled();
    const [syl, note, factor] = onFactorChange.mock.calls.at(-1)!;
    expect(syl).toBe(0);
    expect(note).toBe(1);
    expect(factor).toBeGreaterThan(1);
  });

  it("WP7. arrasto p/ baixo emite fator < 1", () => {
    const onFactorChange = vi.fn();
    const p = createWavePanel(host(), { onFactorChange, onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    const hit = document.querySelector<SVGRectElement>('.wave-hit[data-key="2:0"]')!;
    hit.dispatchEvent(new PE("pointerdown", { clientY: 100, bubbles: true }));
    hit.dispatchEvent(new PE("pointermove", { clientY: 150, bubbles: true }));
    hit.dispatchEvent(new PE("pointerup", { bubbles: true }));
    const [, , factor] = onFactorChange.mock.calls.at(-1)!;
    expect(factor).toBeLessThan(1);
  });
});

describe("wave-panel — hover", () => {
  it("WP8. pointerenter no hit-area chama onHover(syllableIndex); pointerleave chama onHover(null)", () => {
    const onHover = vi.fn();
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover });
    p.render(notes());
    const hit = document.querySelector<SVGRectElement>('.wave-hit[data-key="0:0"]')!;
    hit.dispatchEvent(new MouseEvent("pointerenter", { bubbles: false }));
    expect(onHover).toHaveBeenCalledWith(0);
    hit.dispatchEvent(new MouseEvent("pointerleave", { bubbles: false }));
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("WP10. hover adiciona classe hovered nos paths da sílaba; pointerleave remove de todos", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    p.render(notes());
    // sílaba 0 tem 2 notas (0:0 e 0:1)
    const hit0 = document.querySelector<SVGRectElement>('.wave-hit[data-key="0:0"]')!;
    const path0 = document.querySelector<SVGPathElement>('.wave-line[data-key="0:0"]')!;
    const path1 = document.querySelector<SVGPathElement>('.wave-line[data-key="0:1"]')!;

    hit0.dispatchEvent(new MouseEvent("pointerenter", { bubbles: false }));
    expect(path0.classList.contains("hovered")).toBe(true);
    expect(path1.classList.contains("hovered")).toBe(true);

    hit0.dispatchEvent(new MouseEvent("pointerleave", { bubbles: false }));
    expect(path0.classList.contains("hovered")).toBe(false);
    expect(path1.classList.contains("hovered")).toBe(false);
  });
});

describe("wave-panel — linha contínua", () => {
  /** Extrai o y do ponto M inicial de um atributo `d`. */
  function parseMy(d: string): number {
    const m = /M\s+[\d.]+,(\S+)/.exec(d);
    return m ? parseFloat(m[1]) : NaN;
  }
  /** Extrai o y do segmento horizontal (H final, que é o y da nota). */
  function parseHy(d: string): number {
    // a linha horizontal está no y do L final ou do M se não houver diagonal
    const l = /L\s+[\d.]+,([\d.]+)/.exec(d);
    if (l) return parseFloat(l[1]);
    // sem diagonal: M x,y H ...
    const m = /M\s+[\d.]+,([\d.]+)/.exec(d);
    return m ? parseFloat(m[1]) : NaN;
  }

  it("WP11a. 2 notas de pitches diferentes no mesmo inciso: path da 2ª começa no y da 1ª (continuidade)", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    // notas() tem 0:0 (pitch "f") e 0:1 (pitch "h") no mesmo inciso (sem divisio entre elas)
    p.render(notes());
    const d0 = document.querySelector<SVGPathElement>('.wave-line[data-key="0:0"]')!.getAttribute("d")!;
    const d1 = document.querySelector<SVGPathElement>('.wave-line[data-key="0:1"]')!.getAttribute("d")!;

    const y0 = parseHy(d0);  // y horizontal da 1ª nota
    const yStart1 = parseMy(d1); // y inicial (M) da 2ª nota
    expect(yStart1).toBeCloseTo(y0, 1); // 2ª nota começa onde a 1ª termina
  });

  it("WP11b. após divisio, a 1ª nota do novo inciso começa no próprio y (sem herança)", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn(), onHover: vi.fn() });
    // nota 1:0 (syllableIndex=1) vem APÓS divisio "minor" da nota 1:0 do syl=1
    // nota 2:0 (syllableIndex=2) é a 1ª após a divisio
    p.render(notes());
    const d2 = document.querySelector<SVGPathElement>('.wave-line[data-key="2:0"]')!.getAttribute("d")!;
    const yStart2 = parseMy(d2);
    const yH2 = parseHy(d2);
    // sem herança: M começa no mesmo y do segmento horizontal
    expect(yStart2).toBeCloseTo(yH2, 1);
  });
});
