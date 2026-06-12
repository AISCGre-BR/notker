import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE, validateProfile } from "../src/tuotilo/profile";

describe("tuotilo profile", () => {
  it("defaults sem proporções mensuradas (D-23)", () => {
    const f = DEFAULT_PROFILE.factors;
    for (const v of Object.values(f)) { expect(v).not.toBe(2.0); expect(v).not.toBe(1.5); }
  });
  it("valida tetos hierárquicos crescentes", () => {
    const c = DEFAULT_PROFILE.caps;
    expect(c.sign).toBeLessThan(c.incisum);
    expect(c.incisum).toBeLessThan(c.phrase);
    expect(validateProfile(DEFAULT_PROFILE)).toBe(true);
  });
  it("factors contém os 4 níveis canônicos de divisio (minima/minor/maior/finalis)", () => {
    const f = DEFAULT_PROFILE.factors;
    expect(f).toHaveProperty("divisioMinima");
    expect(f).toHaveProperty("divisioMinor");
    expect(f).toHaveProperty("divisioMaior");
    expect(f).toHaveProperty("divisioFinalis");
    expect(f).not.toHaveProperty("divisioMinor".replace("M", "X")); // sanidade
    // ordem crescente de alargamento: minima < minor < maior < finalis
    expect(f.divisioMinima).toBeLessThan(f.divisioMinor);
    expect(f.divisioMinor).toBeLessThan(f.divisioMaior);
    expect(f.divisioMaior).toBeLessThan(f.divisioFinalis);
  });
  it("pauseBeats contém os 4 níveis canônicos (minima/minor/maior/finalis)", () => {
    const p = DEFAULT_PROFILE.pauseBeats;
    expect(p).toHaveProperty("minima");
    expect(p).toHaveProperty("minor");
    expect(p).toHaveProperty("maior");
    expect(p).toHaveProperty("finalis");
    // ordem crescente de pausa
    expect(p.minima).toBeLessThan(p.minor);
    expect(p.minor).toBeLessThan(p.maior);
    expect(p.maior).toBeLessThan(p.finalis);
  });
});
