"""Warn when fewer than --min-days complete days are scheduled from today.

    python scripts/check_schedule.py [--min-days 30]

Exits 1 when the schedule is short, so it can run in CI or a cron reminder.
"""

import argparse
from datetime import timedelta

import psycopg

import config
from common import today_ny


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-days", type=int, default=30)
    args = ap.parse_args()

    today = today_ny()
    with psycopg.connect(config.DATABASE_URL) as conn:
        rows = conn.execute(
            """select play_date, count(*) from puzzles
                where kind = 'daily' and play_date >= %s group by play_date""",
            (today,),
        ).fetchall()
        random_pairs = conn.execute("select count(*) from puzzles where kind = 'random'").fetchone()[0]
    full = {d for d, n in rows if n == config.ROUNDS_PER_DAY}

    days, d = 0, today
    while d in full:
        days += 1
        d += timedelta(days=1)
    last = d - timedelta(days=1)

    print(f"{days} complete days scheduled from {today}" + (f" (through {last})" if days else ""))
    print(f"{random_pairs} random-mode pairs")
    if days < args.min_days:
        print(f"WARNING: fewer than {args.min_days} days scheduled. Review more pairs "
              "(generate_pairs.py), then build_puzzles.py and upload.py puzzles.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
