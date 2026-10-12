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
/** Cadeia nabc criada e nomeada pelo usuário (id `seq:<família>:<nabc normalizado>`). */
export interface UserSequence extends OverlayEntry { family: Family; nabc: string; created: string /* ISO */ }
/** Overlay de nomes do usuário (schema 2). O schema 1 (sem `sequences`) é lido e migrado. */
export interface Overlay {
  schema: 2;
  kind: "notker-neume-overlay";
  entries: Record<string, OverlayEntry>;
  sequences: Record<string, UserSequence>;
}

/** Entrada como a UI a vê: catálogo + nomes do usuário, ou sequência do usuário. */
export interface EffectiveEntry extends Omit<NeumeEntry, "svg"> {
  /** Glifo da fonte. Ausente nas sequências do usuário (o desenho vem do motor). */
  svg?: GlyphSvg;
  /** Glifos das partes da cadeia (`!`, `/`), quando todas existem no catálogo. */
  partSvgs?: GlyphSvg[];
  displayNames: string[]; // nomes do usuário ++ [name]
  hidden: boolean;
  /** Só os nomes dados pelo usuário (o 1º é o principal). */
  userNames?: string[];
  /** Nota livre do usuário (o `note` do overlay), sem o significado do catálogo. */
  userNote?: string;
  /** Sequência criada pelo usuário (id `seq:…`). */
  userSequence?: boolean;
}

export interface BaseAnnotations {
  [base: string]: { pt?: string[]; meaning?: string };
}
