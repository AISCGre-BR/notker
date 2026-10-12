/** Registro ÚNICO de comandos (regra do Parchment: menubar, toolbar, menu de
 *  contexto e teclado chamam os mesmos comandos; o atalho aparece no menu e no
 *  tooltip). Atalhos são tratados no nível da JANELA — funcionam com o foco em
 *  qualquer lugar, sem depender do keymap do CodeMirror. */
import type { IconName } from "../ui/pd/icons";

export interface CommandDef {
  id: string;
  label: string | (() => string);
  run: () => void | Promise<void>;
  icon?: IconName;
  keys?: string[];
  enabled?: () => boolean;
  checked?: () => boolean;
  allowRepeat?: boolean;
}
export interface Commands { ids(): string[]; run(id: string): Promise<void>; }
export interface CommandRegistry extends Commands {
  register(defs: CommandDef[]): void;
  get(id: string): CommandDef | undefined;
  label(id: string): string;
  shortcut(id: string): string | undefined;
  tooltip(id: string): string;
  handleKey(e: KeyboardEvent): boolean;
  /** Notifica após cada run() bem-sucedido (clique, menu ou teclado). Devolve o cancelamento. */
  onDidRun(listener: (id: string) => void): () => void;
}

/** No macOS só Cmd (meta) vale "Ctrl" nos atalhos do registro; o Ctrl físico fica com o
 *  CodeMirror (emacs) e vira "MacCtrl", que nenhum atalho usa. Fora do Mac, Ctrl ou Meta. */
export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  const mac = isMac();
  const mod = mac ? e.metaKey : (e.ctrlKey || e.metaKey);
  if (mac && e.ctrlKey) parts.push("MacCtrl");
  if (mod) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (/^Digit\d$/.test(e.code) && mod) k = e.code; // tecla física (AZERTY)
  else if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}

/** Ctrl+P ou Ctrl+Shift+P (Cmd no Mac), pela tecla física. O Notker usa Ctrl+P para Exportar
 *  PDF… (o atalho é decidido por keyOf; aqui é só a guarda): em NENHUM caso (comando desabilitado,
 *  menu ou diálogo aberto, tecla segurada) a janela pode abrir a impressão nativa do navegador. */
export function isPrintKey(e: KeyboardEvent): boolean {
  // No macOS a impressão é Cmd+P; Ctrl+P é do CodeMirror (emacs cursorLineUp).
  const mod = isMac() ? e.metaKey : (e.ctrlKey || e.metaKey);
  return mod && !e.altKey && (e.code === "KeyP" || (!e.code && e.key.toLowerCase() === "p"));
}

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent || "");
}

/** Eventos de Ctrl+P que a guarda de janela (captura) já preveniu: o registro os trata
 *  como não tratados, para que o comando habilitado ainda rode. */
const printGuarded = new WeakSet<Event>();

/** Listener de janela em CAPTURA: previne a impressão nativa mesmo quando um campo
 *  inline faz stopPropagation e o evento nunca chegaria à fase de bolha. Devolve o desfazer. */
export function installPrintGuard(win: Window): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (isPrintKey(e) && !e.defaultPrevented) { printGuarded.add(e); e.preventDefault(); }
  };
  win.addEventListener("keydown", onKey, true);
  return () => win.removeEventListener("keydown", onKey, true);
}

const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
export function displayKey(k: string): string {
  return k.split("+").map((p) => ARROWS[p] ?? p.replace(/^Digit(\d)$/, "$1")).join("+");
}

function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.closest(".cm-editor")) return false; // o editor trata as próprias teclas (preventDefault)
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
}

export function createRegistry(): CommandRegistry {
  const defs = new Map<string, CommandDef>();
  const byKey = new Map<string, string>();
  const listeners = new Set<(id: string) => void>();

  const get = (id: string) => defs.get(id);
  const label = (id: string): string => {
    const d = defs.get(id);
    if (!d) return id;
    return typeof d.label === "function" ? d.label() : d.label;
  };
  const shortcut = (id: string): string | undefined => {
    const k = defs.get(id)?.keys?.[0];
    return k ? displayKey(k) : undefined;
  };

  async function run(id: string): Promise<void> {
    const d = defs.get(id);
    if (!d) throw new Error("comando desconhecido: " + id);
    if (d.enabled && !d.enabled()) return;
    await d.run();
    listeners.forEach((l) => l(id));
  }

  return {
    register(list) {
      for (const d of list) {
        const old = defs.get(d.id);
        old?.keys?.forEach((k) => { if (byKey.get(k) === d.id) byKey.delete(k); });
        defs.set(d.id, d);
        d.keys?.forEach((k) => byKey.set(k, d.id));
      }
    },
    get, label, shortcut, run,
    onDidRun(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    ids: () => [...defs.keys()],
    tooltip(id) {
      const s = shortcut(id);
      return s ? `${label(id)} (${s})` : label(id);
    },
    handleKey(e) {
      if (e.defaultPrevented && !printGuarded.has(e)) return false;
      if (isPrintKey(e)) e.preventDefault(); // vale para todos os `return false` abaixo
      if (document.querySelector('[role="menu"]')) return false; // menu aberto: teclas são do menu
      const k = keyOf(e);
      const id = byKey.get(k);
      if (!id) return false;
      if (isTextField(e.target) && !k.startsWith("Ctrl+")) return false;
      const d = defs.get(id)!;
      if (e.repeat && !d.allowRepeat) return false;
      if (d.enabled && !d.enabled()) return false;
      e.preventDefault();
      void run(id).catch((err) => console.error(`[notker] comando ${id}:`, err));
      return true;
    },
  };
}

/** Prende comandos a uma condição (ex.: só com a mesa do projeto à vista), mantendo o
 *  enabled() original. Chamar ANTES de montar menubar/toolbar: eles leem o def na montagem. */
export function gateCommands(reg: CommandRegistry, ids: string[], when: () => boolean): void {
  for (const id of ids) {
    const d = reg.get(id);
    if (!d) throw new Error("comando desconhecido: " + id);
    const inner = d.enabled;
    reg.register([{ ...d, enabled: () => when() && (inner ? inner() : true) }]);
  }
}
