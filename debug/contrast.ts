// debug/contrast.ts — razão de contraste WCAG de cor computada × fundo efetivo (dev-only).
const hex = (n: number) => n.toString(16).padStart(2, "0");
export function createContrastChecker() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): [number, number, number, number] => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (f: number[], b: number[]) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));
  function bgOf(el: Element): number[] {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
    let acc = [255, 255, 255];
    for (const e of chain.reverse()) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) acc = over(c, acc);
    }
    return acc;
  }
  const lum = (c: number[]) => {
    const f = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a: number[], b: number[]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const rows: string[] = [];
  let fails = 0;
  /** Elemento ausente não conta (cada cenário do probe mostra uma parte da tela). */
  function check(name: string, el: Element | null, bgEl?: Element): void {
    if (!el) { rows.push(`--   ${name} (não está neste cenário)`); return; }
    const bg = bgOf(bgEl ?? el);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const r = ratio(fg, bg);
    if (r < 4.5) fails++;
    rows.push(`${r >= 4.5 ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${name}  fg=#${fg.map((v) => hex(Math.round(v))).join("")} bg=#${bg.map((v) => hex(Math.round(v))).join("")}`);
  }
  return { check, rows, fails: () => fails };
}
