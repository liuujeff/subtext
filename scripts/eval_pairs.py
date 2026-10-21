"""Print the top answers for candidate pairs, for hand review.

    python scripts/eval_pairs.py "camel ship; ice fire"
    python scripts/eval_pairs.py --csv scripts/pairs/prototype.csv
    python scripts/eval_pairs.py --vocab scripts/data/vocab-word2vec.npz "camel ship"

To compare models, build a vocab per model (build_vocab.py --model ... --out ...)
and run this with each --vocab.
"""

import argparse
import csv

import numpy as np

import config
from common import load_vocab, score_pair


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pairs", nargs="?", default="", help='"a b; c d; ..."')
    ap.add_argument("--csv", help="read a,b columns from a pairs CSV")
    ap.add_argument("--vocab", default=str(config.VOCAB))
    ap.add_argument("-n", type=int, default=8, help="answers to show")
    args = ap.parse_args()

    pairs = [p.split() for p in args.pairs.split(";") if p.strip()]
    if args.csv:
        with open(args.csv) as f:
            pairs += [(r["a"], r["b"]) for r in csv.DictReader(f)]

    vocab = load_vocab(args.vocab)
    for a, b in pairs:
        if a not in vocab or b not in vocab:
            print(f"{a} + {b}: MISSING {[w for w in (a, b) if w not in vocab]}")
            continue
        s = score_pair(vocab, a, b)
        c = float(vocab.vectors[vocab.index[a]] @ vocab.vectors[vocab.index[b]])
        top = ", ".join(f"{t['word']} {t['points']}" for t in s.top_answers(args.n))
        gap = float(s.ranked_obj[0] - s.ranked_obj[min(9, len(s.ranked_obj) - 1)])
        print(f"{a} + {b}  cos={c:.2f} best={s.ranked_obj[0]:.3f} gap10={gap:.3f}  {top}")


if __name__ == "__main__":
    main()
