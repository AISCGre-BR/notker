/** pdf-probe.ts — gera um PDF REAL pelo caminho de produção (exportPdf + renderPiece +
 *  jsPDF/svg2pdf), sem Tauri: o "salvar" devolve um caminho fixo e o "gravar" põe os bytes
 *  em base64 no <pre id="pdf">. NÃO faz parte do app.
 *  Query: ?case=stgall-1 | stgall-many | laon-1 | mixed-newpage · ?page=a4|letter · ?black=1
 *  Fim: document.title = "PROBE_DONE" (ou "PROBE_ERROR …"); <pre id="dump"> com o relatório. */
import { exportPdf } from "../src/pdf/export-pdf";
import { pdfBrowserDeps } from "../src/pdf/browser";
import { pdfFontFaces, missingFamilies } from "../src/pdf/fonts";
import { renderPiece } from "../src/pdf/render";
import { pageGeometry } from "../src/pdf/layout";
import type { PdfPiece } from "../src/pdf/scope";

const qs = new URLSearchParams(location.search);
const LAON = "name: Puer (Laon);\n%%\n(c4) Pu(g|un)er(gh|pe) na(h|un)tus(hg|cl) est(g|vi) no(h|un)bis(g|un) (;) " +
  "<i>et</i> fí(g|un)li(hi|pe)us(h|un) <b>da</b>(g|vi)tus(gh|pe) est(h|un) no(hg|cl)bis(g|un) (::)";

/** ℣/℟/A/ (greextra) com a letra latina + um canto longo (custos no fim das pautas). */
const VR = "name: Versículo;\n%%\n(c4) <sp>V/</sp>Di(f)xit(g) Dó(h)mi(g)nus(f) Dó(g)mi(h)no(g) me(f)o:(f.) (;) " +
  "<sp>R/</sp>Sé(g)de(h) a(g) dex(f)tris(g) me(h)is.(g.) (::) <sp>A/</sp>Ál(h)le(g)lú(f)ia.(f.) (::)";

async function sample(n: string): Promise<string> {
  return (await fetch(`/samples/${n}.gabc`)).text();
}
const piece = (id: string, title: string, content: string, family: "stgall" | "laon" = "stgall"): PdfPiece => ({ id, title, content, family });

async function pieces(kind: string): Promise<PdfPiece[]> {
  const s = await Promise.all(["01-minimo", "02-kyrie", "03-factus-est", "04-dies-sanctificatus"].map(sample));
  const all = [
    piece("1", "Pópulus Sion", s[0]), piece("2", "Kyrie", s[1]),
    piece("3", "Factus est", s[2]), piece("4", "Dies sanctificatus", s[3]),
  ];
  if (kind === "stgall-1") return [all[3]];
  if (kind === "vr") return [piece("v", "Versículo e resposta", VR), all[1], all[3]];
  if (kind === "laon-1") return [piece("l", "Puer natus est (Laon)", LAON, "laon")];
  if (kind === "mixed-newpage") return [...all, piece("l", "Puer natus est (Laon)", LAON, "laon")];
  return [...all, piece("5", "Dies sanctificatus (de novo)", s[3]), piece("6", "Factus est (de novo)", s[2])];
}

async function main(): Promise<void> {
  const kind = qs.get("case") ?? "stgall-1";
  const page = qs.get("page") === "letter" ? "letter" : "a4";
  const red = !qs.get("black");
  const list = await pieces(kind);
  const rows: string[] = [`case=${kind} page=${page} red=${red} pieces=${list.length}`];
  const host = document.getElementById("measure-host")!;
  // fontes que faltariam no PDF (deve ser vazio) e alturas das pautas
  for (const p of list) {
    const r = await renderPiece(p.content, { family: p.family, widthPx: pageGeometry(page).lineWidthPx, red, host });
    const miss = new Set<string>();
    for (const l of r.lines) missingFamilies(l.svg, pdfFontFaces([p.family])).forEach((f) => miss.add(f));
    rows.push(`${p.title}: pautas=${r.lines.length} alturas=${r.lines.map((l) => Math.round(l.heightPx)).join(",")} faltam=[${[...miss].join(",")}]`);
    r.dispose();
  }
  let bytes: Uint8Array | null = null;
  const base = pdfBrowserDeps(host);
  const res = await exportPdf({ ...base, pickPath: async (n) => `/probe/${n}`, write: async (_p, b) => { bytes = b; } },
    list, kind, { scope: "project", page, red, newPagePerPiece: kind === "mixed-newpage" });
  rows.push(`resultado: ${JSON.stringify(res)}`);
  rows.push(`measure-host vazio depois: ${host.children.length === 0}`);
  if (bytes) {
    const b = bytes as Uint8Array;
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    document.getElementById("pdf")!.textContent = btoa(bin);
  }
  document.getElementById("dump")!.textContent = rows.join("\n");
  if (qs.get("post")) { // WebKitGTK (MiniBrowser) não tem --dump-dom: manda para o servidor do probe
    const tag = `${kind}-${page}-${red ? "red" : "black"}-${qs.get("post")}`;
    await fetch(`/__probe/save?name=${tag}.txt`, { method: "POST", body: rows.join("\n") });
    if (bytes) await fetch(`/__probe/save?name=${tag}.pdf`, { method: "POST", body: bytes as Uint8Array });
  }
  document.title = "PROBE_DONE";
}
main().catch((e) => {
  document.getElementById("dump")!.textContent = "ERRO " + String(e) + "\n" + (e as Error).stack;
  document.title = "PROBE_ERROR " + String(e);
  if (qs.get("post")) void fetch(`/__probe/save?name=erro-${qs.get("post")}.txt`, { method: "POST", body: String(e) + "\n" + (e as Error).stack });
});
