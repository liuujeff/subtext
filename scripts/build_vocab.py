"""Build the guessable vocabulary, answer pool, hub penalties and inflection map.

    python scripts/build_vocab.py [--model glove-wiki-gigaword-300] [--out data/vocab.npz]

Downloads the embeddings, wordfreq lists, NLTK corpora and the blocklist into
scripts/data/ on first run. Writes vocab.npz and inflections.json for upload.py.
"""

import argparse
import gzip
import json
import math
import os
import re
import urllib.request
import zipfile

import numpy as np

import config

os.environ.setdefault("NLTK_DATA", str(config.DATA / "nltk_data"))
import nltk  # noqa: E402
import wordfreq  # noqa: E402

GENSIM_DATA = "https://github.com/RaRe-Technologies/gensim-data/releases/download/{0}/{0}.gz"
# Every model compare_models.py knows. Text format with a "count dim" header line,
# except word2vec (binary) and the fastText crawl vectors (text, zipped).
MODEL_URLS = {
    **{m: GENSIM_DATA.format(m) for m in (
        "glove-wiki-gigaword-300", "word2vec-google-news-300", "fasttext-wiki-news-subwords-300",
    )},
    "numberbatch-en-19.08":
        "https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/numberbatch-en-19.08.txt.gz",
    "crawl-300d-2M": "https://dl.fbaipublicfiles.com/fasttext/vectors-english/crawl-300d-2M.vec.zip",
}
BLOCKLIST_URL = (
    "https://raw.githubusercontent.com/LDNOOBW/"
    "List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en"
)
EXTRA_STOPWORDS = {
    "also", "would", "could", "said", "one", "two", "three", "four", "five", "six",
    "seven", "eight", "nine", "ten", "may", "might", "must", "shall",
}


