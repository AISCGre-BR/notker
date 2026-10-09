import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  // src-tauri/target (GBs de artefatos) esgota o limite de inotify (ENOSPC): fora do watcher.
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/.superpowers/**", "**/vendor/**"] } },
  assetsInclude: ["**/*.wasm"],
});
