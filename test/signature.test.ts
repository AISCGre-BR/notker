import { describe, it, expect } from "vitest";
import { signature } from "../src/neume/signature";

describe("signature (assinatura estrutural)", () => {
  it("ignora contagens, letras significativas, pitch e ajuste horizontal", () => {
    expect(signature("vippt3su2", "stgall")).toBe("stgall·vi·pp+su");
    expect(signature("vippt1su2", "stgall")).toBe("stgall·vi·pp+su");
    expect(signature("vippt1su2lsc3", "stgall")).toBe("stgall·vi·pp+su");
    expect(signature("//vihg", "stgall")).toBe("stgall·vi·");
  });
  it("é escopada por família", () => {
    expect(signature("vipp2", "laon")).toBe("laon·vi·pp");
    expect(signature("vipp2", "stgall")).toBe("stgall·vi·pp");
  });
  it("base sem modificadores", () => {
    expect(signature("cl", "stgall")).toBe("stgall·cl·");
  });
  it("modificadores de glifo (S/G/M/-/>/~) entram, contagem não", () => {
    expect(signature("clS1", "stgall")).toBe("stgall·cl·S");
    expect(signature("cl>1", "stgall")).toBe("stgall·cl·>");
    expect(signature("pe-su2", "stgall")).toBe("stgall·pe·-+su");
  });
  it("sequência ! preserva as bases conectadas", () => {
    expect(signature("cl!po", "stgall")).toBe("stgall·cl!po·");
    expect(signature("toS!pe", "stgall")).toBe("stgall·to!pe·S");
  });
});
