import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  assetsInclude: ["**/*.wasm"],
});
