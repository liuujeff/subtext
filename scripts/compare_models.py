"""Compare embedding models on the same answer pool, for choosing config.MODEL.

    python scripts/compare_models.py [--models glove numberbatch] [--csv scripts/pairs/prototype.csv]

Every model is scored with the game's formula on the same words: the answer pool
as build_vocab.py makes it, minus the steps that depend on a model (words it
lacks, name-like vectors), cut to the words every model has. For each model it
prints coverage, Spearman correlation on WordSim-353, how many distinct words
fill the top 3 answers across the pairs (low = generic hub words dominate), and
how far the best answer stands out; then the top answers per pair, side by side.

Downloads about 5 GB of vectors into scripts/data/ on first run, and caches the
vectors it uses there, so later runs take seconds.
"""

import argparse
import csv
import math
import re
from collections import Counter

import numpy as np
import wordfreq

import config
from build_vocab import download, iter_vectors, load_blocklist, load_nltk, parse_vector, read_list
from common import forbidden

# Short names for the table -> build_vocab.MODEL_URLS keys.
MODELS = {
    "glove": "glove-wiki-gigaword-300",
    "word2vec": "word2vec-google-news-300",
    "fasttext-wiki": "fasttext-wiki-news-subwords-300",
    "numberbatch": "numberbatch-en-19.08",
    "fasttext-crawl": "crawl-300d-2M",
}
# The copy gensim ships in gensim/test/test_data.
WORDSIM_URL = (
    "https://raw.githubusercontent.com/piskvorky/gensim/4.4.0/gensim/test/test_data/wordsim353.tsv"
)


def pool_and_dictionary():
    """The answer pool (most common first) and every dictionary word, as build_vocab.py
    picks them before it looks at vectors. Inflections stay in the dictionary here."""
    wn, stop, nltk_words, _ = load_nltk()
    blocked = load_blocklist()
    lemmas = {l for l in wn.all_lemma_names() if l.isalpha()}
    plain_words = {w for w in nltk_words.words() if w.islower()}
    exclude = read_list(config.ROOT / "pool_exclude.txt")
    word_re = re.compile(rf"[a-z]{{{config.MIN_LEN},{config.MAX_LEN}}}")
    roman = re.compile(r"m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})")

    def is_name(w):
        return w in lemmas and not any(l.name() == w for s in wn.synsets(w) for l in s.lemmas())

    zipf = wordfreq.get_frequency_dict("en", wordlist="best")
    dictionary = [
        w for w in sorted(zipf, key=lambda w: (-zipf[w], w))
        if math.log10(zipf[w] * 1e9) >= config.ZIPF_MIN and word_re.fullmatch(w)
        and w not in stop and w not in blocked and (w in lemmas or w in plain_words)
        and not is_name(w)
    ]
    pool = [
        w for w in dictionary
        if w in lemmas and w not in exclude and re.search("[aeiouy]", w) and not roman.fullmatch(w)
    ][: config.POOL_SIZE]
    return pool, dictionary


def read_wordsim():
    path = download(WORDSIM_URL, config.DATA / "wordsim353.tsv")
    rows = [l.split("\t") for l in path.read_text().splitlines() if l and not l.startswith("#")]
    return [(a, b, float(s)) for a, b, s in rows]


def load_model(key, wanted, ws_words):
    """Vectors (unit length) for the wanted words (exact lowercase match, as
    build_vocab.py looks them up) and for the WordSim words (any case, most
    common form first, as gensim's evaluate_word_pairs does)."""
    name = MODELS[key]
    cache = config.DATA / f"compare-{name}.npz"
    want_all = sorted(wanted | ws_words)
    if cache.exists():
        z = np.load(cache)
        if list(z["wanted"]) == want_all:
            return dict(zip((str(w) for w in z["words"]), z["vectors"]))
    print(f"reading {name}")
    found = {}
    for w, raw in iter_vectors(name):
        if "_" in w:  # multi-word terms (word2vec phrases, Numberbatch)
            continue
        keys = [k for k, ok in ((w, w in wanted), ("ws:" + w.lower(), w.lower() in ws_words))
                if ok and k not in found]
        if not keys:
            continue
        v = parse_vector(name, raw)
        for k in keys:
            found[k] = v / np.linalg.norm(v)
    words = sorted(found)
    np.savez(cache, wanted=np.array(want_all), words=np.array(words),
             vectors=np.stack([found[w] for w in words]).astype(np.float32))
    return found


