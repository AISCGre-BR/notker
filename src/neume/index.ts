import type { Extension } from "@codemirror/state";
import type { Tree } from "web-tree-sitter";
import type { NeumeSearch } from "./search";
import { nabcHover, type OpenNames } from "./hover-nabc";
import { nabcCompletion } from "./completion";
import { neumePalette, type NeumePalette } from "./palette";
import { nabcComposeHighlight } from "./compose-highlight";
import { composeFromField } from "./compose-state";
import type { EffectiveEntry, Family } from "./types";

export interface NeumeRuntime {
  getTree: () => Tree | null;
  search: () => NeumeSearch;
  lookupByNabc: (nabc: string) => EffectiveEntry[];
  activeFamily: () => Family;
  onName: (ids: string[], name: string) => void | Promise<void>;
  /** "Abrir na tela de nomes" no hover (vista Neumas). */
  openNames?: OpenNames;
}
export function neumeExtensions(rt: NeumeRuntime): { extensions: Extension[]; palette: NeumePalette } {
  const palette = neumePalette({ getTree: rt.getTree, search: rt.search, activeFamily: rt.activeFamily, onName: rt.onName });
  return {
    palette,
    extensions: [
      composeFromField,
      nabcHover(rt.getTree, rt.lookupByNabc, rt.activeFamily, rt.onName, rt.openNames),
      ...nabcCompletion(rt.search, rt.activeFamily),
      palette.keymap,
      nabcComposeHighlight,
    ],
  };
}
