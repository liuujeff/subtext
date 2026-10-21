"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import { api, ApiError } from "@/lib/game/api-client";
import { dayNumber } from "@/lib/game/day";
import {
  bestGuess,
  bestPoints,
  GRACE_SECONDS,
  GUESSES_PER_ROUND,
  isRoundOver,
  isTooClose,
  MAX_WORD_LENGTH,
  normalizeGuess,
  ROUND_SECONDS,
  ROUNDS_PER_DAY,
  WORD_PATTERN,
} from "@/lib/game/rules";
import type { Stats } from "@/lib/game/stats";
import type { DistributionResponse, PuzzleRound } from "@/lib/game/types";
import { sfx } from "@/lib/sound";
import { fitToVisualViewport } from "@/lib/viewport";

import { GuessMap, SummaryMap } from "./GuessMap";
import { bearing, LANDING } from "./map-layout";
import { Menu } from "./Menu";
import { DaySummary, RevealPanel, RoundBars } from "./RoundPanels";
import { SoundToggle } from "./SoundToggle";

// `deadline`: when the round's clock runs out, on this page's performance.now()
// clock (immune to the device's time being off); null until the round starts.
type Round = PuzzleRound & { deadline: number | null };

function withDeadline(r: PuzzleRound, now: number): Round {
  return { ...r, deadline: r.msLeft === null ? null : now + r.msLeft };
}

const timeUp = (r: Round, now: number) => r.deadline !== null && now >= r.deadline;

// The latest guess fired: `hit` once the server has scored it, when the map
// runs its torpedo out to the blip.
type Shot = { puzzleId: number; word: string; hit: boolean } | null;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Daily =
  | { status: "loading" }
  | { status: "error" }
  | { status: "none" }
  | { status: "ready"; date: string; rounds: Round[] };

// In random mode, `back` is the daily round to return to.
type View = { mode: "daily"; round: number } | { mode: "random"; round: Round; back: number };

// `suggestion` is a word the player can click to guess instead (spelling fix).
type Message = { text: string; error: boolean; suggestion?: string } | null;

const TOO_CLOSE = "That’s too close to one of the two words. Try something in between.";

function errorText(error: unknown, word: string): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "try_singular":
      return word.endsWith("s") ? `Try the singular: ${error.suggestion}.` : `Try “${error.suggestion}” instead.`;
    case "not_in_list":
      return error.suggestion
        ? `“${word}” isn’t in the word list. Did you mean`
        : `“${word}” isn’t in the word list. Names and rare words are left out.`;
    case "too_close_to_clue":
      return TOO_CLOSE;
    case "already_guessed":
      return `You already tried ${word}.`;
    case "round_over":
      return "This round is already over.";
    case "not_started":
      return "Press Start first.";
    case "rate_limited":
      return "That’s a lot of guesses at once. Wait a moment and try again.";
    case "network":
      return "Couldn’t reach the server. Check your connection and try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

function firstOpenRound(rounds: Round[], now: number): number {
  const i = rounds.findIndex((r) => !isRoundOver(r.guesses) && !timeUp(r, now));
  return i === -1 ? rounds.length : i;
}

async function fetchToday(): Promise<Daily> {
  try {
    const today = await api.today();
    const now = performance.now();
    return { status: "ready", date: today.date, rounds: today.rounds.map((r) => withDeadline(r, now)) };
  } catch (error) {
    return { status: error instanceof ApiError && error.code === "no_puzzle" ? "none" : "error" };
  }
}