def spearman(x, y):
    def ranks(v):
        v = np.asarray(v)
        r = np.empty(len(v))
        r[np.argsort(v, kind="stable")] = np.arange(len(v))
        for val in np.unique(v):  # ties share their mean rank
            r[v == val] = r[v == val].mean()
        return r
    return float(np.corrcoef(ranks(x), ranks(y))[0, 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", choices=list(MODELS), default=list(MODELS))
    ap.add_argument("--csv", default=str(config.PAIRS / "prototype.csv"))
    ap.add_argument("-n", type=int, default=5, help="answers to show per pair")
    ap.add_argument("--lam", type=float, default=config.LAM, help="hub penalty weight")
    args = ap.parse_args()
    config.DATA.mkdir(exist_ok=True)

    with open(args.csv) as f:
        pairs = [(r["a"], r["b"]) for r in csv.DictReader(f)]
    pool, dictionary = pool_and_dictionary()
    wordsim = read_wordsim()
    ws_words = {w.lower() for a, b, _ in wordsim for w in (a, b)}
    clues = {w for p in pairs for w in p}
    wanted = set(dictionary) | clues

    vecs = {m: load_model(m, wanted, ws_words) for m in args.models}

    missing_clues = {m: sorted(clues - set(v)) for m, v in vecs.items()}
    common = [w for w in pool if all(w in v for v in vecs.values())]
    rng = np.random.default_rng(config.SEED)
    sample = rng.choice(len(common), min(config.HUB_SAMPLE, len(common)), replace=False)
    print(f"\n{len(pool)} pool words, {len(common)} in every model (the shared pool); "
          f"{len(dictionary)} dictionary words; {len(pairs)} pairs; LAM = {args.lam}")

    eligible = {(a, b): np.array([not forbidden(w, a) and not forbidden(w, b) for w in common])
                for a, b in pairs}
    ws_common = [(a, b, s) for a, b, s in wordsim
                 if all("ws:" + a.lower() in v and "ws:" + b.lower() in v for v in vecs.values())]

    stats, tops, repeats = {}, {}, {}
    for m, v in vecs.items():
        V = np.stack([v[w] for w in common])
        hub = (V @ V[sample].T).mean(axis=1)

        def ws(rows):
            rows = [(a, b, s) for a, b, s in rows if "ws:" + a.lower() in v and "ws:" + b.lower() in v]
            cos = [float(v["ws:" + a.lower()] @ v["ws:" + b.lower()]) for a, b, _ in rows]
            return spearman(cos, [s for _, _, s in rows]), len(rows)

        z1, gap, top3, top_rank = [], [], Counter(), []
        tops[m] = {}
        for a, b in pairs:
            if a not in v or b not in v:
                tops[m][a, b] = ["(missing clue)"]
                continue
            ok = eligible[a, b]
            obj = np.minimum(V @ v[a], V @ v[b]) - args.lam * hub
            obj = np.where(ok, obj, -np.inf)
            order = np.argsort(-obj, kind="stable")
            ranked = obj[order]
            elig = obj[ok]
            z1.append((ranked[0] - elig.mean()) / elig.std())
            gap.append((ranked[0] - ranked[9]) / elig.std())
            tops[m][a, b] = [common[i] for i in order[: args.n]]
            top3.update(common[i] for i in order[:3])
            top_rank += list(order[:5] + 1)

        rho_own, n_own = ws(wordsim)
        rho_common, _ = ws(ws_common)
        stats[m] = {
            "pool": sum(w in v for w in pool) / len(pool),
            "dict": sum(w in v for w in dictionary) / len(dictionary),
            "ws_own": rho_own, "ws_n": n_own, "ws_common": rho_common,
            "distinct": len(top3), "top3": 3 * len(z1),
            "z1": float(np.median(z1)), "gap": float(np.median(gap)),
            "common": int(np.median(top_rank)),
        }
        repeats[m] = [f"{w} {c}" for w, c in top3.most_common(6) if c > 1]

    print(f"\n{'model':16}{'pool':>7}{'dict':>7}{'ws353':>7}{'(pairs)':>8}"
          f"{f'ws353*':>8}{'top3 distinct':>15}{'best z':>8}{'#1-#10':>8}{'top5 rank':>11}")
    for m, s in stats.items():
        print(f"{m:16}{s['pool']:7.1%}{s['dict']:7.1%}{s['ws_own']:7.3f}{s['ws_n']:8d}"
              f"{s['ws_common']:8.3f}{s['distinct']:>9d} / {s['top3']:<3d}"
              f"{s['z1']:8.2f}{s['gap']:8.2f}{s['common']:11d}")
    print(f"""
pool / dict  share of the {len(pool)} pool words / {len(dictionary)} dictionary words the model has
ws353        Spearman on the WordSim-353 pairs the model has (pairs); ws353* on the {len(ws_common)} all models have
top3         distinct words among the top 3 answers of every pair
best z       median over pairs of (best objective - mean) / sd of all eligible pool words
#1-#10       median over pairs of (best - 10th best objective) / that sd
top5 rank    median commonness rank (1 = most common pool word) of the top 5 answers""")
    for m in vecs:
        if missing_clues[m]:
            print(f"{m}: missing clues {missing_clues[m]}")
    print("\nmost repeated top-3 answers:")
    for m, r in repeats.items():
        print(f"  {m:16}{', '.join(r) or '-'}")

    print(f"\ntop {args.n} answers per pair")
    width = max(len(w) for t in tops.values() for answers in t.values() for w in answers) + 2
    for a, b in pairs:
        print(f"\n{a} + {b}")
        for m in vecs:
            print(f"  {m:16}" + "".join(f"{w:{width}}" for w in tops[m][a, b]).rstrip())


if __name__ == "__main__":
    main()
