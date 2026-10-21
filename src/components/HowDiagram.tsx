import { useId } from "react";

import { HALO, Scope } from "./GuessMap";
import { AX, BX, CX, CY, HEIGHT, polar, position, WIDTH } from "./map-layout";

// An example pair and three guesses, drawn on the same scope as the game.
const A = "camel";
const B = "ship";
const GUESSES = [
  { word: "caravan", points: 80, lean: 0.02, side: "right" },
  { word: "sand", points: 55, lean: -0.25, side: "left" },
  { word: "ocean", points: 40, lean: 0.3, side: "right" },
] as const;

/** The "How to play" picture: the sonar scope, labelled, with the day's numbers underneath. */
export function HowDiagram() {
  const id = useId();
  const spots = GUESSES.map((g) => ({ ...g, ...position(g) }));
  const best = spots[0];

  return (
    <figure className="how">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Example sonar for the pair ${A} and ${B}. The crosshair in the middle is the best word. The closer a guess is to the middle, the more points it scores. A guess that swings toward one side leans toward that word.`}
      >
        <defs>
          <radialGradient id={`${id}fill`}>
            <stop offset="0" stopColor="var(--glow)" stopOpacity={0.09} />
            <stop offset="1" stopColor="var(--glow)" stopOpacity={0.015} />
          </radialGradient>
        </defs>
        <Scope fill={`${id}fill`} />
        <line x1={AX} y1={CY} x2={BX} y2={CY} className="baseline" />

        {/* A balanced guess fits both clues. */}
        <line x1={AX} y1={CY} x2={best.x} y2={best.y} stroke="var(--a)" strokeWidth={1.2} strokeDasharray="2 4" />
        <line x1={BX} y1={CY} x2={best.x} y2={best.y} stroke="var(--b)" strokeWidth={1.2} strokeDasharray="2 4" />

        <g stroke="var(--target)" strokeWidth={1.5}>
          <circle cx={CX} cy={CY} r={7} fill="none" />
          {[0, 90, 180, 270].map((a) => {
            const p = polar(10, a);
            const q = polar(15, a);
            return <line key={a} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
          })}
        </g>
        <text x={CX} y={CY + 30} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--target)" {...HALO}>
          best word: 100
        </text>

        {([[AX, "var(--a)", A], [BX, "var(--b)", B]] as const).map(([x, color, word]) => (
          <g key={word}>
            <circle cx={x} cy={CY} r={11} fill="var(--sheet)" stroke={color} strokeWidth={1.2} />
            <path d={`M${x} ${CY - 6} L${x + 6} ${CY} L${x} ${CY + 6} L${x - 6} ${CY} Z`} fill={color} />
            <text x={x} y={CY - 18} textAnchor="middle" fontSize={12} fontWeight={800} fill={color} {...HALO}>
              {word}
            </text>
          </g>
        ))}

        {spots.map((g) => (
          <g key={g.word}>
            <circle cx={g.x} cy={g.y} r={5} fill="var(--glow)" />
            <text
              x={g.side === "right" ? g.x + 10 : g.x - 10}
              y={g.y + 4}
              textAnchor={g.side === "right" ? "start" : "end"}
              fontSize={12}
              fill="var(--ink)"
              {...HALO}
            >
              {g.word} <tspan fontWeight={800} fill="var(--glow)">{g.points}</tspan>
            </text>
          </g>
        ))}

        <text x={CX} y={CY + 56} textAnchor="middle" fontSize={11} fill="var(--soft)" {...HALO}>
          closer to the middle: more points
        </text>
        <text x={CX} y={CY + 72} textAnchor="middle" fontSize={11} fill="var(--soft)" {...HALO}>
          leans toward the clue it fits best
        </text>
      </svg>
      <ul className="facts">
        <li>
          <strong>5</strong> pairs a day
        </li>
        <li>
          <strong>3</strong> guesses each
        </li>
        <li>
          <strong>60</strong> seconds a pair
        </li>
      </ul>
      <figcaption>
        A good guess fits <em>both</em> words. Catch-all words like “thing” score low.
      </figcaption>
    </figure>
  );
}
