// src/editor/chant-states.ts
/** Um EditorState por canto, em memória (spec §4.3): trocar de canto troca o estado
 *  INTEIRO (histórico de desfazer, seleção) em vez de reaproveitar um estado único via
 *  replaceDoc — o que fazia o Ctrl+Z trazer texto do canto anterior. A rolagem viaja
 *  junto como `view.scrollSnapshot()`. Um estado guardado só é reaproveitado se o texto
 *  ainda é o do projeto; senão nasce um estado novo (sem histórico de outro texto). */
import type { EditorState, StateEffect } from "@codemirror/state";

export interface ChantStates {
  get(id: string, content: string): EditorState;
  remember(id: string, state: EditorState, scroll?: StateEffect<unknown>): void;
  scrollOf(id: string): StateEffect<unknown> | undefined;
  /** Reescreve todos os estados guardados (ex.: reconfigurar um compartment que carregou depois). */
  mapAll(fn: (state: EditorState) => EditorState): void;
  clear(): void;
  size(): number;
}

export function createChantStates(make: (doc: string) => EditorState): ChantStates {
  const map = new Map<string, { state: EditorState; scroll?: StateEffect<unknown> }>();
  return {
    get(id, content) {
      const hit = map.get(id);
      if (hit && hit.state.doc.toString() === content) return hit.state;
      const state = make(content);
      map.set(id, { state });
      return state;
    },
    remember(id, state, scroll) { map.set(id, { state, scroll }); },
    scrollOf(id) { return map.get(id)?.scroll; },
    mapAll(fn) { for (const [id, e] of map) map.set(id, { ...e, state: fn(e.state) }); },
    clear() { map.clear(); },
    size() { return map.size; },
  };
}
