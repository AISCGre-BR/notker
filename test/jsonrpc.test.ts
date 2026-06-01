import { describe, it, expect } from "vitest";
import { encodeMessage, MessageBuffer } from "../src/lsp/jsonrpc";

describe("jsonrpc framing", () => {
  it("encode produz cabeçalho Content-Length correto", () => {
    const s = encodeMessage({ jsonrpc: "2.0", id: 1, method: "x" });
    expect(s.startsWith("Content-Length: ")).toBe(true);
    expect(s).toContain("\r\n\r\n");
  });

  it("MessageBuffer decodifica mensagens fragmentadas", () => {
    const buf = new MessageBuffer();
    const out: any[] = [];
    const full = encodeMessage({ jsonrpc: "2.0", id: 2, result: { ok: true } });
    buf.append(full.slice(0, 10));
    buf.drain().forEach((m) => out.push(m));
    buf.append(full.slice(10));
    buf.drain().forEach((m) => out.push(m));
    expect(out).toEqual([{ jsonrpc: "2.0", id: 2, result: { ok: true } }]);
  });

  it("encode: Content-Length reflete bytes UTF-8, não unidades de código", () => {
    // "Pópulus Sión" tem caracteres fora do ASCII — bytes > code units
    const msg = { jsonrpc: "2.0", id: 3, text: "Pópulus Sión" };
    const framed = encodeMessage(msg);
    const headerEnd = framed.indexOf("\r\n\r\n");
    const header = framed.slice(0, headerEnd);
    const declaredLen = parseInt(/Content-Length:\s*(\d+)/i.exec(header)![1], 10);
    const body = framed.slice(headerEnd + 4);
    const actualByteLen = new TextEncoder().encode(body).length;
    expect(declaredLen).toBe(actualByteLen);
    // Deve ser maior que body.length pois há bytes multi-byte
    expect(actualByteLen).toBeGreaterThan(body.length);
  });

  it("MessageBuffer decodifica mensagem UTF-8 fragmentada no meio de um caractere multi-byte", () => {
    const buf = new MessageBuffer();
    const out: any[] = [];
    const msg = { jsonrpc: "2.0", id: 4, text: "Pópulus Sión" };
    const framed = encodeMessage(msg);

    // Converter o frame inteiro para bytes e fragmentar no meio de um codepoint multi-byte
    const encoder = new TextEncoder();
    const framedBytes = encoder.encode(framed);

    // Encontrar a posição do corpo (após \r\n\r\n)
    const headerEnd = framed.indexOf("\r\n\r\n");
    const headerBytes = encoder.encode(framed.slice(0, headerEnd + 4)).length;

    // Cortar no meio do corpo (alguns bytes dentro do conteúdo UTF-8)
    // Garantimos que o ponto de corte seja no meio de "Pópulus Sión"
    const splitPoint = headerBytes + 10; // 10 bytes dentro do corpo

    // Alimentar o buffer em dois pedaços de bytes
    buf.append(framedBytes.slice(0, splitPoint));
    buf.drain().forEach((m) => out.push(m));
    buf.append(framedBytes.slice(splitPoint));
    buf.drain().forEach((m) => out.push(m));

    expect(out).toEqual([msg]);
  });

  it("MessageBuffer aceita string e Uint8Array no mesmo buffer", () => {
    const buf = new MessageBuffer();
    const out: any[] = [];
    const msg = { jsonrpc: "2.0", id: 5, method: "ping" };
    const framed = encodeMessage(msg);

    // Primeira metade como string, segunda como bytes
    const mid = Math.floor(framed.length / 2);
    buf.append(framed.slice(0, mid));
    buf.drain().forEach((m) => out.push(m));
    buf.append(new TextEncoder().encode(framed.slice(mid)));
    buf.drain().forEach((m) => out.push(m));

    expect(out).toEqual([msg]);
  });
});
