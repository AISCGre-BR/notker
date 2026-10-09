// Registro das fontes de canto do nabc-lib no document.fonts.
//
// Por que isto é necessário (descoberto na UAT visual da F3):
//  1. O SVG do nabc-lib NÃO traz @font-face (só `font-family` nos `<text>`): sem as
//     fontes no document.fonts, as notas saem como caixas (□). (A miniatura, que desenha
//     o SVG como IMAGEM, embute as fontes à parte — ver src/app/thumbnail.ts.)
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

/** Família → URL do TTF (também usado pela miniatura, que embute as fontes no SVG). */
export const CHANT_FONT_URLS: Readonly<Record<string, string>> = {
  greciliae: greciliaeUrl,
  greextra: greextraUrl,
  gregall: gregallUrl,
  grelaon: grelaonUrl,
};

let ready: Promise<void> | null = null;

/** Idempotente: carrega as fontes uma vez e resolve quando o document.fonts as tem. */
export function ensureChantFonts(): Promise<void> {
  if (ready) return ready;
  ready = Promise.all(
    Object.entries(CHANT_FONT_URLS).map(async ([family, url]) => {
      const ff = new FontFace(family, `url(${url})`);
      await ff.load();
      document.fonts.add(ff);
    }),
  ).then(() => undefined);
  return ready;
}
