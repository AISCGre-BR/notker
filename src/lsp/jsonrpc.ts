/**
 * JSON-RPC framing para LSP (Content-Length over stdio).
 *
 * DESIGN: byte-correct UTF-8
 * ==========================
 * O LSP spec (§3.1) define que Content-Length é o número de *bytes* UTF-8 do
 * corpo — não o número de code units JavaScript (UTF-16).  Para payloads que
 * incluem texto litúrgico gregoriano ("Pópulus Sión", "Kýrie", etc.) há
 * caracteres além do BMP; usar `string.length` ou `string.slice(n)` seria
 * errado porque conta code units, não bytes.
 *
 * Estratégia:
 * - `encodeMessage` serializa o JSON e usa `TextEncoder` para obter o tamanho
 *   em bytes antes de escrever o cabeçalho.
 * - `MessageBuffer` acumula dados como `Uint8Array` internamente.
 *   `append()` aceita `string | Uint8Array` — strings são codificadas em UTF-8
 *   na entrada para que os offsets de corte sejam sempre em bytes.
 * - `drain()` localiza `\r\n\r\n` em bytes, lê Content-Length, aguarda o
 *   número exacto de bytes do corpo e só então descodifica com `TextDecoder`.
 *
 * API pública:
 *   encodeMessage(msg): string
 *   MessageBuffer.append(chunk: string | Uint8Array): void
 *   MessageBuffer.drain(): RpcMessage[]
 */

export type RpcMessage = Record<string, unknown>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Converte msg em frame LSP: "Content-Length: N\r\n\r\n{...json...}" */
export function encodeMessage(msg: RpcMessage): string {
  const json = JSON.stringify(msg);
  const byteLen = encoder.encode(json).length;
  return `Content-Length: ${byteLen}\r\n\r\n${json}`;
}

// Bytes de interesse
const CR = 0x0d; // \r
const LF = 0x0a; // \n

/** Concatena dois Uint8Array. */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Localiza a sequência \r\n\r\n em `buf` a partir de `offset`.
 * Retorna o índice do primeiro \r, ou -1 se não encontrado.
 */
function findHeaderEnd(buf: Uint8Array, offset = 0): number {
  for (let i = offset; i <= buf.length - 4; i++) {
    if (buf[i] === CR && buf[i + 1] === LF && buf[i + 2] === CR && buf[i + 3] === LF) {
      return i;
    }
  }
  return -1;
}

/**
 * Acumula chunks de bytes (ou strings) e devolve mensagens LSP completas.
 * Robusto a fragmentação arbitrária — incluindo corte no meio de um codepoint
 * multi-byte UTF-8 (ex.: no meio de "ó" 0xC3 0xB3).
 */
export class MessageBuffer {
  private buf: Uint8Array = new Uint8Array(0);

  /**
   * Adiciona um chunk ao buffer interno.
   * Aceita `string` (codificada em UTF-8 internamente) ou `Uint8Array`
   * (usada directamente, sem cópia extra).
   */
  append(chunk: string | Uint8Array): void {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    this.buf = concat(this.buf, bytes);
  }

  /**
   * Extrai todas as mensagens completas disponíveis no buffer.
   * Mensagens incompletas ficam retidas para o próximo `append`.
   */
  drain(): RpcMessage[] {
    const msgs: RpcMessage[] = [];

    for (;;) {
      const headerEnd = findHeaderEnd(this.buf);
      if (headerEnd === -1) break;

      // Decodifica apenas o cabeçalho (ASCII puro)
      const headerStr = decoder.decode(this.buf.slice(0, headerEnd));
      const m = /Content-Length:\s*(\d+)/i.exec(headerStr);
      if (!m) {
        // Cabeçalho malformado — descartar até o fim do separador
        this.buf = this.buf.slice(headerEnd + 4);
        continue;
      }

      const bodyLen = parseInt(m[1], 10);
      const bodyStart = headerEnd + 4;

      if (this.buf.length - bodyStart < bodyLen) {
        // Corpo ainda incompleto
        break;
      }

      const bodyBytes = this.buf.slice(bodyStart, bodyStart + bodyLen);
      this.buf = this.buf.slice(bodyStart + bodyLen);

      try {
        msgs.push(JSON.parse(decoder.decode(bodyBytes)) as RpcMessage);
      } catch {
        // Corpo inválido — ignora
      }
    }

    return msgs;
  }
}
