/** Projeto de exemplo embutido (adendo §11): o bundle gerado de `samples/` por
 *  `npm run example`. Abre SEM caminho — o 1º Salvar é Salvar como, nunca por cima do
 *  embutido — e cada abertura é um projeto novo (fromBundle cria objetos novos). */
import type { NotkerProject } from "./tree";
import { type Bundle, fromBundle } from "./format";
import bundled from "../assets/example-project.json";

export function loadExampleProject(): NotkerProject {
  const b = bundled as unknown as Bundle;
  return fromBundle(b.project_json, b.files, undefined);
}
