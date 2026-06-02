import type { Extension } from "@codemirror/state";
import type { Tree } from "web-tree-sitter";
import type { NeumeSearch } from "./search";
import { nabcHover } from "./hover-nabc";
import { nabcCompletion } from "./completion";
import { neumePalette } from "./palette";
import { nabcComposeHighlight } from "./compose-highlight";
import { composeFromField } from "./compose-state";
import type { EffectiveEntry, Family } from "./types";

export interface NeumeRuntime {
  getTree: () => Tree | null;
  search: () => NeumeSearch;
  lookupByNabc: (nabc: string) => EffectiveEntry[];
  activeFamily: () => Family;
  onAddName: (id: string) => void;
}
export function neumeExtensions(rt: NeumeRuntime): Extension[] {
  return [
    composeFromField,
    nabcHover(rt.getTree, rt.lookupByNabc, rt.activeFamily),
    ...nabcCompletion(rt.search),
    neumePalette({ getTree: rt.getTree, search: rt.search, onAddName: rt.onAddName }),
    nabcComposeHighlight,
  ];
}
