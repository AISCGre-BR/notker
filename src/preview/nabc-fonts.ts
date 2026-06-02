// Registro das fontes de canto do nabc-lib no document.fonts.
//
// Por que isto é necessário (descoberto na UAT visual da F3):
//  1. A lib injeta as fontes como `@font-face` DENTRO do `<style>` do SVG (base64).
//     No WebKitGTK (webview do Tauri no Linux) esse @font-face inline frequentemente
//     NÃO é aplicado ao `<text>` → as notas saem como caixas (□).
//  2. O `GlyphMeasurer` da lib mede os glifos via canvas, que usa as fontes do
//     DOCUMENTO (não as do <style> do SVG). Sem registro, mede com fallback →
//     layout/posição dos sinais NABC fica errado.
//
// Registramos as 4 famílias que a lib usa (greciliae = notas; greextra = caracteres
// especiais; gregall/grelaon = NABC St. Gall/Laon) e esperamos carregarem ANTES de
// renderizar. As TTFs vêm do próprio pacote (versão pinada).
//
// Este módulo é importado APENAS dinamicamente dentro de `NabcLibEngine.render()`,
// então o vitest nunca o carrega (evita o `?url` e o DOM no ambiente de teste).

import greciliaeUrl from "@testneumz/nabc-lib/dist/fonts/greciliae.ttf?url";
import greextraUrl from "@testneumz/nabc-lib/dist/fonts/greextra.ttf?url";
import gregallUrl from "@testneumz/nabc-lib/dist/fonts/gregall.ttf?url";
import grelaonUrl from "@testneumz/nabc-lib/dist/fonts/grelaon.ttf?url";

let ready: Promise<void> | null = null;

/** Idempotente: carrega as fontes uma vez e resolve quando o document.fonts as tem. */
export function ensureChantFonts(): Promise<void> {
  if (ready) return ready;
  const defs: ReadonlyArray<readonly [string, string]> = [
    ["greciliae", greciliaeUrl],
    ["greextra", greextraUrl],
    ["gregall", gregallUrl],
    ["grelaon", grelaonUrl],
  ];
  ready = Promise.all(
    defs.map(async ([family, url]) => {
      const ff = new FontFace(family, `url(${url})`);
      await ff.load();
      document.fonts.add(ff);
    }),
  ).then(() => undefined);
  return ready;
}
