import type { Extension } from "@codemirror/state";
import type { Tree } from "web-tree-sitter";
import { gabcHover } from "./hover-gabc";
import { legendVisible, setLegendTreeGetter } from "./staff-legend";

export function gabcAssistExtensions(getTree: () => Tree | null): Extension[] {
  setLegendTreeGetter(getTree);
  return [gabcHover(getTree), legendVisible];
}
