import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const bin = resolve("src-tauri/binaries");
function sidecarPath(): string {
  const { stdout } = spawnSync("bash", ["-lc", `ls ${bin}/gregorio-lsp-* 2>/dev/null | head -1`], { encoding: "utf8" });
  return stdout.trim();
}

describe("gregorio-lsp sidecar", () => {
  it("binário existe e responde initialize com as capabilities esperadas", () => {
    const p = sidecarPath();
    expect(p, "rode `npm run sidecar` antes").not.toBe("");
    expect(existsSync(p)).toBe(true);

    const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } });
    const msg = `Content-Length: ${Buffer.byteLength(init)}\r\n\r\n${init}`;
    const res = spawnSync(p, [], { input: msg, encoding: "utf8", timeout: 10000 });
    expect(res.stdout).toContain("\"documentFormattingProvider\"");
    expect(res.stdout).toContain("\"completionProvider\"");
    expect(res.stdout).toContain("gregorio/shiftNotesUp");
  });
});
