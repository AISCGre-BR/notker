import { defineConfig } from "vite";
// Servidor dedicado ao harness de diagnóstico (porta + cache isolados do app).
export default defineConfig({
  clearScreen: false,
  server: { port: 5199, strictPort: true },
  assetsInclude: ["**/*.wasm"],
  cacheDir: "node_modules/.vite-probe",
});
