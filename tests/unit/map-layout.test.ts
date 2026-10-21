import { describe, expect, it } from "vitest";

import {
  AX,
  bearing,
  BX,
  CX,
  CY,
  HEIGHT,
  labelBox,
  labelWidth,
  overlap,
  placeLabels,
  position,
  TARGET_BOX,
  targetLabelBox,
  TUBES_BOX,
  WIDTH,
} from "@/components/map-layout";

type G = { word: string; points: number; lean: number };

function layout(guesses: G[], target: string | null = null) {
  const spots = guesses.map((g) => ({ ...position(g), width: labelWidth(g.word, g.points) }));
  const blocked = [TUBES_BOX, TARGET_BOX, ...(target ? [targetLabelBox(target)] : [])];
  const labels = placeLabels(spots, blocked);
  const boxes = labels.map((l, i) => labelBox(l, spots[i].width));
  return { spots, labels, boxes, blocked };
}

function expectClear({ spots, boxes, blocked }: ReturnType<typeof layout>) {
  boxes.forEach((box, i) => {
    expect(box.x0).toBeGreaterThanOrEqual(2);
    expect(box.x1).toBeLessThanOrEqual(WIDTH - 2);
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(HEIGHT - 2);
    for (const b of blocked) expect(overlap(box, b)).toBe(0);
    boxes.slice(i + 1).forEach((other) => expect(overlap(box, other)).toBe(0));
    spots.forEach((s) => expect(overlap(box, { x0: s.x - 8, y0: s.y - 8, x1: s.x + 8, y1: s.y + 8 })).toBe(0));
  });
}

describe("sonar positions", () => {
  it("put the best word at the centre, zero points on the rim, and lean as bearing", () => {
    expect(position({ points: 100, lean: 0.3 })).toEqual({ x: CX, y: CY });
    const up = position({ points: 0, lean: 0 });
    expect(up.x).toBeCloseTo(CX);
    expect(up.y).toBeCloseTo(CY - (BX - CX));
    // Pulled all the way toward a clue with no points: on that clue's contact.
    const towardA = position({ points: 0, lean: -0.5 });
    expect(towardA.x).toBeCloseTo(AX);
    expect(towardA.y).toBeCloseTo(CY);
    const towardB = position({ points: 50, lean: 0.06 });
    expect(towardB.x).toBeGreaterThan(CX);
    expect(towardB.y).toBeLessThan(CY);
  });

  it("stretch lean × 2.2 into a bearing from -1 (A) to 1 (B)", () => {
    expect(bearing(0)).toBe(0);
    expect(bearing(0.1)).toBeCloseTo(0.22);
    expect(bearing(-0.3)).toBeCloseTo(-0.66);
    expect(bearing(-0.5)).toBe(-1);
    expect(bearing(0.7)).toBe(1);
  });
});

describe("map labels", () => {
  it("sit beside their dots when there's room, right on the left half and left on the right", () => {
    const { labels } = layout([
      { word: "harbor", points: 72, lean: 0.02 },
      { word: "desert", points: 31, lean: -0.3 },
      { word: "sail", points: 20, lean: 0.6 },
    ]);
    expect(labels.map((l) => [l.anchor, l.leader])).toEqual([
      ["start", false],
      ["start", false],
      ["end", false],
    ]);
  });

  it("don't overlap each other, the dots, the torpedoes or the target, even for near-identical guesses", () => {
    const cases: G[][] = [
      [
        { word: "caravan", points: 64, lean: 0.01 },
        { word: "convoy", points: 63, lean: 0.0 },
        { word: "transportation", points: 62, lean: 0.02 },
      ],
      [
        { word: "vessel", points: 95, lean: 0.0 },
        { word: "boat", points: 94, lean: -0.01 },
        { word: "cargo", points: 96, lean: 0.01 },
      ],
      [
        { word: "nothing", points: 0, lean: -0.5 },
        { word: "zero", points: 0, lean: -0.5 },
        { word: "none", points: 1, lean: -0.49 },
      ],
      [
        { word: "stuff", points: 0, lean: 0.5 },
        { word: "thing", points: 0, lean: 0.49 },
      ],
    ];
    for (const guesses of cases) expectClear(layout(guesses, "freighter"));
  });

  it("keep earlier labels in place when a later guess lands nearby", () => {
    const first = { word: "caravan", points: 64, lean: 0.01 };
    const before = layout([first]).labels[0];
    const after = layout([first, { word: "convoy", points: 63, lean: 0.0 }]).labels[0];
    expect(after).toEqual(before);
  });
});
