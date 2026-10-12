import { defineConfig, type Plugin } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
// Servidor do pdf-probe (dev-only): porta 5199 sem vigiar arquivos; POST /__probe/save?name=x
// grava o corpo em debug/out/x (o PDF e o relatório do WebKitGTK, que não tem --dump-dom).
const save: Plugin = {
  name: "probe-save",
  configureServer(server) {
    server.middlewares.use("/__probe/save", (req, res) => {
      const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "out";
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        mkdirSync("debug/out", { recursive: true });
        writeFileSync(`debug/out/${name.replace(/[^\w.-]/g, "_")}`, Buffer.concat(chunks));
        res.end("ok");
      });
    });
  },
};
export default defineConfig({
  clearScreen: false,
  plugins: [save],
  server: { port: 5199, strictPort: true, watch: null },
  assetsInclude: ["**/*.wasm"],
  cacheDir: "node_modules/.vite-pdfprobe",
});
