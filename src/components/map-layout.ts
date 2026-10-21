// The sonar scope, in viewBox units. The target (the best word) is the centre;
// contacts A and B sit on the rim at either end of the line through it. A
// guess's distance from the centre shrinks with its points, and its bearing is
// its lean: straight up when balanced, swinging toward A (left) or B (right).
export const WIDTH = 340;
export const HEIGHT = 250;
export const CX = 170;
export const CY = 174;
export const R = 150;
export const AX = CX - R;
export const BX = CX + R;

export type Point = { x: number; y: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Label = { x: number; y: number; anchor: "start" | "end"; leader: boolean };

// Rounded so the server's and the browser's sin/cos, which can differ in the
// last digit, render the same markup (a hydration mismatch otherwise).
const round = (v: number) => Math.round(v * 100) / 100;

/** A point on the scope, `angle` in degrees clockwise from straight up. */
export function polar(r: number, angle: number): Point {
  const a = (angle * Math.PI) / 180;
  return { x: round(CX + r * Math.sin(a)), y: round(CY - r * Math.cos(a)) };
}

/** Distance from the centre: eased so good guesses, near the middle, get room. */
export function radius(points: number): number {
  return R * (1 - points / 100) ** 0.75;
}

/** -1 (all the way toward A) to 1 (toward B): the lean, stretched to use the scope. */
export function bearing(lean: number): number {
  return Math.max(-1, Math.min(1, lean * 2.2));
}

export function position(g: { points: number; lean: number }): Point {
  return polar(radius(g.points), bearing(g.lean) * 90);
}

// Seconds from a guess being scored to its blip landing: the torpedo's run
// from the rack. The map's animations and the ping's sound both wait this long.
export const LANDING = 0.55;

// The torpedo rack (guesses left) sits in the top-left corner, outside the
// scope's rim, where guesses never land.
export const TUBES_BOX: Box = { x0: 4, y0: 4, x1: 58, y1: 58 };
// The round's clock mirrors it in the top-right corner.
export const CLOCK_BOX: Box = { x0: WIDTH - 62, y0: 4, x1: WIDTH - 4, y1: 34 };
export const TARGET_BOX: Box = { x0: CX - 15, y0: CY - 15, x1: CX + 15, y1: CY + 15 };
const CONTACT_R = 12;
const DOT_R = 8;

const GAP = 11; // dot centre to label, beside the dot
const LEADER_GAP = 16; // the same for a label moved up or down a line
const LINE = 16; // one label's height
const OFFSETS = [0, -LINE, LINE, -2 * LINE, 2 * LINE, -3 * LINE, 3 * LINE];

// Labels are monospaced (JetBrains Mono, 0.6em advance): 12px words, 13px points.
export function labelWidth(word: string, points: number): number {
  return word.length * 7.2 + 6 + String(points).length * 7.8;
}

/** The target's name, under the centre once the round is over. */
export function targetLabelBox(word: string): Box {
  const half = (word.length * 7.8) / 2;
  return { x0: CX - half, y0: CY + 16, x1: CX + half, y1: CY + 32 };
}

export function labelBox(l: Label, width: number): Box {
  const x0 = l.anchor === "start" ? l.x : l.x - width;
  return { x0, y0: l.y - 12, x1: x0 + width, y1: l.y + 4 };
}

export function overlap(p: Box, q: Box): number {
  const w = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
  const h = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

const offMap = (b: Box) => b.x0 < 2 || b.x1 > WIDTH - 2 || b.y0 < 0 || b.y1 > HEIGHT - 2;

/**
 * One label per dot, placed in guess order so earlier labels stay put as new
 * guesses land. Each tries its usual side (right on the left half), then the
 * other side, then a line up or down with a leader back to its dot. The first
 * spot clear of every dot, contact, earlier label and `blocked` box wins; if
 * none is, the one with the least overlap.
 */
export function placeLabels(spots: (Point & { width: number })[], blocked: Box[]): Label[] {
  const around = (p: Point, r: number) => ({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });
  const taken = [
    ...blocked,
    around({ x: AX, y: CY }, CONTACT_R),
    around({ x: BX, y: CY }, CONTACT_R),
    ...spots.map((s) => around(s, DOT_R)),
  ];
  return spots.map((s) => {
    const usual = s.x < CX + 40 ? "start" : "end";
    const sides = [usual, usual === "start" ? "end" : "start"] as const;
    let best: { label: Label; box: Box; cost: number } | null = null;
    search: for (const dy of OFFSETS) {
      for (const anchor of sides) {
        const gap = dy ? LEADER_GAP : GAP;
        const label: Label = { x: s.x + (anchor === "start" ? gap : -gap), y: s.y + 4 + dy, anchor, leader: dy !== 0 };
        const box = labelBox(label, s.width);
        const cost = (offMap(box) ? 1e6 : 0) + taken.reduce((sum, t) => sum + overlap(box, t), 0);
        if (!best || cost < best.cost) best = { label, box, cost };
        if (cost === 0) break search;
      }
    }
    taken.push(best!.box);
    return best!.label;
  });
}
