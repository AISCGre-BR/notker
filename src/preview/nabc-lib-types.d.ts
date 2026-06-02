/** Declaração ambiente mínima para @testneumz/nabc-lib.
 *  O pacote tem tipos em dist/types/ mas não expõe a chave "types" no package.json,
 *  logo o TypeScript não os resolve automaticamente com moduleResolution=bundler.
 *  Aqui declaramos apenas as classes usadas em NabcLibEngine. */
declare module "@testneumz/nabc-lib" {
  export class ChantContext {
    nabcLines: number;
    nabcMode: "gall" | "laon";
    lineWidthPx: number;
  }
  export class GregorioScore {
    constructor(ctx: ChantContext);
    interprete(doc: string): { lexErrors: unknown[]; parseErrors: unknown[] };
    determineElements(): void;
    syllables: unknown[];
  }
  export class GregorianChantSVGRenderer {
    constructor(rootElement: HTMLElement);
    renderSvg(score: GregorioScore): void;
  }
}
