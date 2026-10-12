// test/views.test.ts — seletor de vistas mínimo (Edição · Neumas)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createViews } from "../src/app/views";
import { createToolbar } from "../src/ui/toolbar";
import { createRegistry } from "../src/app/commands";

beforeEach(() => { document.body.innerHTML = ""; delete document.body.dataset.view; });

describe("createViews", () => {
  it("começa em edicao, troca body[data-view] e avisa só quando muda", () => {
    const onChange = vi.fn();
    const v = createViews(document.body, onChange);
    expect(v.current()).toBe("edicao");
    expect(document.body.dataset.view).toBe("edicao");
    v.set("edicao");
    expect(onChange).not.toHaveBeenCalled();
    v.set("neumas");
    expect(document.body.dataset.view).toBe("neumas");
    expect(onChange).toHaveBeenCalledWith("neumas", "edicao");
  });
});

describe("toolbar: abas de vista e itens por vista", () => {
  it("abas com texto, role=tab, aria-selected pelo checked, Ctrl+1/Ctrl+3 no tooltip", async () => {
    const r = createRegistry();
    let view = "edicao";
    r.register([
      { id: "view.edicao", label: "Edição", run: () => { view = "edicao"; }, keys: ["Ctrl+Digit1"], checked: () => view === "edicao" },
      { id: "view.neumas", label: "Neumas", run: () => { view = "neumas"; }, keys: ["Ctrl+Digit3", "Ctrl+Alt+N"], checked: () => view === "neumas" },
      { id: "edit.format", label: "Formatar", icon: "wand-sparkles", run: () => {} },
    ]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    createToolbar(host, r, [{ tabs: ["view.edicao", "view.neumas"], label: "Vistas" }, { group: ["edit.format"], view: "edicao" }]);
    const tl = host.querySelector('[role="tablist"]')!;
    expect(tl.getAttribute("aria-label")).toBe("Vistas");
    const tabs = [...tl.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(["Edição", "Neumas"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs[1].dataset.tip).toBe("Neumas (Ctrl+3)");
    tabs[1].click();
    await new Promise((res) => setTimeout(res, 0));
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(host.querySelector<HTMLElement>('[data-cmd="edit.format"]')!.closest<HTMLElement>(".sc-seg")!.dataset.view).toBe("edicao");
  });
});

describe("hosts e CSS das vistas", () => {
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("src/ui/notker.css", "utf8");
  it("index.html tem body[data-view] e o host #neumas-view pré-existente", () => {
    expect(html).toMatch(/<body[^>]*data-view="edicao"/);
    expect(html).toContain('id="neumas-view"');
  });
  it("CSS esconde #workspace na vista Neumas com !important (o split põe display inline) e vice-versa", () => {
    expect(css).toMatch(/body\[data-view="neumas"\] #workspace\s*{[^}]*display:\s*none\s*!important/);
    expect(css).toMatch(/body:not\(\[data-view="neumas"\]\) #neumas-view\s*{[^}]*display:\s*none/);
    expect(css).toMatch(/body\[data-view="neumas"\] \.sc-toolbar \[data-view="edicao"\]/);
  });
});
