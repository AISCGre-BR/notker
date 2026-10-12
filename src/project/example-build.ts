/** Monta o projeto de exemplo a partir dos `samples/*.gabc` (usado pelo script
 *  `scripts/build-example.ts` e pelo teste que confere o JSON embutido). PURO.
 *  Ids fixos: o JSON gerado só muda quando os samples mudam. */
import type { ChantNode, GroupNode, NotkerProject, TreeNode } from "./tree";
import { type Bundle, toBundle } from "./format";

export interface SampleFile { file: string; content: string }
export const EXAMPLE_TITLE = "Projeto de exemplo";

/** Título e lugar de cada sample na árvore (um grupo, para mostrar a organização). */
const LAYOUT: { file: string; id: string; title: string; group?: string }[] = [
  { file: "01-minimo.gabc", id: "ex01", title: "Pópulus Sion" },
  { file: "02-kyrie.gabc", id: "ex02", title: "Kyrie" },
  { file: "03-factus-est.gabc", id: "ex03", title: "Factus est", group: "Próprio da Missa" },
  { file: "04-dies-sanctificatus.gabc", id: "ex04", title: "Dies sanctificatus", group: "Próprio da Missa" },
];

export function buildExampleProject(samples: SampleFile[]): NotkerProject {
  const byFile = new Map(samples.map((s) => [s.file, s.content]));
  const root: TreeNode[] = [];
  const groups = new Map<string, GroupNode>();
  for (const it of LAYOUT) {
    const content = byFile.get(it.file);
    if (content === undefined) throw new Error(`sample ausente: ${it.file}`);
    const chant: ChantNode = { kind: "chant", id: it.id, title: it.title, content };
    if (!it.group) { root.push(chant); continue; }
    let g = groups.get(it.group);
    if (!g) {
      g = { kind: "group", id: `exg${groups.size + 1}`, title: it.group, children: [] };
      groups.set(it.group, g);
      root.push(g);
    }
    g.children.push(chant);
  }
  return { schema: 2, kind: "notker-project", title: EXAMPLE_TITLE, family: "stgall", root, activeId: LAYOUT[0].id };
}

export function buildExampleBundle(samples: SampleFile[]): Bundle {
  return toBundle(buildExampleProject(samples));
}
