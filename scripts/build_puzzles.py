"""Schedule approved pairs and compute their scores.

    python scripts/build_puzzles.py

Reads every scripts/pairs/*.csv except schedule.csv. A row is approved when its
approve column is y/yes/x/1; its pool column is "daily" (default) or "random".

schedule.csv is append-only: a pair keeps its slot once scheduled. New daily
pairs fill whole days (ROUNDS_PER_DAY pairs each) after the last scheduled day, never in the
past; leftovers wait for the next run. Random-mode pairs never become dailies,
so playing random mode can't preview a future day.

Writes data/puzzles.npz for upload.py.
"""

import csv
import json
from datetime import date, timedelta

import numpy as np

import config
from common import load_vocab, score_pair, today_ny

APPROVED = {"y", "yes", "x", "1", "true"}
FIELDS = ["kind", "play_date", "round", "a", "b"]


def approved_pairs():
    daily, rand = [], []
    for path in sorted(config.PAIRS.glob("*.csv")):
        if path == config.SCHEDULE:
            continue
        with open(path) as f:
            for row in csv.DictReader(f):
                if (row.get("approve") or "").strip().lower() not in APPROVED:
                    continue
                pair = (row["a"].strip(), row["b"].strip())
                (rand if (row.get("pool") or "").strip() == "random" else daily).append(pair)
    return daily, rand


def load_schedule():
    if not config.SCHEDULE.exists():
        return []
    with open(config.SCHEDULE) as f:
        return list(csv.DictReader(f))


def main():
    vocab = load_vocab()
    daily, rand = approved_pairs()
    schedule = load_schedule()
    scheduled = {frozenset((r["a"], r["b"])) for r in schedule}

    for a, b in daily + rand:
        missing = [w for w in (a, b) if w not in vocab]
        if missing:
            raise SystemExit(f"{a} + {b}: not in the vocabulary: {missing}")

    new_daily = [p for p in dict.fromkeys(daily) if frozenset(p) not in scheduled]
    new_random = [p for p in dict.fromkeys(rand) if frozenset(p) not in scheduled]

    dates = sorted({r["play_date"] for r in schedule if r["kind"] == "daily"})
    day = max(
        config.DAILY_START,
        today_ny(),
        date.fromisoformat(dates[-1]) + timedelta(days=1) if dates else config.DAILY_START,
    )
    whole = len(new_daily) // config.ROUNDS_PER_DAY * config.ROUNDS_PER_DAY
    for k, (a, b) in enumerate(new_daily[:whole]):
        d = day + timedelta(days=k // config.ROUNDS_PER_DAY)
        schedule.append({"kind": "daily", "play_date": d.isoformat(),
                         "round": k % config.ROUNDS_PER_DAY, "a": a, "b": b})
    for a, b in new_random:
        schedule.append({"kind": "random", "play_date": "", "round": "", "a": a, "b": b})

    config.PAIRS.mkdir(exist_ok=True)
    with open(config.SCHEDULE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(schedule)

    meta, scores = [], []
    for r in schedule:
        s = score_pair(vocab, r["a"], r["b"])
        meta.append({
            "kind": r["kind"],
            "play_date": r["play_date"] or None,
            "round": int(r["round"]) if r["round"] != "" else None,
            "a": r["a"],
            "b": r["b"],
            "lam": config.LAM,
            "top_answers": s.top_answers(),
        })
        scores.append(s.sorted_scores)
        if s.ranked_obj[0] < config.WEAK_BEST:
            print(f"warning: {r['a']} + {r['b']} has a weak best answer ({s.ranked_obj[0]:.3f})")

    offsets = np.cumsum([0] + [len(s) for s in scores])
    np.savez(config.PUZZLES, meta=np.array(json.dumps(meta)),
             scores=np.concatenate(scores).astype(np.float32), offsets=offsets)

    days = sorted({m["play_date"] for m in meta if m["kind"] == "daily"})
    left = len(new_daily) - whole
    print(f"scheduled {whole // config.ROUNDS_PER_DAY} new days and {len(new_random)} random pairs")
    print(f"schedule: {len(days)} days ({days[0] if days else '-'} to {days[-1] if days else '-'}), "
          f"{sum(m['kind'] == 'random' for m in meta)} random pairs")
    if left:
        print(f"{left} approved daily pair(s) wait for a full day of {config.ROUNDS_PER_DAY}")
    print(f"wrote {config.SCHEDULE} and {config.PUZZLES}")


if __name__ == "__main__":
    main()
