"""Load the vocabulary and puzzles into Postgres.

    python scripts/upload.py vocab     # words + inflections
    python scripts/upload.py puzzles   # daily + random puzzles from data/puzzles.npz
    python scripts/upload.py all

DATABASE_URL defaults to the local Supabase stack. For production, use the
connection string from the Supabase dashboard (Connect > Session pooler).

Re-runnable. `vocab` replaces every word and puzzle (embeddings change every
score), so it refuses once anyone has played unless --force, which also deletes
guesses and started rounds: local development only. `puzzles` upserts each day
by (play_date, round) so ids survive, but never changes a puzzle that has been
played (guessed or started, which shows the pair) or a past day, and removes
unplayed future puzzles that left the schedule.
"""

import argparse
import json
import sys

import numpy as np
import psycopg
from pgvector import HalfVector
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb

import config
from common import today_ny


def connect():
    conn = psycopg.connect(config.DATABASE_URL)
    conn.execute("set search_path = public, extensions")
    register_vector(conn)
    return conn


def upload_vocab(conn, force):
    z = np.load(config.VOCAB)
    with open(config.INFLECTIONS) as f:
        inflections = json.load(f)
    played = conn.execute("select (select count(*) from guesses) + (select count(*) from round_starts)").fetchone()[0]
    if played and not force:
        raise SystemExit(f"{played} guesses and started rounds exist; replacing the vocabulary would "
                         "invalidate them. Use --force (deletes them) only on a dev database.")
    with conn.transaction():
        conn.execute("delete from guesses")
        conn.execute("delete from round_starts")
        conn.execute("delete from puzzles")
        conn.execute("delete from inflections")
        conn.execute("delete from words")
        with conn.cursor().copy(
            "copy words (id, word, freq_rank, in_pool, hub, embedding) from stdin with (format binary)"
        ) as copy:
            copy.set_types(["int4", "text", "int4", "bool", "float4", "halfvec"])
            for i, (w, rank, pool, hub, vec) in enumerate(
                zip(z["words"], z["freq_rank"], z["in_pool"], z["hub"], z["vectors"]), start=1
            ):
                copy.write_row([i, str(w), int(rank), bool(pool), float(hub), HalfVector(vec)])
        with conn.cursor().copy("copy inflections (form, base) from stdin") as copy:
            for form, base in inflections.items():
                copy.write_row([form, base])
    print(f"uploaded {len(z['words'])} words and {len(inflections)} inflections "
          f"(model {z['model']}); puzzles were cleared")


def upload_puzzles(conn):
    z = np.load(config.PUZZLES)
    meta = json.loads(str(z["meta"]))
    scores, offsets = z["scores"], z["offsets"]
    today = today_ny()
    counts = {"inserted": 0, "updated": 0, "kept (played)": 0, "removed": 0}

    def fields(i, m):
        return (m["a"], m["b"], m["lam"], scores[offsets[i]:offsets[i + 1]].tolist(), Jsonb(m["top_answers"]))

    with conn.transaction():
        keep = []
        for i, m in enumerate(meta):
            if m["kind"] == "daily":
                row = conn.execute(
                    """select id, word_a, word_b, (exists (select 1 from guesses g where g.puzzle_id = p.id)
                                 or exists (select 1 from round_starts r where r.puzzle_id = p.id))
                         from puzzles p where kind = 'daily' and play_date = %s and round = %s""",
                    (m["play_date"], m["round"]),
                ).fetchone()
            else:
                row = conn.execute(
                    """select id, word_a, word_b, (exists (select 1 from guesses g where g.puzzle_id = p.id)
                                 or exists (select 1 from round_starts r where r.puzzle_id = p.id))
                         from puzzles p where kind = 'random' and word_a = %s and word_b = %s""",
                    (m["a"], m["b"]),
                ).fetchone()

            if row is None:
                pid = conn.execute(
                    """insert into puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
                       values (%s, %s, %s, %s, %s, %s, %s::real[], %s) returning id""",
                    (m["kind"], m["play_date"], m["round"], *fields(i, m)),
                ).fetchone()[0]
                counts["inserted"] += 1
            else:
                pid, a, b, played = row
                same_pair = (a, b) == (m["a"], m["b"])
                past = m["play_date"] is not None and str(m["play_date"]) < today.isoformat()
                if played or (past and not same_pair):
                    if not same_pair:
                        raise SystemExit(f"{m['play_date']} round {m['round']} is {a} + {b} in the database "
                                         f"and has been played or has passed; the schedule says "
                                         f"{m['a']} + {m['b']}. Fix schedule.csv.")
                    counts["kept (played)"] += 1
                else:
                    conn.execute(
                        """update puzzles set word_a = %s, word_b = %s, lam = %s,
                                  sorted_scores = %s::real[], top_answers = %s where id = %s""",
                        (*fields(i, m), pid),
                    )
                    counts["updated"] += 1
            keep.append(pid)

        removed = conn.execute(
            """delete from puzzles p
                where not (p.id = any(%s))
                  and (p.kind = 'random' or p.play_date >= %s)
                  and not exists (select 1 from guesses g where g.puzzle_id = p.id)
                  and not exists (select 1 from round_starts r where r.puzzle_id = p.id)""",
            (keep, today),
        )
        counts["removed"] = removed.rowcount
        stray = conn.execute(
            "select count(*) from puzzles where not (id = any(%s))", (keep,)
        ).fetchone()[0]

    print(", ".join(f"{v} {k}" for k, v in counts.items()))
    if stray:
        print(f"note: {stray} puzzle(s) in the database aren't in the schedule (past or played)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["vocab", "puzzles", "all"])
    ap.add_argument("--force", action="store_true", help="vocab: delete existing guesses (dev only)")
    args = ap.parse_args()
    host = config.DATABASE_URL.split("@")[-1]
    print(f"database: {host}", file=sys.stderr)
    with connect() as conn:
        if args.what in ("vocab", "all"):
            upload_vocab(conn, args.force)
        if args.what in ("puzzles", "all"):
            upload_puzzles(conn)


if __name__ == "__main__":
    main()
