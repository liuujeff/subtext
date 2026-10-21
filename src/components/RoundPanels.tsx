"use client";

import { useRef, useState } from "react";

import { dayNumber } from "@/lib/game/day";
import { bestPoints, shareSymbol } from "@/lib/game/rules";
import type { DistributionResponse, Guess, PuzzleRound } from "@/lib/game/types";

export function RoundBars({ count, current }: { count: number; current: number }) {
  return (
    <div className="rounds" aria-hidden="true">
      {Array.from({ length: count }, (_, k) => (
        <span key={k} className={k < current ? "done" : k === current ? "now" : undefined} />
      ))}
    </div>
  );
}

export function RevealPanel(props: {
  guesses: Guess[];
  nextLabel: string;
  onNext: () => void;
}) {
  return (
    <div className="reveal">
      <div className="reveal-head">
        <h2>You scored {bestPoints(props.guesses)}</h2>
        <button type="button" onClick={props.onNext}>
          {props.nextLabel}
        </button>
      </div>
    </div>
  );
}

export function DaySummary(props: { date: string; rounds: PuzzleRound[]; streak: number; distribution: DistributionResponse | null; onRandom: () => void }) {
  const scores = props.rounds.map((r) => bestPoints(r.guesses));
  const total = scores.reduce((sum, s) => sum + s, 0);
  const max = props.rounds.length * 100;
  // Rendered only in the browser, once today's rounds have loaded, so location is there.
  const share = [
    `Subtext #${dayNumber(props.date)}`,
    `${total}/${max}`,
    scores.map(shareSymbol).join(" "),
    window.location.origin,
  ].join("\n");
  const [copyLabel, setCopyLabel] = useState("Copy result");
  // The text appears once copied, to show what went to the clipboard (or, if
  // copying failed, to copy by hand). Until then it's in the page but unseen,
  // so the fallback can select it.
  const [shown, setShown] = useState(false);
  const shareRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(share);
      setCopyLabel("Copied");
    } catch {
      shareRef.current?.select();
      setCopyLabel(document.execCommand("copy") ? "Copied" : "Select and copy the text");
    }
    setShown(true);
  }

  return (
    <div className="summary">
      <div>
        <span className="total">{total}</span> <span className="of">of {max}</span>
        {props.streak > 1 && <span className="streak"> · {props.streak}-day streak</span>}
      </div>
      {props.distribution && props.distribution.players > 0 && <Distribution {...props.distribution} />}
      <textarea
        ref={shareRef}
        rows={3}
        readOnly
        value={share}
        aria-label="Result to share"
        className={shown ? undefined : "unseen"}
        aria-hidden={!shown}
        tabIndex={shown ? undefined : -1}
      />
      <div className="row">
        <button type="button" onClick={copy}>
          {copyLabel}
        </button>
        <button type="button" className="ghost" onClick={props.onRandom}>
          Play a random pair
        </button>
      </div>
      <p className="msg" style={{ marginTop: 10 }}>
        A new set of pairs arrives at midnight.
      </p>
    </div>
  );
}

/** Everyone's totals for the day as bars, the player's own bucket lit. */
function Distribution({ buckets, players, total }: Pick<DistributionResponse, "buckets" | "players" | "total">) {
  const tallest = Math.max(...buckets);
  const mine = total === null ? -1 : Math.min(Math.floor(total / 50), buckets.length - 1);
  const width = 500 / buckets.length;
  return (
    <figure className="dist">
      <div
        className="bars"
        role="img"
        aria-label={`Totals today for ${players} ${players === 1 ? "player" : "players"}${total === null ? "" : `; yours is ${total}`}`}
      >
        {buckets.map((n, i) => (
          <span
            key={i}
            className={i === mine ? "mine" : undefined}
            style={{ height: `${n ? Math.max(6, (n / tallest) * 100) : 2}%` }}
            title={`${i * width}–${(i + 1) * width - (i === buckets.length - 1 ? 0 : 1)}: ${n}`}
          />
        ))}
      </div>
      <div className="axis" aria-hidden="true">
        <span>0</span>
        <span>250</span>
        <span>500</span>
      </div>
      <figcaption>
        Everyone today · {players} {players === 1 ? "player" : "players"}
      </figcaption>
    </figure>
  );
}
