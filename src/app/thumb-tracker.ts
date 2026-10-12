// src/app/thumb-tracker.ts
/** Memória (por sessão) do conteúdo do 1º canto que originou a última miniatura de cada
 *  caminho. Salvar só regenera a miniatura se esse conteúdo mudou; desconhecido = mudou. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Chave da miniatura: conteúdo + família (trocar a família redesenha os neumas). */
const key = (content: string, family?: string): string => `${family ?? ""}|${hash(content)}`;

export interface ThumbTracker {
  changed(path: string, content: string, family?: string): boolean;
  remember(path: string, content: string, family?: string): void;
  forget(path: string): void;
}

export function createThumbTracker(): ThumbTracker {
  const seen = new Map<string, string>();
  return {
    changed: (path, content, family) => seen.get(path) !== key(content, family),
    remember: (path, content, family) => { seen.set(path, key(content, family)); },
    forget: (path) => { seen.delete(path); },
  };
}
