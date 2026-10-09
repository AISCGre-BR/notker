import { describe, it, expect, beforeEach } from "vitest";
import { openDialog } from "../src/ui/pd/dialog";

let host: HTMLElement;
beforeEach(() => { document.body.innerHTML = '<div id="dialog-host" style="display:none"></div>'; host = document.getElementById("dialog-host")!; });

const spec = {
  title: "Novo canto",
  fields: [{ key: "name", label: "Nome", serif: true }],
  segs: [{ key: "family", label: "Família", value: "stgall", options: [{ value: "stgall", label: "St. Gall" }, { value: "laon", label: "Laon" }] }],
  actions: [{ id: "cancel", label: "Cancelar", kind: "elevated" as const }, { id: "ok", label: "Criar", kind: "filled" as const }],
};

describe("diálogo Parchment", () => {
  it("abre no host pré-existente, foca o 1º campo, sem véu de tela cheia", () => {
    void openDialog(host, spec);
    expect(host.style.display).toBe("block");
    expect(host.querySelector(".sc-dialog")).not.toBeNull();
    expect(host.querySelector(".sc-backdrop")).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("input"));
  });
  it("Enter aciona a principal com os valores (segmentado incluso); host fecha", async () => {
    const p = openDialog(host, spec);
    const input = host.querySelector("input")!;
    input.value = "Puer natus";
    (host.querySelectorAll(".sc-seg button")[1] as HTMLButtonElement).click();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await expect(p).resolves.toEqual({ action: "ok", values: { name: "Puer natus", family: "laon" } });
    expect(host.style.display).toBe("none");
    expect(host.innerHTML).toBe("");
  });
  it("Esc cancela (action null)", async () => {
    const p = openDialog(host, spec);
    host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(p).resolves.toMatchObject({ action: null });
  });
  it("ordem dos botões: perigo à esquerda (separado), principal por último e única preenchida", () => {
    void openDialog(host, { title: "Salvar alterações?", actions: [
      { id: "save", label: "Salvar", kind: "filled" }, { id: "discard", label: "Não salvar", kind: "danger" }, { id: "cancel", label: "Cancelar", kind: "elevated" },
    ] });
    const labels = [...host.querySelectorAll(".sc-dialog__actions button")].map((b) => b.textContent);
    expect(labels).toEqual(["Não salvar", "Cancelar", "Salvar"]);
    expect(host.querySelectorAll(".sc-btn--filled").length).toBe(1);
  });
  it("segmentado usa botões (nenhum radio/select nativo — WebKitGTK)", () => {
    void openDialog(host, spec);
    expect(host.querySelector('input[type="radio"], select, input[type="checkbox"]')).toBeNull();
    expect(host.querySelector('.sc-seg [aria-pressed="true"]')!.textContent).toBe("St. Gall");
  });

  describe("foco, retorno e atalhos", () => {
    const tab = (shift = false) => {
      const el = document.activeElement as HTMLElement;
      const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    };
    it("Tab no último elemento volta ao primeiro; Shift+Tab no primeiro vai ao último", () => {
      void openDialog(host, spec);
      const items = [...host.querySelectorAll<HTMLElement>("input, button")];
      const first = items[0], last = items[items.length - 1];
      last.focus();
      const ev = tab();
      expect(ev.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      const ev2 = tab(true);
      expect(ev2.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });
    it("Tab no meio não é interceptado", () => {
      void openDialog(host, spec);
      host.querySelector<HTMLElement>("input")!.focus();
      expect(tab().defaultPrevented).toBe(false);
    });
    it("devolve o foco ao elemento anterior ao fechar (ação e Esc)", async () => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.focus();
      const p = openDialog(host, spec);
      expect(document.activeElement).not.toBe(btn);
      host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await p;
      expect(document.activeElement).toBe(btn);
      const p2 = openDialog(host, spec);
      (host.querySelector(".sc-btn--filled") as HTMLButtonElement).click();
      await p2;
      expect(document.activeElement).toBe(btn);
    });
    it("não falha se o elemento anterior saiu do documento", async () => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.focus();
      const p = openDialog(host, spec);
      btn.remove();
      host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await expect(p).resolves.toMatchObject({ action: null });
    });
    it("teclas não vazam para a janela (atalhos não disparam atrás do diálogo)", () => {
      void openDialog(host, spec);
      let leaked = 0;
      const fn = () => { leaked++; };
      window.addEventListener("keydown", fn);
      host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
      window.removeEventListener("keydown", fn);
      expect(leaked).toBe(0);
    });
  });

  describe("reabertura e detalhes", () => {
    it("segundo openDialog no mesmo host resolve o primeiro com null e preserva o foco original", async () => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.focus();
      const p1 = openDialog(host, spec);
      const p2 = openDialog(host, spec);
      await expect(p1).resolves.toMatchObject({ action: null });
      expect(host.querySelectorAll(".sc-dialog").length).toBe(1);
      host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await p2;
      expect(document.activeElement).toBe(btn);
    });
    it("ids de título são únicos entre diálogos", () => {
      void openDialog(host, spec);
      const a = host.querySelector("h2")!.id;
      void openDialog(host, spec);
      expect(host.querySelector("h2")!.id).not.toBe(a);
    });
    it("Enter durante composição (IME) não confirma", () => {
      void openDialog(host, spec);
      const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true });
      host.querySelector("input")!.dispatchEvent(ev);
      expect(host.querySelector(".sc-dialog")).not.toBeNull();
    });
  });
});
