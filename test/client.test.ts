import { describe, it, expect } from "vitest";
import { LspClient, type Transport } from "../src/lsp/client";

function fakeTransport(): Transport & { emit: (s: string) => void; sent: string[] } {
  let onData: (s: string) => void = () => {};
  return {
    sent: [] as string[],
    async start() {}, async stop() {},
    write(s: string) { this.sent.push(s); },
    onData(cb: (s: string) => void) { onData = cb; },
    emit(s: string) { onData(s); },
  } as any;
}

describe("LspClient", () => {
  it("request resolve quando chega a resposta com mesmo id", async () => {
    const t = fakeTransport();
    const c = new LspClient(t);
    await c.start();
    const p = c.request("initialize", { capabilities: {} });
    expect(t.sent[0]).toContain("\"method\":\"initialize\"");
    const body = `{"jsonrpc":"2.0","id":1,"result":{"x":1}}`;
    t.emit(`Content-Length: ${body.length}\r\n\r\n${body}`);
    await expect(p).resolves.toEqual({ x: 1 });
  });
  it("notificações chamam handlers registrados", async () => {
    const t = fakeTransport();
    const c = new LspClient(t);
    await c.start();
    const got: any[] = [];
    c.onNotification("textDocument/publishDiagnostics", (p) => got.push(p));
    const body = `{"jsonrpc":"2.0","method":"textDocument/publishDiagnostics","params":{"uri":"u","diagnostics":[]}}`;
    t.emit(`Content-Length: ${body.length}\r\n\r\n${body}`);
    expect(got).toEqual([{ uri: "u", diagnostics: [] }]);
  });
});
