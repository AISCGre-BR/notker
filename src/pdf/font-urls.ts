/** URLs (Vite `?url`) dos TTFs do PDF. Importado SÓ dinamicamente pelo código de
 *  navegador (render/jspdf-sink), como src/preview/nabc-fonts.ts. */
import { CHANT_FONT_URLS } from "../preview/nabc-fonts";
import serifRegular from "../assets/fonts/source-serif-4/SourceSerif4-Regular.ttf?url";
import serifItalic from "../assets/fonts/source-serif-4/SourceSerif4-It.ttf?url";
import serifSemibold from "../assets/fonts/source-serif-4/SourceSerif4-Semibold.ttf?url";
import type { FontUrls } from "./fonts";

export const PDF_FONT_URLS: FontUrls = {
  greciliae: CHANT_FONT_URLS.greciliae,
  greextra: CHANT_FONT_URLS.greextra,
  gregall: CHANT_FONT_URLS.gregall,
  grelaon: CHANT_FONT_URLS.grelaon,
  "serif-regular": serifRegular,
  "serif-italic": serifItalic,
  "serif-semibold": serifSemibold,
};
