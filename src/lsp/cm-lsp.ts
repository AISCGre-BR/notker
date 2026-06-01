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

/** Formata o documento via LSP (grefmt) e devolve o texto formatado, ou null. */
export async function formatDocument(client: LspClient, uri: string, _doc: Text): Promise<string | null> {
  const edits = await client.request<Array<{ newText?: string }> | null>("textDocument/formatting", {
    textDocument: { uri },
    options: { tabSize: 2, insertSpaces: true },
  });
  if (!edits || edits.length === 0) return null;
  return edits[0].newText ?? null;
}

export function runGregorioCommand(client: LspClient, command: string, uri: string): void {
  client.notify("workspace/executeCommand", { command, arguments: [uri] });
}
