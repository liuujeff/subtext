"""Write tests/fixtures/scoring.json so the TypeScript tests can check that the
app and the pipeline agree.

    python scripts/make_fixtures.py

- constants, points_for_rank and forbidden cases: checked by tests/unit.
- guesses on the first two scheduled puzzles, with Python's rank/points/lean:
  checked against score_guess() in the database by tests/api (needs upload.py).
"""

import json
from pathlib import Path

import config
from common import forbidden, load_vocab, points_for_rank, score_guess, score_pair
from build_puzzles import load_schedule

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "scoring.json"

FORBIDDEN_CASES = [
    ("camel", "camel"), ("camels", "camel"), ("came", "camel"), ("cam", "camel"),
    ("shipment", "ship"), ("ships", "ship"), ("hip", "ship"), ("iceberg", "ice"),
    ("icebox", "ice"), ("ice", "iceberg"), ("fire", "firework"), ("work", "firework"),
    ("sunflower", "flower"), ("flow", "flower"), ("lower", "flower"), ("harbour", "harbor"),
    ("harmony", "harbor"), ("desert", "camel"), ("art", "heart"), ("heart", "art"),
]


def main():
    vocab = load_vocab()
    ranks = list(range(1, 21)) + [25, 49, 50, 51, 99, 100, 101, 250, 500, 999, 1000, 1001, 2000, 3000, 5000, 7500, 10000, 12500, 24999, 25000, 25001]
    guesses = []
    for row in load_schedule()[:2]:
        pair = score_pair(vocab, row["a"], row["b"])
        picks = pair.ranked[:3] + [pair.ranked[k] for k in (9, 99, 999, 4999) if k < len(pair.ranked)]
        picks += [w for w in vocab.words[-5:]]  # rare, guessable, not in the pool
        for w in picks:
            rank, points, lean = score_guess(vocab, pair, w)
            guesses.append({"a": pair.a, "b": pair.b, "word": w, "rank": rank, "points": points, "lean": lean})

    data = {
        "constants": {
            "RANK_KNOTS": config.RANK_KNOTS,
            "GUESSES": config.GUESSES,
            "ROUNDS_PER_DAY": config.ROUNDS_PER_DAY,
            "POOL_SIZE": config.POOL_SIZE,
            "DAILY_START": config.DAILY_START.isoformat(),
        },
        "points": [[r, points_for_rank(r)] for r in ranks],
        "forbidden": [[g, c, forbidden(g, c)] for g, c in FORBIDDEN_CASES],
        "guesses": guesses,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {OUT} ({len(guesses)} guess cases)")


if __name__ == "__main__":
    main()
