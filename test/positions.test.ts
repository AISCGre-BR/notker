import { describe, it, expect } from "vitest";
import { parsePosition, nudgePitch, nudgeHShift, resetPosition } from "../src/neume/positions";

describe("positions (edição pura de posicionamento NABC)", () => {
  it("parse: default hf (pitch 'f'), sem deslocamento", () => {
    expect(parsePosition("vi")).toEqual({ hshift: 0, pitch: "f" });
  });
  it("parse: pitch explícito e deslocamentos", () => {
    expect(parsePosition("//vihg")).toEqual({ hshift: 2, pitch: "g" });
    expect(parsePosition("`clS")).toEqual({ hshift: -1, pitch: "f" });
  });
  it("nudgePitch sobe/desce dentro de a..n,p (sem 'o') e faz clamp", () => {
    expect(nudgePitch("vi", +1)).toBe("vihg");
    expect(nudgePitch("vihg", -1)).toBe("vi"); // volta ao default => forma canônica mínima (sem h)
    expect(nudgePitch("vihn", +1)).toBe("vihp");
    expect(nudgePitch("vihp", +1)).toBe("vihp"); // clamp topo
    expect(nudgePitch("viha", -1)).toBe("viha"); // clamp base
    expect(nudgePitch("pe-su2", +1)).toBe("pe-hgsu2"); // pitch após modificador, antes de su
  });
  it("nudgeHShift insere/empilha / e ` (larger = passo maior)", () => {
    expect(nudgeHShift("vi", +1, false)).toBe("/vi");
    expect(nudgeHShift("/vi", +1, false)).toBe("//vi");
    expect(nudgeHShift("vi", +1, true)).toBe("//vi");
    expect(nudgeHShift("vi", -1, false)).toBe("`vi");
    expect(nudgeHShift("/vi", -1, false)).toBe("vi"); // anula um passo à direita
  });
  it("resetPosition tira deslocamento e pitch", () => {
    expect(resetPosition("//vihg")).toBe("vi");
    expect(resetPosition("`pe-hgsu2")).toBe("pe-su2");
  });
});
