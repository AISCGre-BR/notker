// test/recovery.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeSnapshot, parseSnapshot, projectFromSnapshot, createRecoveryWriter, RECOVERY_INTERVAL_MS,
} from "../src/app/recovery";
import { projectFingerprint } from "../src/app/dirty";
import { FUTURE_SCHEMA_MESSAGE } from "../src/project/format";
import { type NotkerProject, newProject, newGroup, newChant, insertNode, updateChant, getActiveChant } from "../src/project/tree";

const NOW = new Date("2026-10-10T09:00:00.000Z");
function proj(): NotkerProject {
  let p = newProject({ family: "laon", name: "Puer", title: "Missa de Natal" });
  const g = newGroup("Dia");
  p = insertNode(p, null, Infinity, g);
  return insertNode(p, g.id, 0, newChant({ title: "Viderunt" }));
}
function memSlot(initial: string | null = null) {
  const s = {
    text: initial,
    read: vi.fn(async (): Promise<string | null> => s.text),
    write: vi.fn(async (t: string): Promise<void> => { s.text = t; }),
    remove: vi.fn(async (): Promise<void> => { s.text = null; }),
  };
  return s;
}

describe("retrato", () => {
  it("ida e volta: mesmo projeto, com o caminho original", () => {
    const p = { ...proj(), path: "/m/Natal.notker" };
    const snap = parseSnapshot(JSON.stringify(makeSnapshot(p, NOW)))!;
    expect(snap).toMatchObject({ title: "Missa de Natal", path: "/m/Natal.notker", savedAt: NOW.toISOString() });
    const back = projectFromSnapshot(snap);
    expect(back.path).toBe("/m/Natal.notker");
    expect(projectFingerprint(back)).toBe(projectFingerprint(p));
  });
  it("projeto sem caminho fica sem caminho", () => {
    const snap = parseSnapshot(JSON.stringify(makeSnapshot(proj(), NOW)))!;
    expect(snap.path).toBeUndefined();
    expect(projectFromSnapshot(snap).path).toBeUndefined();
  });
  it("arquivo ausente, truncado (queda no meio da gravação) ou estranho → null", () => {
    const good = JSON.stringify(makeSnapshot(proj(), NOW));
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot(good.slice(0, good.length / 2))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...JSON.parse(good), kind: "outro" }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...JSON.parse(good), bundle: { project_json: "{}", files: { a: 1 } } }))).toBeNull();
    expect(parseSnapshot("[]")).toBeNull();
  });
  it("bundle interno corrompido: parseSnapshot aceita, projectFromSnapshot lança", () => {
    const snap = parseSnapshot(JSON.stringify({
      schema: 1, kind: "notker-recovery", title: "X", savedAt: "",
      bundle: { project_json: "{", files: {} },
    }))!;
    expect(snap).not.toBeNull();
    expect(() => projectFromSnapshot(snap)).toThrow();
  });
  it("bundle de uma versão mais nova: projectFromSnapshot lança a mensagem clara", () => {
    const snap = parseSnapshot(JSON.stringify({
      schema: 1, kind: "notker-recovery", title: "X", savedAt: "",
      bundle: { project_json: JSON.stringify({ schema: 9, kind: "notker-project" }), files: {} },
    }))!;
    expect(() => projectFromSnapshot(snap)).toThrow(FUTURE_SCHEMA_MESSAGE);
  });
});

describe("createRecoveryWriter", () => {
  let cur: NotkerProject | null;
  let slot: ReturnType<typeof memSlot>;
  const writer = (over: { onWrite?: () => void } = {}) =>
    createRecoveryWriter({ slot, current: () => cur, now: () => NOW, ...over });
  beforeEach(() => { cur = null; slot = memSlot(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("sem projeto a proteger não grava", async () => {
    await writer().tick();
    expect(slot.write).not.toHaveBeenCalled();
  });
  it("grava uma vez; sem mudança não regrava; texto ou caminho novos regravam", async () => {
    const w = writer();
    cur = proj();
    await w.tick();
    await w.tick();
    expect(slot.write).toHaveBeenCalledTimes(1);
    expect(parseSnapshot(slot.text)!.title).toBe("Missa de Natal");
    cur = updateChant(cur, cur.activeId, { content: getActiveChant(cur).content + "x" });
    await w.tick();
    cur = { ...cur, path: "/novo.notker" };
    await w.tick();
    expect(slot.write).toHaveBeenCalledTimes(3);
  });
  it("clear apaga o que esta sessão gravou; depois disso, volta a gravar", async () => {
    const onWrite = vi.fn();
    const w = writer({ onWrite });
    cur = proj();
    await w.tick();
    expect(onWrite).toHaveBeenCalledTimes(1);
    await w.clear();
    expect(slot.remove).toHaveBeenCalledTimes(1);
    cur = updateChant(cur, cur.activeId, { content: getActiveChant(cur).content + "novo" });
    await w.tick();
    expect(slot.write).toHaveBeenCalledTimes(2);
  });
  it("clear + tick com o MESMO estado (projeto descartado ainda aberto) não regrava", async () => {
    const w = writer();
    cur = proj();
    await w.tick();
    await w.clear();
    await w.tick();
    expect(slot.write).toHaveBeenCalledTimes(1);
    expect(slot.text).toBeNull();
  });
  it("clear sem ter gravado NÃO apaga o retrato de uma sessão que caiu; adopt faz apagar", async () => {
    slot = memSlot("retrato antigo");
    const w = writer();
    await w.clear();
    expect(slot.remove).not.toHaveBeenCalled();
    expect(slot.text).toBe("retrato antigo");
    w.adopt();
    await w.clear();
    expect(slot.remove).toHaveBeenCalledTimes(1);
  });
  it("falha ao gravar não lança e tenta de novo no próximo tick", async () => {
    const w = writer();
    cur = proj();
    slot.write.mockRejectedValueOnce(new Error("disco cheio"));
    await expect(w.tick()).resolves.toBeUndefined();
    await w.tick();
    expect(slot.write).toHaveBeenCalledTimes(2);
    expect(slot.text).not.toBeNull();
  });
  it("clear pedido durante uma gravação espera por ela (o retrato não volta)", async () => {
    let release!: () => void;
    slot.write.mockImplementationOnce((t: string) => new Promise<void>((r) => { release = () => { slot.text = t; r(); }; }));
    const w = writer();
    cur = proj();
    const t = w.tick();
    const c = w.clear();
    await vi.waitFor(() => expect(slot.write).toHaveBeenCalled());
    release();
    await Promise.all([t, c]);
    expect(slot.text).toBeNull();
  });
  it("start grava a cada 30 s; stop para", async () => {
    vi.useFakeTimers();
    const w = writer();
    cur = proj();
    w.start();
    await vi.advanceTimersByTimeAsync(RECOVERY_INTERVAL_MS - 1);
    expect(slot.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(slot.write).toHaveBeenCalledTimes(1);
    cur = updateChant(cur, cur.activeId, { content: "y" });
    w.stop();
    await vi.advanceTimersByTimeAsync(RECOVERY_INTERVAL_MS * 3);
    expect(slot.write).toHaveBeenCalledTimes(1);
  });
});
