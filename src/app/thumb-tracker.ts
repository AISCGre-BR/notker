// src/app/thumb-tracker.ts
/** Memória (por sessão) do conteúdo do 1º canto que originou a última miniatura de cada
 *  caminho. Salvar só regenera a miniatura se esse conteúdo mudou; desconhecido = mudou. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

export interface ThumbTracker {
  changed(path: string, content: string): boolean;
  remember(path: string, content: string): void;
  forget(path: string): void;
}

export function createThumbTracker(): ThumbTracker {
  const seen = new Map<string, string>();
  return {
    changed: (path, content) => seen.get(path) !== hash(content),
    remember: (path, content) => { seen.set(path, hash(content)); },
    forget: (path) => { seen.delete(path); },
  };
}
