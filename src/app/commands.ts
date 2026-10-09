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

export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (/^Digit\d$/.test(e.code) && (e.ctrlKey || e.metaKey)) k = e.code; // tecla física (AZERTY)
  else if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
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
      if (e.defaultPrevented) return false;
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
