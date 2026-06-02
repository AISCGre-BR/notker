// Divisor redimensionável entre editor e preview, com orientação alternável
// (lado a lado = horizontal; empilhado = vertical). Sem dependências.

export type Orientation = "horizontal" | "vertical";

export interface Split {
  orientation(): Orientation;
  setOrientation(o: Orientation): void;
  toggle(): void;
}

export function createSplit(
  workspace: HTMLElement,
  first: HTMLElement,
  second: HTMLElement,
  initial: Orientation = "horizontal",
): Split {
  let orientation: Orientation = initial;
  let firstPct = 50; // tamanho do 1º painel (% do eixo de divisão)

  const gutter = document.createElement("div");
  gutter.className = "split-gutter";
  workspace.insertBefore(gutter, second);

  function apply(): void {
    const horiz = orientation === "horizontal";
    workspace.style.display = "flex";
    workspace.style.flexDirection = horiz ? "row" : "column";
    first.style.flex = `0 0 ${firstPct}%`;
    second.style.flex = "1 1 0";
    first.style.minWidth = first.style.minHeight = "0";
    second.style.minWidth = second.style.minHeight = "0";
    gutter.style.cursor = horiz ? "col-resize" : "row-resize";
    gutter.style.flex = "0 0 6px";
    gutter.style.alignSelf = "stretch";
  }
  apply();

  let dragging = false;
  gutter.addEventListener("mousedown", (e) => {
    dragging = true;
    e.preventDefault();
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const pct = orientation === "horizontal"
      ? ((e.clientX - rect.left) / rect.width) * 100
      : ((e.clientY - rect.top) / rect.height) * 100;
    firstPct = Math.min(85, Math.max(15, pct));
    apply();
  });

  return {
    orientation: () => orientation,
    setOrientation: (o) => { orientation = o; apply(); },
    toggle: () => { orientation = orientation === "horizontal" ? "vertical" : "horizontal"; apply(); },
  };
}
