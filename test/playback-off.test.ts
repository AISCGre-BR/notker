// test/playback-off.test.ts — playback desligado só por comentário; interpretação preservada
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { chantCapture } from "../src/app/chant-capture";
import { toBundle, fromBundle } from "../src/project/format";
import { updateChant, getActiveChant, type NotkerProject, type ChantNode } from "../src/project/tree";
import { projectFingerprint } from "../src/app/dirty";
import { emptyWave, gabcBodyHash } from "../src/tuotilo/wave";

const MARK = "// PLAYBACK-OFF (2026-10-09):";
const main = readFileSync("src/main.ts", "utf8");
/** Linhas ATIVAS (não comentadas) do main.ts. */
const active = main.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("UI de playback comentada (não removida)", () => {
  it("cada bloco tem o marcador e o código continua no arquivo, comentado", () => {
    expect(main.split(MARK).length - 1).toBeGreaterThanOrEqual(10);
    for (const s of ["createPlayer(", "new AudioContext()", "createWaveLanes(", "createWaveBar(", '"play.toggle"', '"wave.reset"', 'label: "Interpretação"']) {
      expect(main).toContain(s);       // preservado…
      expect(active).not.toContain(s); // …mas só em comentário
    }
  });
  it("módulos do Tuotilo e da onda continuam no repositório", () => {
    for (const f of ["src/tuotilo/player.ts", "src/tuotilo/wave.ts", "src/preview/wave-lanes.ts", "src/ui/wave-bar.ts"]) {
      expect(() => readFileSync(f, "utf8")).not.toThrow();
    }
  });
  it("o capture do editor passa pela função testada abaixo", () => {
    expect(active).toContain("chantCapture(view.state.doc.toString(), wave)");
    expect(active).toContain("wave = chant.interpretation ?? emptyWave(gabcBodyHash(chant.content));");
  });
});

describe("round-trip de chant.interpretation com o playback desligado", () => {
  const content = "name: Puer;\n%%\n(c4) Pu(g)er(h)";
  const interp = { gabcBodyHash: gabcBodyHash(content), factors: { "0:0": 1.6, "1:0": 0.8 } };
  const chant: ChantNode = { kind: "chant", id: "c1", title: "Puer", content, interpretation: interp };
  const proj: NotkerProject = { schema: 2, kind: "notker-project", title: "P", family: "stgall", root: [chant], activeId: "c1" };

  it("abrir → mostrar no editor → capturar → salvar regrava a interpretação idêntica", () => {
    const b = toBundle(proj);
    const opened = fromBundle(b.project_json, b.files, undefined);
    const loaded = getActiveChant(opened);
    const wave = loaded.interpretation ?? emptyWave(gabcBodyHash(loaded.content)); // o que syncFromProject faz
    const captured = updateChant(opened, loaded.id, chantCapture(loaded.content, wave));
    const again = toBundle(captured);
    expect(again.files).toEqual(b.files);
    expect(JSON.parse(again.files["interpretation/puer-c1.json"])).toEqual(interp);
    expect(projectFingerprint(captured)).toBe(projectFingerprint(opened)); // não vira "— Editado"
  });
  it("editar o texto não apaga a interpretação; canto sem onda continua sem", () => {
    const edited = updateChant(proj, "c1", chantCapture(content + " ", interp));
    expect(getActiveChant(edited).interpretation).toEqual(interp);
    expect(chantCapture(content, emptyWave("h")).interpretation).toBeUndefined();
    expect(chantCapture(content, undefined).interpretation).toBeUndefined();
  });
});
