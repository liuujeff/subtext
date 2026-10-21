"""Propose candidate pairs for human review.

    python scripts/generate_pairs.py [-n 200] [--out scripts/pairs/candidates.csv]

Picks concrete nouns from the most common pool words, keeps pairs that are
unrelated (low cosine) but still have a strong best answer, and writes a CSV
with an empty approve column. Review it, mark approve=y (and pool=random for
random mode), then run build_puzzles.py.
"""

import argparse
import csv
import os

import numpy as np

import config
from common import load_vocab, score_pair

os.environ.setdefault("NLTK_DATA", str(config.DATA / "nltk_data"))
from nltk.corpus import wordnet as wn  # noqa: E402

CONCRETE = {
    "noun.animal", "noun.artifact", "noun.body", "noun.food", "noun.object",
    "noun.plant", "noun.substance", "noun.person", "noun.phenomenon", "noun.location",
}


def concrete_nouns(vocab, top, max_name_score):
    """Pool words among the `top` most common whose main sense is a concrete noun
    and that the embedding doesn't mostly treat as a name (jay, khan, nova)."""
    out = []
    for i in vocab.pool[:top]:
        w = vocab.words[i]
        if vocab.name_score[i] > max_name_score:
            continue
        senses = wn.synsets(w)
        if senses and senses[0].pos() == "n" and senses[0].lexname() in CONCRETE \
                and senses[0].name().split(".")[0] == w:
            out.append(i)
    return np.array(out)


def existing_pairs():
    seen = set()
    for path in config.PAIRS.glob("*.csv"):
        with open(path) as f:
            for row in csv.DictReader(f):
                seen.add(frozenset((row["a"], row["b"])))
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", type=int, default=200, help="candidates to write")
    ap.add_argument("--out", default=str(config.PAIRS / "candidates.csv"))
    ap.add_argument("--top", type=int, default=6000, help="draw nouns from the N most common pool words")
    ap.add_argument("--samples", type=int, default=40000, help="random pairs to try")
    # Both depend on the model. Numberbatch puts the least related prototype pairs
    # (cactus + violin, sword + church) just below 0.
    ap.add_argument("--max-cos", type=float, default=0.0, help="max cosine between the clues")
    ap.add_argument("--max-name-score", type=float, default=0.25, help="skip name-like clue words")
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    vocab = load_vocab()
    nouns = concrete_nouns(vocab, args.top, args.max_name_score)
    print(f"{len(nouns)} concrete nouns")
    rng = np.random.default_rng(args.seed)
    seen = existing_pairs()

    # Cheap screen: cosine between clues and an unfiltered best objective.
    P = vocab.vectors[vocab.pool]
    hub = vocab.hub[vocab.pool].astype(np.float64)
    picks = rng.choice(nouns, size=(args.samples, 2))
    picks = picks[picks[:, 0] != picks[:, 1]]
    va, vb = vocab.vectors[picks[:, 0]], vocab.vectors[picks[:, 1]]
    cos = (va * vb).sum(axis=1)
    picks = picks[cos < args.max_cos]

    rough = []
    for ia, ib in picks:
        pair = frozenset((vocab.words[ia], vocab.words[ib]))
        if pair in seen:
            continue
        seen.add(pair)
        obj = np.minimum(P @ vocab.vectors[ia], P @ vocab.vectors[ib]) - config.LAM * hub
        rough.append((float(np.sort(obj)[-12:].mean()), ia, ib))
    rough.sort(reverse=True)

    # Full scoring (with the clue-closeness filter) for the most promising.
    rows = []
    for _, ia, ib in rough[: args.n * 3]:
        a, b = vocab.words[ia], vocab.words[ib]
        s = score_pair(vocab, a, b)
        rows.append((float(s.ranked_obj[0]), a, b, " ".join(s.ranked[:5])))
    rows.sort(reverse=True)

    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["a", "b", "top5", "best_objective", "approve", "pool"])
        for best, a, b, top5 in rows[: args.n]:
            w.writerow([a, b, top5, f"{best:.3f}", "", ""])
    print(f"wrote {min(args.n, len(rows))} candidates to {args.out}")


if __name__ == "__main__":
    main()
