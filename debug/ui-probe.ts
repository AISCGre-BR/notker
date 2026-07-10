/** ui-probe.ts — harness de diagnóstico da UI spec B (NÃO faz parte do app).
 *  Monta menubar + toolbar + wave-bar com estado falso p/ screenshot headless.
 *  Query string: ?menu=N abre o N-ésimo menu; ?wave=1 mostra a barra da onda. */
import "../src/ui/tokens.css";
import { createMenubar } from "../src/ui/menubar";
import { createToolbar } from "../src/ui/toolbar";
import { createWaveBar } from "../src/ui/wave-bar";
import type { Commands } from "../src/ui/commands";

const commands: Commands = { ids: () => [], run: async (id) => { console.log("cmd:", id); } };
const qs = new URLSearchParams(location.search);

createMenubar(document.querySelector<HTMLElement>("#menubar")!, commands, [
  {
    label: "Arquivo",
    items: [
      { cmd: "newProjectCmd", label: "Novo projeto…" },
      { cmd: "openFile", label: "Abrir…", shortcut: "Ctrl+O" },
      { cmd: "saveFile", label: "Salvar", shortcut: "Ctrl+S" },
      "---",
      { cmd: "exportGabc", label: "Exportar .gabc" },
      { cmd: "exportAllGabcCmd", label: "Exportar todos os .gabc" },
    ],
  },
  {
    label: "Editar",
    items: [
      { cmd: "format", label: "Formatar", shortcut: "Ctrl+Shift+F" },
      "---",
      { cmd: "moveLeft", label: "Mover neuma à esquerda", shortcut: "Alt+←" },
      { cmd: "moveUp", label: "Subir o neuma", shortcut: "Alt+↑" },
    ],
  },
  {
    label: "Exibir",
    items: [
      { cmd: "togglePreview", label: "Partitura", checked: () => true },
      { cmd: "toggleSplit", label: "Lado a lado", checked: () => true },
      { cmd: "toggleLegend", label: "Régua da pauta", shortcut: "Ctrl+Alt+L", checked: () => false },
      "---",
      { cmd: "toggleFamily", label: "Família: St. Gall ⇄ Laon", shortcut: "Ctrl+Shift+G" },
    ],
  },
  {
    label: "Interpretação",
    items: [
      { cmd: "playToggle", label: "Tocar" },
      { cmd: "modeToggle", label: "Modo: interpretado" },
      "---",
      { cmd: "toggleWave", label: "Onda de interpretação", checked: () => qs.get("wave") === "1" },
      { cmd: "resetWave", label: "Resetar onda", enabled: () => qs.get("wave") === "1" },
    ],
  },
]);

const toolbar = createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
  { id: "playToggle", label: "Tocar", primary: true },
  { id: "modeToggle", label: "Interpretado" },
  { id: "toggleWave", label: "Onda" },
  "|",
  { id: "moveLeft", label: "◀" },
  { id: "moveDown", label: "▼" },
  { id: "moveUp", label: "▲" },
  { id: "moveRight", label: "▶" },
  { id: "moveReset", label: "⟳" },
  "|",
  { id: "openSearch", label: "Buscar" },
  { id: "openOverlayPanel", label: "Nomes" },
]);

const waveBar = createWaveBar(document.querySelector<HTMLElement>("#wave-bar-host")!, () => {});
if (qs.get("wave") === "1") {
  waveBar.setVisible(true);
  waveBar.setCount(Number(qs.get("n") ?? "3"));
  toolbar.setPressed("toggleWave", true);
  if (qs.get("reading")) waveBar.setReading("alongamento ×1,50 — nota 2 de 3");
  if (qs.get("solfejo")) waveBar.setSolfejo(true);
}

const menuIdx = qs.get("menu");
if (menuIdx !== null) {
  document.querySelectorAll<HTMLButtonElement>(".menubar-top")[Number(menuIdx)]?.click();
}
