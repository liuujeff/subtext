"""Scoring helpers shared by the pipeline scripts.

These mirror the server: rules.ts for forbidden()/points_for_rank(), and
score_guess() in the init migration for objectives and ranks.
"""

import json
import math
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

import config


def forbidden(guess: str, clue: str) -> bool:
    """Too close to a clue: same word, same first 4 letters, or a substring (len >= 4)."""
    if guess == clue:
        return True
    if len(guess) >= 4 and len(clue) >= 4 and guess[:4] == clue[:4]:
        return True
    if len(clue) >= 4 and clue in guess:
        return True
    if len(guess) >= 4 and guess in clue:
        return True
    return False


def points_for_rank(rank: int) -> int:
    # floor(x + 0.5) rather than round(): Python rounds halves to even, JS rounds them up.
    x = max(0.0, 1 - math.log(rank) / math.log(config.RANK_CAP))
    return math.floor(100 * x ** config.POINTS_CURVE + 0.5)


def today_ny():
    return datetime.now(ZoneInfo(config.TIMEZONE)).date()


@dataclass
class Vocab:
    words: list
    index: dict
    freq_rank: np.ndarray
    in_pool: np.ndarray
    hub: np.ndarray          # float32, as uploaded
    vectors: np.ndarray      # float32 copy of the float16 vectors, as uploaded
    pool: np.ndarray         # indices of pool words
    name_score: np.ndarray   # cosine to the first-name centroid (high = used as a name)

    def __contains__(self, word):
        return word in self.index


def load_vocab(path=config.VOCAB) -> Vocab:
    z = np.load(path)
    words = [str(w) for w in z["words"]]
    in_pool = z["in_pool"]
    return Vocab(
        words=words,
        index={w: i for i, w in enumerate(words)},
        freq_rank=z["freq_rank"],
        in_pool=in_pool,
        hub=z["hub"].astype(np.float32),
        vectors=z["vectors"].astype(np.float32),
        pool=np.flatnonzero(in_pool),
        name_score=z["name_score"],
    )


def objectives(vocab: Vocab, idx: np.ndarray, a: str, b: str, lam=config.LAM):
    """Objective and lean for the words at idx, computed the way score_guess() does:
    float32 inner products of the float16 vectors, minus a float32 lam * hub."""
    V = vocab.vectors[idx]
    cos_a = (V @ vocab.vectors[vocab.index[a]]).astype(np.float64)
    cos_b = (V @ vocab.vectors[vocab.index[b]]).astype(np.float64)
    penalty = (np.float32(lam) * vocab.hub[idx]).astype(np.float64)
    return np.minimum(cos_a, cos_b) - penalty, cos_b - cos_a


@dataclass
class PairScores:
    a: str
    b: str
    lam: float
    sorted_scores: np.ndarray  # float32, descending: what puzzles.sorted_scores stores
    ranked: list               # eligible pool words, best first
    ranked_obj: np.ndarray     # their objectives (float64)

    def rank(self, objective: float) -> int:
        return 1 + int((self.sorted_scores.astype(np.float64) > objective + config.EPS).sum())

    def top_answers(self, n=config.TOP_ANSWERS):
        return [
            {"word": w, "points": points_for_rank(self.rank(o))}
            for w, o in zip(self.ranked[:n], self.ranked_obj[:n])
        ]


def score_pair(vocab: Vocab, a: str, b: str, lam=config.LAM) -> PairScores:
    eligible = np.array(
        [i for i in vocab.pool if not forbidden(vocab.words[i], a) and not forbidden(vocab.words[i], b)]
    )
    obj, _ = objectives(vocab, eligible, a, b, lam)
    order = np.argsort(-obj, kind="stable")
    return PairScores(
        a=a,
        b=b,
        lam=lam,
        sorted_scores=obj[order].astype(np.float32),
        ranked=[vocab.words[i] for i in eligible[order]],
        ranked_obj=obj[order],
    )


def score_guess(vocab: Vocab, pair: PairScores, word: str):
    """(rank, points, lean) for one guess, as the API would return it."""
    obj, lean = objectives(vocab, np.array([vocab.index[word]]), pair.a, pair.b, pair.lam)
    rank = pair.rank(float(obj[0]))
    return rank, points_for_rank(rank), float(np.float32(lean[0]))


def load_json(path):
    with open(path) as f:
        return json.load(f)
