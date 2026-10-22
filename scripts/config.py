"""Settings shared by the offline pipeline.

The scoring constants must match src/lib/game/rules.ts; tests/unit/rules.test.ts
checks them against tests/fixtures/scoring.json (written by make_fixtures.py).
"""

import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"          # downloads and build outputs (gitignored)
PAIRS = ROOT / "pairs"        # reviewed pair lists + schedule.csv (committed)
SCHEDULE = PAIRS / "schedule.csv"
VOCAB = DATA / "vocab.npz"
INFLECTIONS = DATA / "inflections.json"
PUZZLES = DATA / "puzzles.npz"

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

# Embeddings: a key of build_vocab.MODEL_URLS.
MODEL = "numberbatch-en-19.08"  # ConceptNet Numberbatch, English; picked with compare_models.py
DIM = 300

# Vocabulary. wordfreq's English list stops at Zipf 1.0, so 1.0 keeps every
# real word it knows; the answer pool is limited to the most common ones.
ZIPF_MIN = 1.0
MIN_LEN, MAX_LEN = 3, 15
POOL_SIZE = 25_000
HUB_SAMPLE = 3_000
# Name scores are cosines to the first-name centroid, so both depend on the model.
NAME_SCORE_MAX = 0.15       # non-WordNet words above this are names (wigan, barlow; hey stays)
POOL_NAME_SCORE_MAX = 0.47  # first names above this stay guessable but leave the pool (ben, jimmy; lily stays)
SEED = 0

# Scoring
LAM = 1.0
# Points from rank: straight lines in ln(rank) between these (rank, points) knots, 0 at the
# last. Fitted so a simulated population's best-of-three scores come out close to a bell
# (mean ~50) instead of a flat spread: the top is steep (rank 2 = 92), the middle is a long
# shallow slope where most players land, and the bottom falls away.
# Since then every knot past rank 10 has had its rank doubled: the fit felt too harsh there.
RANK_KNOTS = [
    (1, 100),
    (2, 92),
    (3, 86),
    (5, 80),
    (10, 72),
    (40, 67),
    (100, 61),
    (200, 58),
    (600, 53),
    (2_000, 46),
    (6_000, 36),
    (20_000, 18),
    (25_000, 0),
]
RANK_CAP = RANK_KNOTS[-1][0]  # the whole pool: only the very worst pool words score 0
EPS = 1e-6           # same tolerance as score_guess()
GUESSES = 3
TOP_ANSWERS = 10
WEAK_BEST = 0.18     # build_puzzles warns below this best objective (depends on the model)

# Schedule
DAILY_START = date(2026, 10, 21)  # Day 1
ROUNDS_PER_DAY = 5
TIMEZONE = "America/New_York"
