// test/pd-tooltip.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installTooltips } from "../src/ui/pd/tooltip";

// jsdom não traz PointerEvent; MouseEvent basta (o tooltip só usa type/target/relatedTarget).
if (typeof PointerEvent === "undefined") (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;

let host: HTMLElement, btn: HTMLButtonElement, off: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button data-tip="Formatar (Ctrl+Shift+F)">x</button><div id="tooltip-host" style="display:none"></div>';
  host = document.getElementById("tooltip-host")!;
  btn = document.querySelector("button")!;
  off = installTooltips(host);
});
afterEach(() => { off(); vi.useRealTimers(); });

describe("tooltip", () => {
  it("aparece só depois de 500 ms, com o atalho separado", () => {
    btn.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(499);
    expect(host.style.display).toBe("none");
    vi.advanceTimersByTime(1);
    expect(host.style.display).toBe("block");
    expect(host.querySelector(".notker-tip__kbd")!.textContent).toBe("Ctrl+Shift+F");
    expect(host.textContent).toContain("Formatar");
  });
  it("some no pointerdown e no pointerout; sair antes de 500 ms cancela", () => {
    btn.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(500);
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(host.style.display).toBe("none");
    btn.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(200);
    btn.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(host.style.display).toBe("none");
  });
  it("lê o data-tip ATUAL (rótulo dinâmico Tocar/Parar)", () => {
    btn.dataset.tip = "Parar";
    btn.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(host.textContent).toBe("Parar");
  });
});
