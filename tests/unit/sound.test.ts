import { describe, expect, it } from "vitest";

import { echoDelay, pingHz } from "@/lib/sound";

describe("sonar pings", () => {
  it("climb a pentatonic scale from C5 at 0 points to G6 at 100", () => {
    expect(pingHz(0)).toBeCloseTo(523.25);
    expect(pingHz(50)).toBeCloseTo(523.25 * 2 ** (9 / 12)); // A5
    expect(pingHz(100)).toBeCloseTo(523.25 * 2 ** (19 / 12)); // G6
    for (let p = 1; p <= 100; p++) expect(pingHz(p)).toBeGreaterThanOrEqual(pingHz(p - 1));
  });

  it("echo back sooner the closer the guess lands", () => {
    expect(echoDelay(100)).toBeCloseTo(0.07);
    expect(echoDelay(0)).toBeCloseTo(0.47);
    expect(echoDelay(80)).toBeLessThan(echoDelay(40));
  });
});
