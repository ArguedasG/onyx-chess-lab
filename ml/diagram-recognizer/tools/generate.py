"""Generates the synthetic square dataset (versioned, deterministic for a seed and a puzzle DB).

Splits:
- train / val: training sets of pieces; empty squares are subsampled (they are 60 % of a board);
- test: same distribution, all 64 squares per board (board-level accuracy);
- heldout: a piece set never seen in training (pirouetti), all 64 squares.

Each split is written as .npz shards: x uint8 [N, 48, 48], y uint8 [N], board int32 [N],
style uint8 [N] (0 print, 1 screen), piece_set uint8 [N], square_px float16 [N].

Usage: python tools/generate.py --db <puzzles.db3> [--out data/v1] [--workers 3]
"""

import argparse
import hashlib
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.model import CLASSES  # noqa: E402
from onyx_diagrams.positions import placement_grid, sample_positions  # noqa: E402
from onyx_diagrams.render import Sprites, render  # noqa: E402
from onyx_diagrams.squares import crop_squares, square_labels  # noqa: E402

DATASET_VERSION = "v8"
TRAIN_SETS = [
    "cburnett",
    "merida",
    "chessnut",
    "fantasy",
    "spatial",
    "pixel",
    "shapes",
    "mpchess",
    "celtic",
    "glyph-freeserif",
    "glyph-dejavu",
    "glyph-noto",
    "maestro",
    "staunty",
    "cardinal",
    "tatiana",
    "fresca",
    "gioco",
    "dubrovny",
    "icpieces",
]
HELDOUT_SETS = ["pirouetti"]
ALL_SETS = TRAIN_SETS + HELDOUT_SETS
CLASS_INDEX = {("." if c == "empty" else c): i for i, c in enumerate(CLASSES)}
SHARD_BOARDS = 500


def _shard(job: dict) -> str:
    rng = np.random.default_rng(job["seed"])
    sprites = Sprites(Path(job["pieces"]))
    xs, ys, boards, styles, sets, pxs = [], [], [], [], [], []
    for board_id, fen in zip(job["board_ids"], job["fens"]):
        r = render(fen, rng, sprites, job["sets"])
        squares = crop_squares(r.image, r.grid, rng if job["jitter"] else None)
        labels = [CLASS_INDEX[s] for s in square_labels(placement_grid(fen), r.flipped)]
        for sq, label in zip(squares, labels):
            if job["keep_empty"] < 1 and label == 0 and rng.random() > job["keep_empty"]:
                continue
            xs.append(sq)
            ys.append(label)
            boards.append(board_id)
            styles.append(0 if r.style == "print" else 1)
            sets.append(ALL_SETS.index(r.piece_set))
            pxs.append(r.square_px)
    np.savez_compressed(
        job["path"],
        x=np.stack(xs),
        y=np.array(ys, dtype=np.uint8),
        board=np.array(boards, dtype=np.int32),
        style=np.array(styles, dtype=np.uint8),
        piece_set=np.array(sets, dtype=np.uint8),
        square_px=np.array(pxs, dtype=np.float16),
    )
    return job["path"]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--db", required=True)
    p.add_argument("--out", default=f"data/{DATASET_VERSION}")
    p.add_argument("--pieces", default="data/pieces")
    p.add_argument("--seed", type=int, default=20261102)
    p.add_argument("--train", type=int, default=12000)
    p.add_argument("--val", type=int, default=600)
    p.add_argument("--test", type=int, default=1000)
    p.add_argument("--heldout", type=int, default=600)
    p.add_argument("--workers", type=int, default=3)
    a = p.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    splits = {
        "train": dict(n=a.train, sets=TRAIN_SETS, keep_empty=0.3, jitter=True),
        "val": dict(n=a.val, sets=TRAIN_SETS, keep_empty=0.3, jitter=True),
        "test": dict(n=a.test, sets=TRAIN_SETS, keep_empty=1.0, jitter=True),
        "heldout": dict(n=a.heldout, sets=HELDOUT_SETS, keep_empty=1.0, jitter=True),
    }
    total = sum(s["n"] for s in splits.values())
    t0 = time.time()
    fens = sample_positions(a.db, total, a.seed)
    positions_txt = "\n".join(fens) + "\n"
    (out / "positions.txt").write_text(positions_txt)
    print(f"{total} positions in {time.time() - t0:.1f}s")

    jobs, start = [], 0
    for name, s in splits.items():
        for k, i in enumerate(range(0, s["n"], SHARD_BOARDS)):
            ids = list(range(start + i, start + min(i + SHARD_BOARDS, s["n"])))
            jobs.append(
                dict(
                    path=str(out / f"{name}-{k:03d}.npz"),
                    seed=[a.seed, hash_split(name), k],
                    board_ids=ids,
                    fens=[fens[j] for j in ids],
                    sets=s["sets"],
                    keep_empty=s["keep_empty"],
                    jitter=s["jitter"],
                    pieces=a.pieces,
                )
            )
        start += s["n"]

    with ProcessPoolExecutor(a.workers) as pool:
        for done in pool.map(_shard, jobs):
            print(f"{time.time() - t0:6.0f}s {Path(done).name}", flush=True)

    meta = {
        "version": DATASET_VERSION,
        "seed": a.seed,
        "classes": CLASSES,
        "square_size": 48,
        "train_sets": TRAIN_SETS,
        "heldout_sets": HELDOUT_SETS,
        "splits": {k: {kk: vv for kk, vv in v.items()} for k, v in splits.items()},
        "positions_sha256": hashlib.sha256(positions_txt.encode()).hexdigest(),
        "pieces_manifest_sha256": hashlib.sha256((Path(a.pieces) / "pieces.json").read_bytes()).hexdigest(),
        "shards": {Path(j["path"]).name: hashlib.sha256(Path(j["path"]).read_bytes()).hexdigest() for j in jobs},
        "seconds": round(time.time() - t0),
    }
    (out / "dataset.json").write_text(json.dumps(meta, indent=2))
    print(f"done in {meta['seconds']}s")


def hash_split(name: str) -> int:
    # Stable across runs (Python's hash() is salted per process).
    return int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)


if __name__ == "__main__":
    main()
