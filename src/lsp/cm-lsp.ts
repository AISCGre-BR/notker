import type { Text } from "@codemirror/state";
import type { Diagnostic as CMDiagnostic } from "@codemirror/lint";
import type { LspClient } from "./client";

interface LspPos { line: number; character: number }
interface LspRange { start: LspPos; end: LspPos }
interface LspDiagnostic { range: LspRange; severity?: number; message: string }

const SEV: Record<number, CMDiagnostic["severity"]> = { 1: "error", 2: "warning", 3: "info", 4: "info" };

export function posToOffset(doc: Text, p: LspPos): number {
  const line = doc.line(Math.min(p.line + 1, doc.lines));
  return Math.min(line.from + p.character, line.to);
}

export function lspDiagnosticsToCM(doc: Text, diags: LspDiagnostic[]): CMDiagnostic[] {
  return diags.map((d) => ({
    from: posToOffset(doc, d.range.start),
    to: posToOffset(doc, d.range.end),
    severity: SEV[d.severity ?? 1] ?? "error",
    message: d.message,
  }));
}

interface LspTextEdit {
  range: LspRange;
  newText: string;
}

/**
 * Formata o documento via LSP (grefmt) e devolve o texto completo resultante,
 * ou null quando o servidor não devolve edições.
 *
 * Aplica TODOS os edits retornados pelo servidor em ordem descendente de
 * offset para que splices anteriores não invalidem os offsets seguintes.
 */
export async function formatDocument(client: LspClient, uri: string, doc: Text): Promise<string | null> {
  const edits = await client.request<LspTextEdit[] | null>("textDocument/formatting", {
    textDocument: { uri },
    options: { tabSize: 2, insertSpaces: true },
  });
  if (!edits || edits.length === 0) return null;

  let text = doc.toString();

  // Sort edits by start offset descending so later splices don't shift earlier ones.
  const sorted = [...edits].sort(
    (a, b) => posToOffset(doc, b.range.start) - posToOffset(doc, a.range.start),
  );

  for (const edit of sorted) {
    const from = posToOffset(doc, edit.range.start);
    const to = posToOffset(doc, edit.range.end);
    text = text.slice(0, from) + edit.newText + text.slice(to);
  }

  return text;
}

export function runGregorioCommand(client: LspClient, command: string, uri: string): void {
  client.notify("workspace/executeCommand", { command, arguments: [uri] });
}
