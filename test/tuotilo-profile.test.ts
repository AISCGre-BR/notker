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
});
