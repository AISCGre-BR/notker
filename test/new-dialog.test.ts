import { describe, it, expect } from "vitest";
import { newDocumentDialog } from "../src/ui/new-dialog";

describe("diálogo Novo", () => {
  it("resolve com família e campos preenchidos ao confirmar", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const p = newDocumentDialog(host, { title: "Novo projeto" });
    // família começa em stgall; escolhe Laon
    host.querySelector<HTMLInputElement>('input[value="laon"]')!.checked = true;
    host.querySelector<HTMLInputElement>(".newdlg-name")!.value = "Rorate";
    host.querySelector<HTMLInputElement>(".newdlg-office")!.value = "Introitus";
    host.querySelector<HTMLButtonElement>(".newdlg-ok")!.click();
    const r = await p;
    expect(r).toEqual({ family: "laon", name: "Rorate", office: "Introitus" });
    expect(host.querySelector(".newdlg")).toBeNull(); // fechou
  });

  it("resolve null ao cancelar", async () => {
    const host = document.createElement("div");
    const p = newDocumentDialog(host, { title: "Novo projeto" });
    host.querySelector<HTMLButtonElement>(".newdlg-cancel")!.click();
    expect(await p).toBeNull();
  });
});