export function Game({ children }: { children: ReactNode }) {
  const [daily, setDaily] = useState<Daily>({ status: "loading" });
  const [view, setView] = useState<View>({ mode: "daily", round: 0 });
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [shot, setShot] = useState<Shot>(null);
  // performance.now() at the clock's last tick; the countdown and time-outs read it.
  const [now, setNow] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wantFocus = useRef(false);

  const updateRound = useCallback((puzzleId: number, change: (r: Round) => Round) => {
    setDaily((d) =>
      d.status === "ready"
        ? { ...d, rounds: d.rounds.map((r) => (r.puzzleId === puzzleId ? change(r) : r)) }
        : d,
    );
    setView((v) => (v.mode === "random" && v.round.puzzleId === puzzleId ? { ...v, round: change(v.round) } : v));
  }, []);

  const applyToday = useCallback(
    (result: Daily) => {
      setDaily(result);
      if (result.status !== "ready") return;
      const now = performance.now();
      setNow(now);
      setView({ mode: "daily", round: firstOpenRound(result.rounds, now) });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void fetchToday().then((result) => {
      if (active) applyToday(result);
    });
    return () => {
      active = false;
    };
  }, [applyToday]);

  // Fit the game above the on-screen keyboard while it's open.
  useEffect(() => fitToVisualViewport(), []);

  const reloadToday = () => void fetchToday().then(applyToday);

  // Focus the input (or the Start button) after a render that showed it (new
  // round, round started, guess scored).
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    (inputRef.current ?? startRef.current)?.focus({ preventScroll: true });
  });

  const round: Round | null =
    view.mode === "random" ? view.round : daily.status === "ready" ? (daily.rounds[view.round] ?? null) : null;
  const started = !!round && round.a !== null;
  const timedOut = !!round && !isRoundOver(round.guesses) && timeUp(round, now);
  const over = round ? isRoundOver(round.guesses) || timedOut : false;
  const inSummary = view.mode === "daily" && daily.status === "ready" && view.round >= daily.rounds.length;
  // The day's streak and everyone's totals, once the day's summary is up.
  const [stats, setStats] = useState<Stats | null>(null);
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null);
  useEffect(() => {
    if (!inSummary) return;
    let active = true;
    let retry: number | undefined;
    // The summary is complete without either. A last round that ran out of
    // time only counts on the server after its grace period: if today isn't
    // finished there yet, ask once more after it.
    const load = (again: boolean) => {
      api
        .stats()
        .then((s) => active && setStats(s))
        .catch(() => {});
      api
        .distribution()
        .then((d) => {
          if (!active) return;
          setDistribution(d);
          if (d.total === null && again) retry = window.setTimeout(() => load(false), GRACE_SECONDS * 1000 + 500);
        })
        .catch(() => {});
    };
    load(true);
    return () => {
      active = false;
      window.clearTimeout(retry);
    };
  }, [inSummary]);
  // The clock: full before the start, hidden once guesses end the round.
  const secondsLeft =
    !round || isRoundOver(round.guesses)
      ? null
      : round.deadline === null
        ? ROUND_SECONDS
        : Math.max(0, Math.ceil((round.deadline - now) / 1000));

  // Tick while the round on screen is running.
  const running = started && !over;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  async function startRound(target: Round | null = round) {
    if (!target || target.a !== null || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const { a, b, msLeft } = await api.start(target.puzzleId);
      const t = performance.now();
      setNow(t);
      updateRound(target.puzzleId, (r) => ({ ...r, a, b, deadline: t + msLeft }));
      wantFocus.current = true;
    } catch {
      setMessage({ text: "Couldn’t start the round. Try again.", error: true });
    } finally {
      setPending(false);
    }
  }

  // `autoStart` starts the pair's clock straight away (after "Next pair").
  async function startRandom(exclude?: number, autoStart = false) {
    setPending(true);
    setMessage(null);
    try {
      const t = performance.now();
      const next = withDeadline(await api.random(exclude), t);
      setNow(t);
      setView((v) => ({ mode: "random", round: next, back: v.mode === "daily" ? v.round : v.back }));
      setShot(null);
      setInput("");
      wantFocus.current = true;
      if (autoStart && next.a === null) {
        setPending(false);
        await startRound(next);
      }
    } catch {
      setMessage({ text: "Couldn’t load a random pair. Try again.", error: true });
    } finally {
      setPending(false);
    }
  }

  function backToDaily() {
    if (view.mode !== "random") return;
    setView({ mode: "daily", round: view.back });
    setNow(performance.now()); // the daily round's clock kept running meanwhile
    setShot(null); // so the round's last torpedo doesn't run again
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    setMessage(null);
    if (view.mode === "daily") {
      const upcoming = daily.status === "ready" ? (daily.rounds[view.round + 1] ?? null) : null;
      setView({ mode: "daily", round: view.round + 1 });
      wantFocus.current = true;
      void startRound(upcoming);
    } else {
      void startRandom(view.round.puzzleId, true);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void guessWord(input);
  }

  // A guess that didn't count (no torpedo used): a dud, and the form shakes.
  function misfire() {
    sfx.dud();
    if (reducedMotion()) return;
    const shake = ["none", "translateX(-8px)", "translateX(7px)", "translateX(-5px)", "translateX(3px)", "none"];
    formRef.current?.animate({ transform: shake }, { duration: 360, easing: "ease-out" });
  }

  async function guessWord(raw: string) {
    if (!round || round.a === null || round.b === null || over || pending) return;
    const word = normalizeGuess(raw);
    setMessage(null);
    if (!word) return;

    const fail = (text: string) => {
      setMessage({ text, error: true });
      misfire();
    };
    if (!WORD_PATTERN.test(word)) return fail("Use a single word, letters only.");
    if (isTooClose(word, round.a, round.b)) return fail(TOO_CLOSE);
    if (round.guesses.some((g) => g.word === word)) return fail(`You already tried ${word}.`);

    setPending(true);
    setShot({ puzzleId: round.puzzleId, word, hit: false });
    sfx.arm();
    try {
      const { points, rank, lean, over: done } = await api.guess(round.puzzleId, word);
      updateRound(round.puzzleId, (r) => ({ ...r, guesses: [...r.guesses, { word, points, rank, lean }] }));
      setShot({ puzzleId: round.puzzleId, word, hit: true });
      // The ping sounds when the blip lands, after the torpedo's run.
      const landing = reducedMotion() ? 0 : LANDING;
      sfx.launch();
      if (rank === 1) sfx.lock(landing);
      else sfx.ping(points, bearing(lean), landing);
      setInput("");
      if (!done) wantFocus.current = true;
    } catch (error) {
      setShot(null);
      misfire();
      const suggestion = error instanceof ApiError && error.code === "not_in_list" ? error.suggestion : undefined;
      setMessage({ text: errorText(error, word), error: true, suggestion });
      // Another tab finished this round: pick up the server's state.
      if (error instanceof ApiError && error.code === "round_over" && view.mode === "daily") reloadToday();
    } finally {
      setPending(false);
    }
  }

  // The torpedoes on the map show the guesses left; screen readers hear the
  // latest score and the count instead.
  let status = "";
  let spoken = "";
  if (message) status = message.text;
  else if (daily.status === "loading" && view.mode === "daily") status = "Loading today’s pairs…";
  else if (round && !started) spoken = `Press Start to see the pair. You’ll have ${ROUND_SECONDS} seconds.`;
  else if (round && timedOut) status = "Time’s up.";
  else if (round && !round.guesses.length) spoken = "Three torpedoes. Your closest hit counts.";
  else if (round) {
    const latest = round.guesses[round.guesses.length - 1];
    const left = GUESSES_PER_ROUND - round.guesses.length;
    spoken = `${latest.word}: ${latest.points} points. `;
    spoken += over ? "Round over." : `${left} ${left === 1 ? "torpedo" : "torpedoes"} left.`;
  }

  const dayLabel = daily.status === "ready" ? `Day ${dayNumber(daily.date)}` : "";
  const roundCount = daily.status === "ready" ? daily.rounds.length : ROUNDS_PER_DAY;
  const isLastDaily = view.mode === "daily" && daily.status === "ready" && view.round === daily.rounds.length - 1;

  const thisShot = shot && round && shot.puzzleId === round.puzzleId ? shot : null;
  // The countdown is visual; screen readers hear it at 30 and 10 seconds.
  const timeWarning =
    !running || secondsLeft === null ? "" : secondsLeft <= 10 ? "10 seconds left." : secondsLeft <= 30 ? "30 seconds left." : "";

  // One screen, no scrolling: the map takes whatever height is left. --land is
  // when a fired guess lands, for the map's animations and the reveal after it.
  return (
    <main className="game" style={{ "--land": `${LANDING}s` } as CSSProperties}>
      <header className="top">
        <Menu onRandom={() => void startRandom()} onAccountChange={reloadToday}>{children}</Menu>
        <h1>Subtext</h1>
        {view.mode === "random" ? (
          <button type="button" className="ghost back" onClick={backToDaily}>
            Back to today
          </button>
        ) : (
          <span className="day">{dayLabel}</span>
        )}
        <SoundToggle />
      </header>

      {view.mode === "random" ? <RoundBars count={1} current={0} /> : <RoundBars count={roundCount} current={view.round} />}

      {inSummary && daily.status === "ready" ? (
        <section className="map" aria-label="Your scores today">
          <SummaryMap
            pairs={daily.rounds.map((r) => ({ a: r.a ?? "", b: r.b ?? "" }))}
            scores={daily.rounds.map((r) => bestPoints(r.guesses))}
            words={daily.rounds.map((r) => bestGuess(r.guesses)?.word ?? null)}
          />
        </section>
      ) : (
        <section className="map" aria-label="Sonar of your guesses">
          {/* Before the start the pair is unknown here too: the server hasn't sent it. */}
          <div className="pair">
            <span className="w wa">{round && !started ? "?" : round?.a}</span>
            <span className="and">and</span>
            <span className="w wb">{round && !started ? "?" : round?.b}</span>
          </div>
          <GuessMap
            guesses={round?.guesses ?? []}
            a={round?.a ?? ""}
            b={round?.b ?? ""}
            firing={thisShot?.hit ? thisShot.word : null}
            arming={!!thisShot && !thisShot.hit}
            secondsLeft={secondsLeft}
          />
        </section>
      )}

      {round && !started && (
        <div className="start">
          <button ref={startRef} type="button" onClick={() => void startRound()} disabled={pending}>
            Start
          </button>
        </div>
      )}
      {round && started && !over && (
        <form ref={formRef} onSubmit={submit} autoComplete="off">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type a word"
            aria-label="Your guess"
            maxLength={MAX_WORD_LENGTH}
          />
          <button type="submit" disabled={pending}>
            Fire
          </button>
        </form>
      )}
      {round && over && (
        <RevealPanel
          guesses={round.guesses}
          nextLabel={view.mode === "random" ? "Another random pair" : isLastDaily ? "See today’s total" : "Next pair"}
          onNext={next}
        />
      )}
      {inSummary && daily.status === "ready" && (
        <DaySummary
          date={daily.date}
          rounds={daily.rounds}
          streak={stats?.currentStreak ?? 0}
          distribution={distribution}
          onRandom={() => void startRandom()}
        />
      )}

      <p className={message?.error ? "msg err" : "msg"} role="status" aria-live="polite">
        {status}
        {spoken && <span className="sr-only">{spoken}</span>}
        {timeWarning && <span className="sr-only">{` ${timeWarning}`}</span>}
        {message?.suggestion && (
          <>
            {" "}
            <button
              type="button"
              className="suggest"
              onClick={() => {
                setInput(message.suggestion!);
                void guessWord(message.suggestion!);
              }}
            >
              {message.suggestion}
            </button>
            ?
          </>
        )}
      </p>

      {view.mode === "daily" && daily.status === "error" && (
        <div className="row">
          <p className="msg err">Couldn’t load today’s pairs.</p>
          <button
            type="button"
            onClick={() => {
              setDaily({ status: "loading" });
              reloadToday();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {view.mode === "daily" && daily.status === "none" && (
        <div className="row">
          <p className="msg">No pairs are scheduled for today.</p>
          <button type="button" onClick={() => void startRandom()} disabled={pending}>
            Play a random pair
          </button>
        </div>
      )}

    </main>
  );
}
