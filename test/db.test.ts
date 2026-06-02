// test/db.test.ts
import { describe, it, expect } from "vitest";
import { NeumeDatabase } from "../src/neume/db";
import type { NeumeDb } from "../src/neume/types";

const fake: NeumeDb = {
  schema: 1, generatedFrom: { gregall: "a", grelaon: "b", tables: "t" },
  entries: [
    { id: "stgall:cl", family: "stgall", code: "cl", nabc: "cl", nabcValid: true,
      base: "cl", name: "clivis", qualifiers: [], letters: [], terms: ["clivis", "cl"],
      meaning: "", svg: { path: "M0Z", viewBox: "0 0 1 1", advance: 1 } },
  ],
};

describe("NeumeDatabase", () => {
  it("indexa por id e expõe todas as entradas", () => {
    const db = new NeumeDatabase(fake);
    expect(db.all().length).toBe(1);
    expect(db.byId("stgall:cl")?.name).toBe("clivis");
    expect(db.byId("nope")).toBeUndefined();
  });
});