def download(url, path):
    if path.exists():
        return path
    print(f"downloading {url}")
    tmp = path.with_suffix(path.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(path)
    return path


def load_nltk():
    for pkg in ("wordnet", "stopwords", "words", "names"):
        nltk.download(pkg, download_dir=os.environ["NLTK_DATA"], quiet=True)
    from nltk.corpus import names, stopwords, wordnet, words
    first_names = {n.lower() for n in names.words() if n.isalpha()}
    return wordnet, set(stopwords.words("english")) | EXTRA_STOPWORDS, words, first_names


def read_list(path):
    """One entry per line; blank lines and # comments ignored."""
    if not path.exists():
        return set()
    return {l.strip().lower() for l in path.read_text().split("\n") if l.strip() and not l.startswith("#")}


def load_blocklist():
    path = download(BLOCKLIST_URL, config.DATA / "blocklist-en.txt")
    entries = read_list(path) | read_list(config.ROOT / "blocklist.txt")
    return {e for e in entries if e.isalpha()}


def iter_vectors(model):
    """(word, raw vector) for every entry in the model's file, in file order;
    parse_vector() turns a raw vector into floats."""
    url = MODEL_URLS[model]
    path = download(url, config.DATA / url.rsplit("/", 1)[1])
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as f:
            yield from _read_vectors(model, f)
    else:
        with gzip.open(path, "rb") as f:
            yield from _read_vectors(model, f)


def _read_vectors(model, f):
    n, dim = map(int, f.readline().split())
    assert dim == config.DIM, f"{model} has {dim} dims, expected {config.DIM}"
    if model.startswith("word2vec"):  # binary word2vec format
        for _ in range(n):
            word = bytearray()
            while (ch := f.read(1)) != b" ":
                word += ch
            yield word.decode("utf-8", errors="ignore").strip(), f.read(4 * dim)
    else:
        for line in f:
            w, rest = line.split(b" ", 1)
            yield w.decode("utf-8", errors="ignore"), rest


def parse_vector(model, raw):
    if model.startswith("word2vec"):
        return np.frombuffer(raw, dtype="<f4")
    return np.array(raw.split(), dtype=np.float32)


def read_embeddings(model, wanted):
    """Vectors for the words in `wanted` (lowercase exact match only)."""
    found = {}
    for w, raw in iter_vectors(model):
        if w in wanted and w not in found:
            found[w] = parse_vector(model, raw)
    return found


def suffix_bases(w):
    """Candidate base forms for a regular plural, -ed or -ing form."""
    out = []
    if w.endswith("ies"):
        out.append(w[:-3] + "y")
    if w.endswith("es"):
        out.append(w[:-2])
    if w.endswith("s") and not w.endswith("ss"):
        out.append(w[:-1])
    if w.endswith("ed"):
        out += [w[:-2], w[:-1]]
        if len(w) > 4 and w[-3] == w[-4]:
            out.append(w[:-3])
    if w.endswith("ing"):
        out += [w[:-3], w[:-3] + "e"]
        if len(w) > 5 and w[-4] == w[-5]:
            out.append(w[:-4])
    return out


def contractions(words, stop):
    """Contractions spelled without the apostrophe (dont, thats, theyre). Web
    text is full of them, so web-trained models have vectors for them."""
    out = set()
    for w in words:
        head, _, tail = w.partition("'")
        if tail in ("t", "re", "ve", "ll", "m", "d") or (tail == "s" and head in stop):
            out.add(head + tail)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=config.MODEL)
    ap.add_argument("--out", default=str(config.VOCAB))
    ap.add_argument("--inflections-out", default=str(config.INFLECTIONS))
    args = ap.parse_args()
    config.DATA.mkdir(exist_ok=True)

    wn, stop, nltk_words, first_names = load_nltk()
    blocked = load_blocklist()
    lemmas = {l for l in wn.all_lemma_names() if l.isalpha()}
    plain_words = {w for w in nltk_words.words() if w.islower()}
    word_re = re.compile(rf"[a-z]{{{config.MIN_LEN},{config.MAX_LEN}}}")

    def is_blocked(w):
        if w in blocked:
            return True
        bases = suffix_bases(w) + [wn.morphy(w) or w]
        return any(b in blocked for b in bases)

    def is_name(w):
        # In WordNet only with a capital letter (Paris, Canada, Medea). The plain
        # word list doesn't count here: it has lowercase entries for many names.
        if w not in lemmas:
            return False
        return not any(l.name() == w for s in wn.synsets(w) for l in s.lemmas())

    freqs = wordfreq.get_frequency_dict("en", wordlist="best")
    zipf = {}
    for w, f in freqs.items():
        z = math.log10(f * 1e9)
        if z >= config.ZIPF_MIN and word_re.fullmatch(w) and w not in stop and not is_blocked(w):
            zipf[w] = z
    contracted = contractions(freqs, stop)
    candidates = {
        w for w in zipf
        if (w in lemmas or (w in plain_words and w not in contracted)) and not is_name(w)
    }
    print(f"{len(candidates)} candidates at Zipf >= {config.ZIPF_MIN}")

    # Inflected forms whose base is a candidate are dropped (or were never in
    # the word lists) and map to the base, unless WordNet lists the form as a
    # word in its own right (news, glasses, building, tired).
    base_of = {}
    for w in zipf:
        if w in lemmas:
            continue
        options = [wn.morphy(w, pos) for pos in (wn.NOUN, wn.VERB, wn.ADJ)] + suffix_bases(w)
        base = next((b for b in options if b and b != w and b in candidates), None)
        if base:
            base_of[w] = base
    kept = candidates - set(base_of)
    dropped = len(candidates & set(base_of))

    # Names that aren't vocabulary words give a "name direction" in the
    # embedding, which catches names the word lists let through (joe, tony).
    name_only = first_names - kept
    vectors = read_embeddings(args.model, kept | name_only)
    missing = kept - set(vectors)
    kept -= missing
    print(f"{dropped} inflections dropped, {len(missing)} words missing from {args.model}")

    unit = {w: v / np.linalg.norm(v) for w, v in vectors.items()}
    centroid = np.mean([unit[w] for w in name_only if w in unit], axis=0)
    centroid /= np.linalg.norm(centroid)
    name_score = {w: float(unit[w] @ centroid) for w in kept}
    # Outside WordNet, a first name or a name-like vector means a name.
    names = {w for w in kept if w not in lemmas
             and (w in first_names or name_score[w] > config.NAME_SCORE_MAX)}
    kept -= names
    print(f"{len(names)} more names dropped, e.g. {sorted(names, key=lambda w: -zipf[w])[:12]}")

    words = sorted(kept, key=lambda w: (-zipf[w], w))
    index = {w: i for i, w in enumerate(words)}

    V = np.stack([vectors[w] for w in words]).astype(np.float32)
    V /= np.linalg.norm(V, axis=1, keepdims=True)
    V16 = V.astype(np.float16)
    V32 = V16.astype(np.float32)  # hub and all scores use the rounded vectors

    # The answer pool: the most common words, minus ones that make poor answers.
    roman = re.compile(r"m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})")
    exclude = read_list(config.ROOT / "pool_exclude.txt")

    def pool_ok(w):
        # WordNet words only (no function words, slang or leftover names), not
        # mainly used as a first name (ben, jimmy; rose and lily stay).
        if w not in lemmas or w in exclude or not re.search("[aeiouy]", w):
            return False
        if w in first_names and name_score[w] > config.POOL_NAME_SCORE_MAX:
            return False
        return not roman.fullmatch(w)

    pool_idx = np.array([i for i, w in enumerate(words) if pool_ok(w)][: config.POOL_SIZE])
    pool_size = len(pool_idx)
    in_pool = np.zeros(len(words), dtype=bool)
    in_pool[pool_idx] = True
    rng = np.random.default_rng(config.SEED)
    sample = V32[rng.choice(pool_idx, min(config.HUB_SAMPLE, pool_size), replace=False)]
    hub = (V32 @ sample.T).mean(axis=1).astype(np.float32)

    # Inflection map: follow chains (stoppings -> stopping) to a word we kept.
    inflections = {}
    for form, base in base_of.items():
        seen = {form}
        while base in base_of and base not in seen:
            seen.add(base)
            base = base_of[base]
        if base in index:
            inflections[form] = base

    np.savez(
        args.out,
        words=np.array(words),
        freq_rank=np.arange(1, len(words) + 1, dtype=np.int32),
        in_pool=in_pool,
        hub=hub,
        vectors=V16,
        name_score=np.array([name_score[w] for w in words], dtype=np.float32),
        model=np.array(args.model),
    )
    with open(args.inflections_out, "w") as f:
        json.dump(dict(sorted(inflections.items())), f, indent=0)

    print(f"{len(words)} guessable words, {pool_size} in the answer pool, {len(inflections)} inflections")
    print("most common:", words[:15])
    print("pool edge:", [words[i] for i in pool_idx[-10:]])
    print("rarest:", words[-10:])
    print("most generic (highest hub):", [words[i] for i in pool_idx[np.argsort(-hub[pool_idx])[:12]]])
    print(f"wrote {args.out} and {args.inflections_out}")


if __name__ == "__main__":
    main()
