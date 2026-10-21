import { useId, type CSSProperties } from "react";

import { bestPoints, GUESSES_PER_ROUND, leanText, ROUND_SECONDS } from "@/lib/game/rules";
import type { Guess } from "@/lib/game/types";

import {
  AX,
  BX,
  CLOCK_BOX,
  CX,
  CY,
  HEIGHT,
  labelWidth,
  placeLabels,
  type Point,
  polar,
  position,
  R,
  radius,
  TARGET_BOX,
  TUBES_BOX,
  WIDTH,
} from "./map-layout";

// A light outline in the panel colour keeps labels readable over lines and rings.
export const HALO = { stroke: "var(--sheet)", strokeWidth: 4, strokeLinejoin: "round", paintOrder: "stroke" } as const;

function Glow({ id }: { id: string }) {
  return (
    <filter id={id} x="-150%" y="-150%" width="400%" height="400%">
      <feGaussianBlur stdDeviation={2.2} result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** A slice of the scope between two bearings (degrees clockwise from up). */
function wedge(from: number, to: number) {
  const p = polar(R, from);
  const q = polar(R, to);
  return `M${CX} ${CY} L${p.x} ${p.y} A${R} ${R} 0 0 1 ${q.x} ${q.y} Z`;
}

// Range rings at the share symbols' thresholds (🎯 80+, 💥 55+, 🌊 35+).
const RINGS = [80, 55, 35];

/** Rim with bearing ticks, range rings, spokes every 30°. */
export function Scope({ fill }: { fill: string }) {
  return (
    <g>
      <circle cx={CX} cy={CY} r={R} fill={`url(#${fill})`} />
      {RINGS.map((p) => (
        <circle key={p} cx={CX} cy={CY} r={radius(p)} className="ring" />
      ))}
      {Array.from({ length: 6 }, (_, k) => {
        const p = polar(R, k * 30);
        const q = polar(R, k * 30 + 180);
        return <line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="ring" />;
      })}
      {Array.from({ length: 36 }, (_, k) => {
        const p = polar(R, k * 10);
        const q = polar(R + (k % 3 ? 3.5 : 7), k * 10);
        return <line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="tick" />;
      })}
      <circle cx={CX} cy={CY} r={R} className="rim" />
      <circle cx={CX} cy={CY} r={R + 7} className="rim" />
    </g>
  );
}

/** The rotating beam, with a fading trail behind it. */
function Sweep() {
  return (
    <g className="sweep" style={{ transformOrigin: `${CX}px ${CY}px` }}>
      {Array.from({ length: 10 }, (_, i) => (
        <path key={i} d={wedge(-(i + 1) * 3 - 0.4, -i * 3)} fill="var(--glow)" opacity={0.2 * (1 - i / 10) ** 2} />
      ))}
      <line x1={CX} y1={CY} x2={CX} y2={CY - R} stroke="var(--glow)" strokeWidth={1.5} opacity={0.6} />
    </g>
  );
}

// The rack: one tube per guess, drawn at 1.25× from (RACK_X, RACK_Y), with
// tubes 14 apart and their mouths 35 to the right.
const RACK_X = TUBES_BOX.x0 + 7;
const RACK_Y = TUBES_BOX.y0 + 10;
const RACK_SCALE = 1.25;
const tubeMouth = (k: number): Point => ({ x: RACK_X + 35 * RACK_SCALE, y: RACK_Y + k * 14 * RACK_SCALE });

/**
 * The torpedoes left, in tubes. Firing takes the top one out and the rest move
 * up, so there are no empty tubes. The top one blinks while `arming`.
 */
function Torpedoes({ fired, arming }: { fired: number; arming: boolean }) {
  return (
    <g transform={`translate(${RACK_X} ${RACK_Y}) scale(${RACK_SCALE})`}>
      {Array.from({ length: Math.max(0, GUESSES_PER_ROUND - fired) }, (_, k) => (
        <g key={fired + k} transform={`translate(0 ${k * 14})`}>
          <rect x={-3} y={-6} width={38} height={12} rx={6} className="tube" />
          <g className={arming && k === 0 ? "torpedo armed" : "torpedo"}>
            <rect x={4} y={-3} width={26} height={6} rx={3} />
            <path d="M7.5 -2.5 L1.5 -5.5 L3.5 -2.5 Z M7.5 2.5 L1.5 5.5 L3.5 2.5 Z" />
            <rect x={0.4} y={-2.6} width={1.6} height={5.2} rx={0.8} />
            <rect x={23.5} y={-3} width={1.2} height={6} className="band" />
          </g>
        </g>
      ))}
    </g>
  );
}

/** A torpedo's run from its tube to where its guess lands, with a fading wake. */
function Run({ from, to, glow }: { from: Point; to: Point; glow: string }) {
  const offset = { "--dx": `${from.x - to.x}px`, "--dy": `${from.y - to.y}px` } as CSSProperties;
  return (
    <g className="run">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} pathLength={1} className="wake" />
      <circle cx={to.x} cy={to.y} r={2.5} className="head" style={offset} filter={`url(#${glow})`} />
    </g>
  );
}

/**
 * The crosshair on the target, which is never named. When a guess hits it
 * (`locked`), it flashes and rings ripple out from it.
 */
function Target({ locked }: { locked: boolean }) {
  return (
    <>
      {locked && (
        <g className="ripples">
          {[0, 1, 2].map((k) => (
            <circle key={k} cx={CX} cy={CY} r={R} />
          ))}
        </g>
      )}
      <g className={locked ? "crosshair locked" : "crosshair"} stroke="var(--target)" strokeWidth={1.5}>
        <circle cx={CX} cy={CY} r={7} fill="none" />
        {[0, 90, 180, 270].map((a) => {
          const p = polar(10, a);
          const q = polar(15, a);
          return <line key={a} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
        })}
      </g>
    </>
  );
}

/** The round's clock, top right: full before the start, red for the last 10 seconds. */
function Clock({ seconds }: { seconds: number }) {
  const { x0, y0, x1 } = CLOCK_BOX;
  const track = x1 - x0 - 9;
  return (
    <g className={seconds <= 10 ? "clock low" : "clock"}>
      <text x={x1 - 3} y={y0 + 17} textAnchor="end" fontSize={17} fontWeight={800}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </text>
      <rect x={x0 + 6} y={y0 + 23} width={track} height={3} rx={1.5} className="clock-track" />
      <rect x={x0 + 6} y={y0 + 23} width={(track * seconds) / ROUND_SECONDS} height={3} rx={1.5} className="clock-fill" />
    </g>
  );
}

function describe(guesses: Guess[], a: string, b: string, left: number) {
  if (!a) return "Sonar. The pair appears when you press Start.";
  const parts = guesses.map((g) => `${g.word}, ${g.points} points, ${leanText(g.lean, a, b).toLowerCase()}.`);
  const torpedoes = `${left} of ${GUESSES_PER_ROUND} torpedoes left.`;
  return [`Sonar of guesses between ${a} and ${b}.`, ...parts, torpedoes].join(" ");
}

/**
 * The sonar for one round: each guess is a blip with its word and points, the
 * torpedoes in the corner are the guesses left. The best word at the crosshair
 * is never named. `firing` is the guess just scored: its
 * torpedo runs out to it and it lands at --land, LANDING seconds later (set
 * by the page; a rank-1 guess locks onto the target). `arming` is while the
 * server scores a guess.
 * `secondsLeft` is the round's clock, top right; null hides it.
 */
export function GuessMap(props: {
  guesses: Guess[];
  a: string;
  b: string;
  firing?: string | null;
  arming?: boolean;
  secondsLeft?: number | null;
}) {
  const { guesses, firing = null } = props;
  const id = useId();
  const last = guesses.length - 1;
  const left = GUESSES_PER_ROUND - guesses.length;
  // The best guess is lit; the others dim once there are two or more.
  const best = bestPoints(guesses);
  const spots = guesses.map((g) => ({ ...position(g), width: labelWidth(g.word, g.points) }));
  const labels = placeLabels(spots, [TUBES_BOX, CLOCK_BOX, TARGET_BOX]);
  const shot = guesses.findIndex((g) => g.word === firing);
  const locked = shot !== -1 && guesses[shot].rank === 1;
  const incoming = (i: number, name: string) => (i === shot ? `${name} incoming` : name);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={describe(guesses, props.a, props.b, left)}
    >
      <defs>
        <Glow id={`${id}glow`} />
        <radialGradient id={`${id}fill`}>
          <stop offset="0" stopColor="var(--glow)" stopOpacity={0.09} />
          <stop offset="1" stopColor="var(--glow)" stopOpacity={0.015} />
        </radialGradient>
      </defs>
      <Scope fill={`${id}fill`} />
      <Sweep />
      {/* Nothing lands below the line between the contacts: dim it. */}
      <rect x={0} y={CY} width={WIDTH} height={HEIGHT - CY} className="deadzone" />
      <line x1={AX} y1={CY} x2={BX} y2={CY} className="baseline" />
      {RINGS.map((p) => (
        <text key={p} x={CX + radius(p) + 2} y={CY + 11} fontSize={8} className="range">
          {p}
        </text>
      ))}
      {spots.map((p, i) => {
        const lines = { strokeWidth: i === last ? 1.4 : 1, strokeDasharray: "2 4", opacity: i === last ? 0.85 : 0.3 };
        return (
          <g key={guesses[i].word} className={incoming(i, "bearings")}>
            <line x1={AX} y1={CY} x2={p.x} y2={p.y} stroke="var(--a)" {...lines} />
            <line x1={BX} y1={CY} x2={p.x} y2={p.y} stroke="var(--b)" {...lines} />
          </g>
        );
      })}
      <Target locked={locked} />
      {/* The contacts; on a lock they jolt toward the target. */}
      {([[AX, "var(--a)", "contact"], [BX, "var(--b)", "contact contact-b"]] as const).map(([x, color, name]) => (
        <g key={x} className={locked ? `${name} pulled` : name}>
          <circle cx={x} cy={CY} r={11} fill="var(--sheet)" stroke={color} strokeWidth={1.2} />
          <path d={`M${x} ${CY - 6} L${x + 6} ${CY} L${x} ${CY + 6} L${x - 6} ${CY} Z`} fill={color} />
        </g>
      ))}
      <Torpedoes fired={guesses.length} arming={!!props.arming} />
      {props.secondsLeft != null && <Clock seconds={props.secondsLeft} />}
      {shot !== -1 && (
        <Run key={guesses[shot].word} from={tubeMouth(0)} to={spots[shot]} glow={`${id}glow`} />
      )}
      {spots.map((p, i) => (
        <g key={guesses[i].word} className={incoming(i, "blip")}>
          <circle className="ping" cx={p.x} cy={p.y} r={5} />
          <circle
            className="spot"
            cx={p.x}
            cy={p.y}
            r={i === last ? 5 : 3.5}
            fill="var(--glow)"
            filter={`url(#${id}glow)`}
          />
        </g>
      ))}
      {labels.map((l, i) => {
        const g = guesses[i];
        const p = spots[i];
        const lit = guesses.length < 2 || g.points === best;
        const side = l.anchor === "start" ? 1 : -1;
        return (
          <g key={g.word} className={incoming(i, "tag")}>
            {l.leader && (
              <line
                x1={p.x + side * 6}
                y1={p.y}
                x2={l.x - side * 2}
                y2={l.y - 4}
                stroke="var(--soft)"
                strokeWidth={1}
              />
            )}
            <text x={l.x} y={l.y} textAnchor={l.anchor} fontSize={12} fill={lit ? "var(--ink)" : "var(--soft)"} {...HALO}>
              <tspan fontWeight={i === last ? 700 : 400}>{g.word}</tspan>
              <tspan dx={6} className="pts" fill={lit ? "var(--glow)" : undefined}>
                {g.points}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A word on a stalk, squeezed to fit if it's long; `strong` for the player's guess. */
function StalkLabel(props: { x: number; y: number; width: number; strong?: boolean; children: string }) {
  const { x, y, width, strong = false, children } = props;
  const squeeze = children.length * 6.3 > width;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={10.5}
      fill={strong ? "var(--ink)" : "var(--soft)"}
      {...(strong ? { fontWeight: 700, ...HALO } : {})}
      {...(squeeze ? { textLength: width, lengthAdjust: "spacingAndGlyphs" } : {})}
    >
      {children}
    </text>
  );
}

const S_TOP = 40; // room above a full stalk for its guess and score
const S_BASE = 222;

/**
 * End-of-day readout: one return per pair on a scope grid, as high as its
 * score, with the player's best guess and its score on top and the pair's
 * words underneath. `words[i]` is null if the clock ran out before a guess.
 */
export function SummaryMap(props: { pairs: { a: string; b: string }[]; scores: number[]; words: (string | null)[] }) {
  const { pairs, scores, words } = props;
  const id = useId();
  const n = scores.length;
  const step = n > 1 ? Math.min(90, 280 / (n - 1)) : 0;
  const label = pairs.map((p, i) => `${p.a} and ${p.b}: ${words[i] ?? "no guess"}, ${scores[i]}`).join("; ");
  const height = S_BASE + 36;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      style={{ aspectRatio: `${WIDTH} / ${height}` }}
      role="img"
      aria-label={`Your scores today. ${label}`}
    >
      <defs>
        <Glow id={`${id}glow`} />
      </defs>
      {[0, 25, 50, 75, 100].map((p) => {
        const y = S_BASE - (p / 100) * (S_BASE - S_TOP);
        return <line key={p} x1={12} y1={y} x2={WIDTH - 12} y2={y} className={p ? "ring" : "baseline"} />;
      })}
      {Array.from({ length: 9 }, (_, k) => {
        const x = 12 + ((k + 1) * (WIDTH - 24)) / 10;
        return <line key={k} x1={x} y1={S_TOP} x2={x} y2={S_BASE} className="ring" opacity={0.5} />;
      })}
      {scores.map((s, i) => {
        const x = CX + (i - (n - 1) / 2) * step;
        const y = S_BASE - (s / 100) * (S_BASE - S_TOP);
        // Room for the words: the gap between stalks, and the edge for the outer ones.
        const room = Math.min(step ? step - 6 : 120, 2 * Math.min(x, WIDTH - x) - 4);
        return (
          <g key={i}>
            <line x1={x} y1={S_BASE} x2={x} y2={y} stroke="var(--glow)" strokeWidth={2} opacity={0.45} />
            <circle cx={x} cy={y} r={5} fill="var(--glow)" filter={`url(#${id}glow)`} />
            <StalkLabel x={x} y={y - 26} width={room} strong={words[i] !== null}>
              {words[i] ?? "no guess"}
            </StalkLabel>
            <text x={x} y={y - 11} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--ink)" {...HALO}>
              {s}
            </text>
            <StalkLabel x={x} y={S_BASE + 15} width={room}>
              {pairs[i].a}
            </StalkLabel>
            <StalkLabel x={x} y={S_BASE + 28} width={room}>
              {pairs[i].b}
            </StalkLabel>
          </g>
        );
      })}
    </svg>
  );
}
