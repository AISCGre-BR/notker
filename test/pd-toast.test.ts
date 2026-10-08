import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createToaster } from "../src/ui/pd/toast";

let host: HTMLElement;
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<div id="toast-host" style="display:none"></div>'; host = document.getElementById("toast-host")!; });
afterEach(() => vi.useRealTimers());

describe("toast", () => {
  it("mostra no host pré-existente (alterna display) com ponto e frase", () => {
    createToaster(host).show("Projeto salvo.");
    expect(host.style.display).toBe("block");
    const t = host.querySelector(".sc-toast")!;
    expect(t.classList.contains("sc-toast--ok")).toBe(true);
    expect(t.textContent).toContain("Projeto salvo.");
  });
  it("sucesso some em 4 s", () => {
    createToaster(host).show("Ok.");
    vi.advanceTimersByTime(4000);
    expect(host.style.display).toBe("none");
    expect(host.querySelector(".sc-toast")).toBeNull();
  });
  it("erro fica até dispensar", () => {
    const t = createToaster(host);
    t.show("Sem permissão.", { kind: "error" });
    vi.advanceTimersByTime(60000);
    expect(host.querySelector(".sc-toast--error")).not.toBeNull();
    (host.querySelector(".sc-toast__act") as HTMLButtonElement).click(); // "Fechar"
    expect(host.style.display).toBe("none");
  });
  it("novo toast substitui o anterior (sem pilha) e cancela o timer antigo", () => {
    const t = createToaster(host);
    t.show("Primeiro.");
    vi.advanceTimersByTime(3000);
    t.show("Segundo.", { kind: "error" });
    vi.advanceTimersByTime(2000);
    expect(host.querySelectorAll(".sc-toast").length).toBe(1);
    expect(host.textContent).toContain("Segundo.");
  });
  it("no máximo uma ação; clicar executa e fecha", () => {
    const run = vi.fn();
    createToaster(host).show("Canto excluído.", { action: { label: "Desfazer", run } });
    const act = host.querySelector(".sc-toast__act") as HTMLButtonElement;
    expect(act.textContent).toBe("Desfazer");
    act.click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(host.style.display).toBe("none");
  });
});
