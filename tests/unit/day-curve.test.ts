import { describe, expect, it } from "vitest";

import { curvePath, curveX, curveY, standing } from "@/components/DayCurve";

describe("day curve", () => {
  it("peaks at the mean and falls away symmetrically", () => {
    const peak = curveY(250, 250, 50);
    expect(curveY(200, 250, 50)).toBeGreaterThan(peak);
    expect(curveY(200, 250, 50)).toBe(curveY(300, 250, 50));
    expect(curveY(0, 250, 50)).toBeGreaterThan(curveY(150, 250, 50));
  });

  it("widens a spread too narrow to draw", () => {
    expect(curveY(280, 250, 0)).toBe(curveY(280, 250, 30));
  });

  it("maps 0-500 across the axis, clamped", () => {
    expect(curveX(0)).toBeLessThan(curveX(250));
    expect(curveX(-10)).toBe(curveX(0));
    expect(curveX(600)).toBe(curveX(500));
    expect(curvePath(250, 50).startsWith(`M${curveX(0)} `)).toBe(true);
  });

  it("states where the player stands among the others", () => {
    expect(standing(0, 1)).toBe("You’re the first to finish today");
    expect(standing(77, 101)).toBe("Better than 77% of today’s players");
    expect(standing(0, 5)).toBe("Better than 0% of today’s players");
    expect(standing(4, 5)).toBe("Better than 100% of today’s players");
  });
});
