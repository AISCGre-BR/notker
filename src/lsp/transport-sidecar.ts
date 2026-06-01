import type { Transport } from "./client";
import type { Child } from "@tauri-apps/plugin-shell";

/**
 * Minimal interface that the SidecarTransport needs from the Tauri Command object.
 * Mirrors the real `Command<string | Uint8Array>` shape so the injectable factory
 * works both with the genuine Tauri implementation and with test doubles.
 */
export type CommandLike = {
  stdout: { on: (event: "data", cb: (chunk: string | Uint8Array) => void) => void };
  stderr: { on: (event: "data", cb: (chunk: string | Uint8Array) => void) => void };
  on: (event: "close" | "error", cb: (payload: unknown) => void) => void;
  spawn: () => Promise<Child>;
};

/**
 * Factory padrão: constrói o Command real usando `@tauri-apps/plugin-shell`.
 * Definida como função nomeada para que o import seja lazy (a função só é
 * chamada em runtime, nunca durante a carga do módulo em ambiente de testes).
 */
function defaultMakeCommand(): CommandLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Command } = require("@tauri-apps/plugin-shell") as typeof import("@tauri-apps/plugin-shell");
  return Command.sidecar("binaries/gregorio-lsp", [], {
    encoding: "raw",
  }) as unknown as CommandLike;
}

/**
 * Transport que executa o sidecar `gregorio-lsp` via `@tauri-apps/plugin-shell`
 * e encaminha os dados do `stdout` para os callbacks registrados em `onData`.
 *
 * O sidecar deve estar declarado em `tauri.conf.json` como `binaries/gregorio-lsp`.
 *
 * A factory injetável (`makeCommand`) permite substituir o `Command` real por um
 * test double nas suítes de testes (onde o runtime Tauri não está disponível).
 */
export class SidecarTransport implements Transport {
  private child: Child | null = null;
  private dataCbs: ((chunk: string | Uint8Array) => void)[] = [];

  constructor(private makeCommand: () => CommandLike = defaultMakeCommand) {}

  onData(cb: (chunk: string | Uint8Array) => void): void {
    this.dataCbs.push(cb);
  }

  async start(): Promise<void> {
    const cmd = this.makeCommand();
    // Register stdout listener BEFORE spawn() — the real Tauri Command requires
    // listeners to be attached before the process starts emitting data.
    cmd.stdout.on("data", (chunk) => {
      for (const cb of this.dataCbs) cb(chunk);
    });
    this.child = await cmd.spawn();
  }

  write(data: string): void {
    // child.write is async but Transport.write is fire-and-forget.
    void this.child?.write(data);
  }

  async stop(): Promise<void> {
    await this.child?.kill();
    this.child = null;
  }
}
