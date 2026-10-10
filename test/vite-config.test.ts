// @vitest-environment node
import { describe, it, expect } from "vitest";
import config from "../vite.config";

describe("vite.config", () => {
  // As libs do PDF só são carregadas por import dinâmico (no clique de Exportar PDF).
  // Sem pré-otimização, o Vite em dev as descobre nesse momento, reotimiza e
  // RECARREGA a página — o app volta à tela inicial no meio da exportação.
  it("pré-otimiza jspdf e svg2pdf.js no dev", () => {
    const include = (config as { optimizeDeps?: { include?: string[] } }).optimizeDeps?.include ?? [];
    expect(include).toEqual(expect.arrayContaining(["jspdf", "svg2pdf.js"]));
  });
});
