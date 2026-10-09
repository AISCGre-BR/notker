import { describe, it, expect, beforeEach } from "vitest";
import { exportPdfDialog, type PdfDialogContext } from "../src/pdf/export-dialog";

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="dialog-host" style="display:none"></div>';
  host = document.getElementById("dialog-host")!;
});

const segButtons = (i: number) => [...host.querySelectorAll(".sc-seg")[i].querySelectorAll<HTMLButtonElement>("button")];
const pressed = (i: number) => segButtons(i).find((b) => b.getAttribute("aria-pressed") === "true")!.textContent;
const click = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!.click();
const ctx = (o: Partial<PdfDialogContext> = {}): PdfDialogContext => ({ chantHasMusic: true, group: null, ...o });

describe("diálogo Exportar PDF", () => {
  it("monta no host pré-existente, sem radio/checkbox/select; padrão: Canto atual, A4, vermelho, contínuo", async () => {
    const p = exportPdfDialog(host, ctx());
    expect(host.style.display).toBe("block");
    expect(host.querySelector('input[type="radio"], input[type="checkbox"], select')).toBeNull();
    expect(host.querySelector(".sc-dialog__title")!.textContent).toBe("Exportar PDF");
    expect([0, 1, 2, 3].map(pressed)).toEqual(["Canto atual", "A4", "Em vermelho", "Uma após a outra"]);
    click("Exportar…");
    await expect(p).resolves.toEqual({ scope: "chant", page: "a4", red: true, newPagePerPiece: false });
    expect(host.style.display).toBe("none");
  });
  it("Grupo indisponível sem grupo selecionado; com grupo, mostra o título (texto, não HTML)", async () => {
    void exportPdfDialog(host, ctx());
    expect(segButtons(0)[1].disabled).toBe(true);
    expect(segButtons(0)[1].textContent).toBe("Grupo selecionado");
    segButtons(0)[1].click(); // clicar no indisponível não muda nada
    expect(pressed(0)).toBe("Canto atual");
    const p = exportPdfDialog(host, ctx({ group: { id: "g", title: "<b>Natal</b>" } }));
    expect(segButtons(0)[1].disabled).toBe(false);
    expect(segButtons(0)[1].textContent).toBe("Grupo “<b>Natal</b>”");
    expect(host.querySelector(".sc-seg b")).toBeNull();
    segButtons(0)[1].click();
    segButtons(1)[1].click();
    segButtons(2)[1].click();
    segButtons(3)[1].click();
    click("Exportar…");
    await expect(p).resolves.toEqual({ scope: "group", page: "letter", red: false, newPagePerPiece: true });
  });
  it("canto atual sem música: Canto atual indisponível e o padrão vira Projeto inteiro", async () => {
    const p = exportPdfDialog(host, ctx({ chantHasMusic: false }));
    expect(segButtons(0)[0].disabled).toBe(true);
    expect(pressed(0)).toBe("Projeto inteiro");
    click("Exportar…");
    await expect(p).resolves.toMatchObject({ scope: "project" });
  });
  it("lembra as escolhas da última vez (o escopo só se ainda disponível)", async () => {
    void exportPdfDialog(host, ctx({ last: { scope: "group", page: "letter", red: false, newPagePerPiece: true } }));
    expect([0, 1, 2, 3].map(pressed)).toEqual(["Canto atual", "Carta", "Em preto", "Cada uma em nova página"]);
  });
  it("Esc e Cancelar devolvem null; Esc compondo acento não cancela", async () => {
    void exportPdfDialog(host, ctx());
    host.querySelector(".sc-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }));
    expect(host.style.display).toBe("block");
    const p1 = exportPdfDialog(host, ctx());
    host.querySelector(".sc-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(p1).resolves.toBeNull();
    const p2 = exportPdfDialog(host, ctx());
    click("Cancelar");
    await expect(p2).resolves.toBeNull();
  });
});
