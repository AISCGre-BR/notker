/** Barra contextual da onda (spec B §2.3) — a "casa" da onda de interpretação.
 *  Só existe com a onda ligada: instrução de uso permanente, contador de notas
 *  ajustadas, leitura ao vivo do arrasto (migrada do rodapé) e Resetar. */
export interface WaveBarHandle {
  setVisible(on: boolean): void;
  setCount(n: number): void;
  setReading(text: string | null): void;
  setSolfejo(on: boolean): void;
}

const HINT = "arraste uma coluna na vertical — ↑ alonga, ↓ encurta";
const SOLFEJO = "edição da onda só no modo interpretado";

export function createWaveBar(host: HTMLElement, onReset: () => void): WaveBarHandle {
  const bar = document.createElement("div");
  bar.className = "wave-bar";
  bar.style.display = "none";

  const title = document.createElement("span");
  title.className = "wave-bar-title";
  title.textContent = "❧ Onda de interpretação";

  const msg = document.createElement("span");
  msg.className = "wave-bar-msg";
  msg.textContent = HINT;

  const count = document.createElement("span");
  count.className = "wave-bar-count";
  count.textContent = "interpretação neumática pura";

  const reset = document.createElement("button");
  reset.className = "wave-bar-reset";
  reset.textContent = "Resetar";
  reset.title = "restaurar interpretação ao neumático puro";
  reset.addEventListener("click", onReset);

  bar.append(title, msg, count, reset);
  host.appendChild(bar);

  let solfejo = false;
  let reading: string | null = null;
  function refreshMsg(): void {
    msg.textContent = solfejo ? SOLFEJO : (reading ?? HINT);
    msg.classList.toggle("wave-bar-warn", solfejo);
  }

  return {
    setVisible: (on) => { bar.style.display = on ? "" : "none"; },
    setCount: (n) => {
      count.textContent =
        n === 0 ? "interpretação neumática pura"
        : n === 1 ? "1 nota ajustada"
        : `${n} notas ajustadas`;
    },
    setReading: (text) => { reading = text; refreshMsg(); },
    setSolfejo: (on) => { solfejo = on; refreshMsg(); },
  };
}
