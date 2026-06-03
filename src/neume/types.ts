// src/neume/types.ts
export type Family = "stgall" | "laon";

export interface GlyphSvg { path: string; viewBox: string; advance: number; }

/** Proveniência de um nome canônico (citação obrigatória — F4). */
export interface Provenance {
  source: string;  // "Cardine, Semiologia Gregoriana, pp.12–15"
  via: string;     // "GregorioNabcRef v6.2.0"
  family: Family;
  row: string;     // nome da linha da sinopse que originou o nome
}

/** Candidato de nome canônico vindo da tabela-sinopse. */
export interface Candidate {
  name: string;
  family: Family;
  provenance: Provenance;
}

export interface NeumeEntry {
  id: string;            // `${family}:${code}`
  family: Family;
  code: string;          // nome cru do glifo na fonte
  nabc: string;          // decodeName(code)
  nabcValid: boolean;    // passou no parser no build?
  base: string;          // código-base de 2 letras
  name: string;          // KIND_NAMES[base] ?? base
  qualifiers: string[];  // tokens decodificados do restante (raw, best-effort)
  letters: string[];     // letras significativas detectadas (raw)
  terms: string[];       // termos de busca (lower-case, sem acento)
  meaning: string;       // de base-annotations (curado) ou ""
  svg: GlyphSvg;
  provenance?: Provenance[]; // F4: nomes canônicos da sinopse, com citação
  synthetic?: boolean;       // F4: entrada-sequência (cl!po) sem glifo de fonte próprio
}

export interface NeumeDb {
  schema: 1;
  generatedFrom: { gregall: string; grelaon: string; tables: string };
  entries: NeumeEntry[];
}

export interface OverlayEntry { names?: string[]; note?: string; hidden?: boolean; }
export interface Overlay { schema: 1; kind: "notker-neume-overlay"; entries: Record<string, OverlayEntry>; }

export interface EffectiveEntry extends NeumeEntry {
  displayNames: string[]; // overlay.names ++ [name]
  hidden: boolean;
}

export interface BaseAnnotations {
  [base: string]: { pt?: string[]; meaning?: string };
}
