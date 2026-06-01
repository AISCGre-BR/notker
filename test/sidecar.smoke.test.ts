import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const bin = resolve("src-tauri/binaries");

// Check for the sidecar binary at module load time (top-level) so skipIf works
// correctly in CI where `npm run sidecar` has not been executed.
function findSidecarPath(): string {
  const { stdout } = spawnSync("bash", ["-lc", `ls ${bin}/gregorio-lsp-* 2>/dev/null | head -1`], { encoding: "utf8" });
  return stdout.trim();
}
const sidecarBin = findSidecarPath();
const sidecarPresent = sidecarBin !== "" && existsSync(sidecarBin);

describe.skipIf(!sidecarPresent)("gregorio-lsp sidecar", () => {
  it("binário existe e responde initialize com as capabilities esperadas", () => {
    expect(sidecarBin, "rode `npm run sidecar` antes").not.toBe("");
    expect(existsSync(sidecarBin)).toBe(true);

    const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } });
    const msg = `Content-Length: ${Buffer.byteLength(init)}\r\n\r\n${init}`;
    const res = spawnSync(sidecarBin, [], { input: msg, encoding: "utf8", timeout: 10000 });
    expect(res.stdout).toContain("\"documentFormattingProvider\"");
    expect(res.stdout).toContain("\"completionProvider\"");
    expect(res.stdout).toContain("gregorio/shiftNotesUp");
  });
});
