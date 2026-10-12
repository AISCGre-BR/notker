// src/neume/validate-nabc.ts — validação OFFLINE de uma cadeia nabc solta, com o MESMO
// teste que o build do catálogo usa para `nabcValid` (scripts/build-neume-db.ts):
// a cadeia vai num gabc mínimo `(h|<nabc>)` e o tree-sitter-gregorio não pode marcar erro.
// O parser é injetado (o app usa o do realce; os testes, um de Node).
import { normalizeNabc } from "./overlay";

export interface NabcParser { parse(text: string): { rootNode: { hasError: boolean } } | null }
export type NabcValidity = "empty" | "valid" | "invalid" | "unknown";

/** Caracteres que fecham/abrem o campo nabc ou o grupo de notas: nunca dentro de uma cadeia. */
const FORBIDDEN = /[|()%;{}]/;

export function validateNabc(parser: NabcParser | null, raw: string): NabcValidity {
  const n = normalizeNabc(raw);
  if (!n) return "empty";
  if (FORBIDDEN.test(n)) return "invalid";
  if (!parser) return "unknown";
  try {
    const tree = parser.parse(`nabc-lines: 1;\nname: probe;\n%%\n(h|${n})`);
    if (!tree) return "unknown";
    return tree.rootNode.hasError ? "invalid" : "valid";
  } catch {
    return "unknown"; // parser indisponível/quebrado: não bloqueia o usuário
  }
}
