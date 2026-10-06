import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosave } from "../src/neume/autosave";

describe("createAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesce uma rajada em UMA escrita, após o atraso", async () => {
    const write = vi.fn(() => Promise.resolve());
    const a = createAutosave(write, 300);
    void a.schedule(); void a.schedule(); void a.schedule();
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("schedule() só resolve quando a escrita REAL termina (indicador verdadeiro)", async () => {
    let done!: () => void;
    const write = vi.fn(() => new Promise<void>((r) => { done = r; }));
    const a = createAutosave(write, 300);
    let settled = false;
    void a.schedule().then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(false);
    done();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });

  it("falha da escrita rejeita todas as promessas da rajada", async () => {
    const a = createAutosave(() => Promise.reject(new Error("disco")), 300);
    const p1 = a.schedule(); const p2 = a.schedule();
    const r = Promise.allSettled([p1, p2]);
    await vi.advanceTimersByTimeAsync(300);
    expect((await r).map((x) => x.status)).toEqual(["rejected", "rejected"]);
  });

  it("flush() escreve JÁ o que está pendente e resolve junto com a rajada", async () => {
    const write = vi.fn(() => Promise.resolve());
    const a = createAutosave(write, 300);
    const p = a.schedule();
    await a.flush();
    expect(write).toHaveBeenCalledTimes(1);
    await expect(p).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(300);
    expect(write).toHaveBeenCalledTimes(1); // nada sobra p/ o timer
  });

  it("flush() sem pendência não escreve", async () => {
    const write = vi.fn(() => Promise.resolve());
    await createAutosave(write, 300).flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("flush() durante escrita em curso espera por ela", async () => {
    let done!: () => void;
    const a = createAutosave(() => new Promise<void>((r) => { done = r; }), 300);
    void a.schedule();
    await vi.advanceTimersByTimeAsync(300);
    let flushed = false;
    void a.flush().then(() => { flushed = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);
    done();
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(true);
  });
});
