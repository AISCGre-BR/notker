import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  // src-tauri/target (GBs de artefatos) esgota o limite de inotify (ENOSPC): fora do watcher.
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/.superpowers/**", "**/vendor/**"] } },
  assetsInclude: ["**/*.wasm"],
  // Libs do PDF entram só por import dinâmico: sem pré-otimizar, o dev server as
  // descobre no clique de Exportar PDF, reotimiza e recarrega a página inteira.
  optimizeDeps: { include: ["jspdf", "svg2pdf.js"] },
});
