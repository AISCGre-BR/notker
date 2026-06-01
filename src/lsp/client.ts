import { encodeMessage, MessageBuffer, type RpcMessage } from "./jsonrpc";

export interface Transport {
  start(): Promise<void>;
  stop(): Promise<void>;
  write(data: string): void;
  onData(cb: (chunk: string | Uint8Array) => void): void;
}

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };

export class LspClient {
  private id = 0;
  private pending = new Map<number, Pending>();
  private handlers = new Map<string, ((params: any) => void)[]>();
  private buffer = new MessageBuffer();

  constructor(private transport: Transport) {}

  async start(): Promise<void> {
    this.transport.onData((chunk) => {
      this.buffer.append(chunk);
      for (const msg of this.buffer.drain()) this.dispatch(msg);
    });
    await this.transport.start();
  }

  async stop(): Promise<void> {
    await this.transport.stop();
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = ++this.id;
    const msg: RpcMessage = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.transport.write(encodeMessage(msg));
    });
  }

  notify(method: string, params?: unknown): void {
    this.transport.write(encodeMessage({ jsonrpc: "2.0", method, params }));
  }

  onNotification(method: string, cb: (params: any) => void): void {
    const arr = this.handlers.get(method) ?? [];
    arr.push(cb);
    this.handlers.set(method, arr);
  }

  private dispatch(msg: RpcMessage): void {
    if (typeof msg.id === "number" && ("result" in msg || "error" in msg)) {
      const p = this.pending.get(msg.id as number);
      if (!p) return;
      this.pending.delete(msg.id as number);
      if ("error" in msg) p.reject(msg.error);
      else p.resolve(msg.result);
    } else if (typeof msg.method === "string") {
      for (const cb of this.handlers.get(msg.method) ?? []) cb(msg.params);
    }
  }
}
