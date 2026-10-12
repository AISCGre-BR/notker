// src/pdf/text-font.ts
/** Registra a serifa do PDF (SourceSerif4) no document.fonts: o nabc-lib MEDE a letra
 *  com as fontes do documento — sem isto as sílabas seriam espaçadas com outra fonte e
 *  sairiam encavaladas no PDF. Só navegador; importado dinamicamente. */
import { TEXT_FONT, type FontFile } from "./fonts";
import { PDF_FONT_URLS } from "./font-urls";

const FACES: ReadonlyArray<readonly [FontFile, FontFaceDescriptors]> = [
  ["serif-regular", { style: "normal", weight: "400" }],
  ["serif-italic", { style: "italic", weight: "400" }],
  ["serif-semibold", { style: "normal", weight: "600" }],
];

let ready: Promise<void> | null = null;

export function ensurePdfTextFont(): Promise<void> {
  ready ??= Promise.all(FACES.map(async ([file, desc]) => {
    const ff = new FontFace(TEXT_FONT, `url(${PDF_FONT_URLS[file]})`, desc);
    await ff.load();
    document.fonts.add(ff);
  })).then(() => undefined);
  ready.catch(() => { ready = null; }); // falhou: tenta de novo na próxima exportação
  return ready;
}
