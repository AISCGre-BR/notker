// test/recent.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  parseRecent, serializeRecent, pushRecent, setRecentThumb, removeRecent, buildRecentMeta,
  displayName, parentFolder, recentTitle, formatRecentDate, createRecentStore, MAX_RECENT,
  type RecentEntry, type RecentMeta,
} from "../src/app/recent";
import { newProject, newChant, newGroup, insertNode } from "../src/project/tree";

const e = (path: string, title = path, extra: Partial<RecentMeta> = {}): RecentEntry =>
  ({ path, meta: { title, updatedAt: "2026-10-01T10:00:00.000Z", chants: [], ...extra } });
const JPG = "data:image/jpeg;base64,AAAA";

function memSlot(initial: string | null = null) {
  const s = {
    text: initial,
    read: vi.fn(async (): Promise<string | null> => s.text),
    write: vi.fn(async (t: string): Promise<void> => { s.text = t; }),
    remove: vi.fn(async (): Promise<void> => { s.text = null; }),
  };
  return s;
}

describe("lista de recentes", () => {
  it("pushRecent põe na frente, sem repetir o caminho, no máximo 10", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, e(`/p/${i}.notker`));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].path).toBe("/p/11.notker");
    list = pushRecent(list, e("/p/5.notker", "Cinco"));
    expect(list[0]).toMatchObject({ path: "/p/5.notker", meta: { title: "Cinco" } });
    expect(list.filter((x) => x.path === "/p/5.notker")).toHaveLength(1);
    expect(list).toHaveLength(MAX_RECENT);
  });
  it("pushRecent sem miniatura mantém a antiga; com miniatura nova, troca", () => {
    let list = [e("/a.notker", "A", { thumb: JPG })];
    list = pushRecent(list, e("/a.notker", "A2"));
    expect(list[0].meta).toMatchObject({ title: "A2", thumb: JPG });
    list = pushRecent(list, e("/a.notker", "A3", { thumb: "data:image/jpeg;base64,BBBB" }));
    expect(list[0].meta!.thumb).toBe("data:image/jpeg;base64,BBBB");
  });
  it("setRecentThumb não reordena; removeRecent tira só o caminho dado", () => {
    const list = [e("/a.notker"), e("/b.notker")];
    expect(setRecentThumb(list, "/b.notker", JPG).map((x) => [x.path, x.meta?.thumb])).toEqual([["/a.notker", undefined], ["/b.notker", JPG]]);
    expect(setRecentThumb(list, "/zz", JPG)).toBe(list);
    expect(removeRecent(list, "/a.notker").map((x) => x.path)).toEqual(["/b.notker"]);
  });
});

describe("recent.json tolerante", () => {
  it("ida e volta", () => {
    const list: RecentEntry[] = [e("/a.notker", "A", { chants: ["Puer", "Viderunt"], thumb: JPG }), { path: "/b.notker" }];
    expect(parseRecent(serializeRecent(list))).toEqual(list);
  });
  it("lixo não derruba: nulo, JSON inválido, não-lista, entradas sem caminho ou repetidas", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{")).toEqual([]);
    expect(parseRecent('"x"')).toEqual([]);
    expect(parseRecent(JSON.stringify([{ path: "/a" }, { nope: 1 }, { path: "" }, { path: "/a" }, 7]))).toEqual([{ path: "/a" }]);
  });
  it("miniatura que não é data:image some; cantos não-texto somem; no máximo 10", () => {
    const [x] = parseRecent(JSON.stringify([{ path: "/a", meta: { title: "A", updatedAt: "", chants: ["ok", 3], thumb: "javascript:alert(1)" } }]));
    expect(x.meta).toEqual({ title: "A", updatedAt: "", chants: ["ok"] });
    const many = Array.from({ length: 15 }, (_, i) => ({ path: `/p${i}` }));
    expect(parseRecent(JSON.stringify(many))).toHaveLength(MAX_RECENT);
  });
});

describe("meta e rótulos", () => {
  it("buildRecentMeta: título, data ISO e os 6 primeiros cantos em ordem de documento", () => {
    let p = newProject({ family: "stgall", name: "Puer", title: "Missa de Natal" });
    const g = newGroup("Dia");
    p = insertNode(p, null, Infinity, g);
    for (let i = 0; i < 7; i++) p = insertNode(p, g.id, Infinity, newChant({ title: `C${i}` }));
    expect(buildRecentMeta(p, new Date("2026-10-09T12:00:00.000Z"))).toEqual({
      title: "Missa de Natal", updatedAt: "2026-10-09T12:00:00.000Z", chants: ["Puer", "C0", "C1", "C2", "C3", "C4"],
    });
  });
  it("displayName, parentFolder e recentTitle", () => {
    expect(displayName("/home/g/Missas/Natal.notker")).toBe("Natal");
    expect(displayName("C:\\x\\Pascoa.NOTKER")).toBe("Pascoa");
    expect(parentFolder("/home/g/Missas/Natal.notker")).toBe("Missas");
    expect(parentFolder("Natal.notker")).toBe("");
    expect(recentTitle({ path: "/x/Natal.notker" })).toBe("Natal");
    expect(recentTitle(e("/x/a.notker", "  "))).toBe("a");
    expect(recentTitle(e("/x/a.notker", "Missa"))).toBe("Missa");
  });
  it("formatRecentDate: dia e mês por extenso; ano só se for outro; vazio se ilegível", () => {
    const now = new Date(2026, 9, 9, 12);
    expect(formatRecentDate(new Date(2026, 3, 27, 12).toISOString(), now)).toBe("27 de abril");
    expect(formatRecentDate(new Date(2025, 11, 25, 12).toISOString(), now)).toBe("25 de dezembro de 2025");
    expect(formatRecentDate("ontem", now)).toBe("");
    expect(formatRecentDate("", now)).toBe("");
  });
});

describe("createRecentStore", () => {
  it("load tira (e regrava sem) os arquivos que não existem mais", async () => {
    const slot = memSlot(serializeRecent([e("/a.notker"), e("/sumiu.notker"), e("/b.notker")]));
    const store = createRecentStore(slot, async (paths) => paths.map((p) => p !== "/sumiu.notker"));
    expect((await store.load()).map((x) => x.path)).toEqual(["/a.notker", "/b.notker"]);
    expect(parseRecent(slot.text).map((x) => x.path)).toEqual(["/a.notker", "/b.notker"]);
  });
  it("sem arquivo = vazio; falha na checagem mantém a lista; falha na leitura = vazio", async () => {
    expect(await createRecentStore(memSlot(null), async () => []).load()).toEqual([]);
    const slot = memSlot(serializeRecent([e("/a.notker")]));
    expect(await createRecentStore(slot, async () => { throw new Error("x"); }).load()).toHaveLength(1);
    expect(slot.write).not.toHaveBeenCalled();
    const bad = memSlot(null);
    bad.read.mockRejectedValueOnce(new Error("permissão"));
    expect(await createRecentStore(bad, async () => []).load()).toEqual([]);
  });
  it("save grava o JSON", async () => {
    const slot = memSlot();
    await createRecentStore(slot, async () => []).save([e("/a.notker")]);
    expect(parseRecent(slot.text)[0].path).toBe("/a.notker");
  });
});
