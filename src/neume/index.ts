import type { Extension } from "@codemirror/state";
import type { Tree } from "web-tree-sitter";
import type { NeumeSearch } from "./search";
import { nabcHover } from "./hover-nabc";
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
}
export function neumeExtensions(rt: NeumeRuntime): { extensions: Extension[]; palette: NeumePalette } {
  const palette = neumePalette({ getTree: rt.getTree, search: rt.search, onName: rt.onName });
  return {
    palette,
    extensions: [
      composeFromField,
      nabcHover(rt.getTree, rt.lookupByNabc, rt.activeFamily, rt.onName),
      ...nabcCompletion(rt.search),
      palette.keymap,
      nabcComposeHighlight,
    ],
  };
}
