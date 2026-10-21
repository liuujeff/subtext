import { useId } from "react";

import type { DistributionResponse } from "@/lib/game/types";

// Everyone's totals for the day as a bell curve (a normal curve with their mean
// and spread), with the player's own total marked. Scores run 0-500.
const WIDTH = 340;
const HEIGHT = 92;
const X0 = 10;
const X1 = 330;
const BASE = 66; // the axis
const TOP = 8; // the curve's peak
const MAX = 500;
const TICKS = [0, 100, 200, 300, 400, 500];
// A spread narrower than this (a handful of players) would draw a spike.
const MIN_SD = 30;

const round = (v: number) => Math.round(v * 100) / 100;
export const curveX = (score: number) => round(X0 + ((X1 - X0) * Math.max(0, Math.min(MAX, score))) / MAX);

/** The curve's height at `score`, as an SVG y. */
export function curveY(score: number, mean: number, sd: number): number {
  const z = (score - mean) / Math.max(sd, MIN_SD);
  return round(BASE - (BASE - TOP) * Math.exp(-0.5 * z * z));
}

export function curvePath(mean: number, sd: number): string {
  const points = Array.from({ length: MAX / 5 + 1 }, (_, i) => `${curveX(i * 5)} ${curveY(i * 5, mean, sd)}`);
  return `M${points.join(" L")}`;
}

/** "Better than 77% of today's players", from how many of the others scored less. */
export function standing(below: number, players: number): string {
  const others = players - 1;
  if (others < 1) return "You’re the first to finish today";
  return `Better than ${Math.round((100 * below) / others)}% of today’s players`;
}

export function DayCurve({ players, mean, sd, total, below }: Omit<DistributionResponse, "date">) {
  const id = useId();
  const line = curvePath(mean, sd);
  const you = total === null ? null : { x: curveX(total), y: curveY(total, mean, sd) };
  // The YOU label stays on the scope and pushes aside the tick labels it would cover.
  const youLabelX = you ? Math.max(16, Math.min(WIDTH - 16, you.x)) : null;
  const caption =
    total !== null && below !== null ? standing(below, players) : `${players} ${players === 1 ? "player" : "players"} today`;

  return (
    <figure className="curve">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          `Today’s totals for ${players} ${players === 1 ? "player" : "players"}, averaging ${Math.round(mean)}.` +
          (total === null ? "" : ` Yours is ${total}.`)
        }
      >
        <defs>
          <linearGradient id={`${id}fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--glow)" stopOpacity={0.3} />
            <stop offset="1" stopColor="var(--glow)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <path d={`${line} L${X1} ${BASE} L${X0} ${BASE} Z`} fill={`url(#${id}fill)`} />
        <path d={line} fill="none" stroke="var(--glow)" strokeWidth={2} strokeLinejoin="round" />
        <line x1={X0} y1={BASE} x2={X1} y2={BASE} className="axis" />
        {TICKS.map((t) => {
          const x = curveX(t);
          const hidden = youLabelX !== null && Math.abs(x - youLabelX) < 24;
          return (
            <g key={t}>
              <line x1={x} y1={BASE} x2={x} y2={BASE + 4} className="axis" />
              {!hidden && (
                <text x={x} y={BASE + 16} textAnchor="middle" className="score">
                  {t}
                </text>
              )}
            </g>
          );
        })}
        {you && youLabelX !== null && (
          <g className="you">
            <line x1={you.x} y1={you.y} x2={you.x} y2={BASE} />
            <circle cx={you.x} cy={you.y} r={4} />
            <text x={youLabelX} y={BASE + 16} textAnchor="middle">
              YOU
            </text>
          </g>
        )}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
