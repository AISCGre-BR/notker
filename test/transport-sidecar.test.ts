import { describe, it, expect, vi } from "vitest";
import { SidecarTransport } from "../src/lsp/transport-sidecar";

function fakeChild() { return { write: vi.fn(async () => {}), kill: vi.fn(async () => {}) }; }
function fakeCommand(child: any) {
  const listeners: Record<string, ((d: any) => void)[]> = {};
  return {
    stdout: { on: (e: string, cb: any) => ((listeners[`o:${e}`] ??= []).push(cb)) },
    stderr: { on: (_e: string, _cb: any) => {} },
    on: (_e: string, _cb: any) => {},
    spawn: vi.fn(async () => child),
    _emitStdout: (d: string) => (listeners["o:data"] ?? []).forEach((cb) => cb(d)),
  };
}

describe("SidecarTransport", () => {
  it("write encaminha para child.stdin; stdout vira onData", async () => {
    const child = fakeChild();
    const cmd = fakeCommand(child);
    const t = new SidecarTransport(() => cmd as any);
    const seen: (string | Uint8Array)[] = [];
    t.onData((c) => seen.push(c));
    await t.start();
    t.write("hello");
    expect(child.write).toHaveBeenCalledWith("hello");
    cmd._emitStdout("world");
    expect(seen).toEqual(["world"]);
  });
  it("stop mata o child", async () => {
    const child = fakeChild();
    const cmd = fakeCommand(child);
    const t = new SidecarTransport(() => cmd as any);
    await t.start();
    await t.stop();
    expect(child.kill).toHaveBeenCalled();
  });
});
