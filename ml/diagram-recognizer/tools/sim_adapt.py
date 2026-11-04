"""Simulates per-book adaptation on the author's labels (private evaluation).

Per book, the labeled diagrams are read in page order, as a user would meet them, with the model
alone and with the model plus a memory of the squares of the boards the user has corrected so far
in that book. A board that ends "to review" is corrected by the simulated user (its squares go
into the memory); an accepted board is not. Reports exact boards, accepted, accepted but wrong
(silent errors) and the squares the user had to fix.

`adapt_board` is the reference of the rule the app runs (`src-tauri/src/diagram/memory.rs`):
- each square's features (the 128 values before the classifier, L2-normalised) are compared with
  the remembered squares by cosine similarity; below MIN_SIM nothing changes;
- the K nearest vote, weighted by exp(SHARP · (sim − best)); the vote is mixed with the model's
  probabilities with a weight that grows from 0 at MIN_SIM to 1 at MIN_SIM + SPAN;
- a square whose answer changes is never confident (capped below the review threshold), and one
  that keeps it keeps the model's confidence: the memory corrects readings but never makes a
  board accepted that the model alone would flag. Letting it do so cost 2 silent errors in 143
  boards (a white king turned black, a pawn for a bishop), so it does not.

Usage: python tools/sim_adapt.py [--run runs/v8] [--report private-eval/report-v8]
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.model import CLASSES, SquareNet  # noqa: E402
from onyx_diagrams.squares import crop_squares  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SYMBOLS = ["." if c == "empty" else c for c in CLASSES]
INDEX = {s: i for i, s in enumerate(SYMBOLS)}

K = 5
MIN_SIM = 0.8
SPAN = 0.2
SHARP = 20.0
EMPTY_PER_BOARD = 8
CHANGED_CAP = 0.9  # confidence of a square the memory changed (below the 0.95 threshold)


def empty_sample(truth: np.ndarray) -> np.ndarray:
    """Up to EMPTY_PER_BOARD empty squares, evenly spread (deterministic, as in Rust)."""
    empty = np.where(truth == 0)[0]
    if len(empty) <= EMPTY_PER_BOARD:
        return empty
    step = len(empty) / EMPTY_PER_BOARD
    return empty[(np.arange(EMPTY_PER_BOARD) * step).astype(int)]


class Memory:
    def __init__(self):
        self.feats = np.zeros((0, 128), np.float32)
        self.labels = np.zeros(0, np.int64)

    def add(self, feats: np.ndarray, truth: np.ndarray) -> None:
        keep = np.concatenate([np.where(truth != 0)[0], empty_sample(truth)])
        self.feats = np.concatenate([self.feats, feats[keep]])
        self.labels = np.concatenate([self.labels, truth[keep]])

    def __len__(self) -> int:
        return len(self.labels)


def adapt_board(probs: np.ndarray, feats: np.ndarray, memory: Memory) -> tuple[np.ndarray, np.ndarray, int]:
    """Returns (class per square, confidence per square, squares changed by the memory)."""
    labels, conf = probs.argmax(1), probs.max(1)
    if not len(memory):
        return labels, conf, 0
    labels, conf = labels.copy(), conf.copy()
    sims = feats @ memory.feats.T
    k = min(K, sims.shape[1])
    top = np.argsort(-sims, axis=1, kind="stable")[:, :k]
    changed = 0
    for i in range(len(feats)):
        s = sims[i, top[i]]
        best = float(s[0])
        if best < MIN_SIM:
            continue
        vote = np.zeros(len(SYMBOLS))
        np.add.at(vote, memory.labels[top[i]], np.exp(SHARP * (s - best)))
        vote /= vote.sum()
        weight = min(1.0, (best - MIN_SIM) / SPAN)
        mixed = (1 - weight) * probs[i] + weight * vote
        label = int(mixed.argmax())
        if label != labels[i]:
            labels[i] = label
            conf[i] = min(float(mixed[label]), CHANGED_CAP)
            changed += 1
    return labels, conf, changed


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--run", default="runs/v8")
    p.add_argument("--report", default="private-eval/report-v8")
    p.add_argument("--labels", default="private-eval/labels.json")
    p.add_argument("--books", default="private-eval/books")
    p.add_argument("--threshold", type=float, default=0.95)
    a = p.parse_args()

    resolve = lambda v: Path(v) if Path(v).is_absolute() else ROOT / v  # noqa: E731
    sys.path.insert(0, str(ROOT / "tools"))
    from eval_books import plausible  # noqa: PLC0415

    run = resolve(a.run)
    model = SquareNet()
    model.load_state_dict(torch.load(run / "final.pt"))
    model.eval()
    temperature = json.loads((run / "eval.json").read_text())["temperature"]
    labels = json.loads(resolve(a.labels).read_text(encoding="utf-8"))["labels"]
    report = json.loads((resolve(a.report) / "results.json").read_text(encoding="utf-8"))

    boards = defaultdict(list)
    for book, entries in report["boards"].items():
        for e in entries:
            label = labels.get(e["file"])
            if not label or label["status"] not in ("ok", "fixed") or "grid" not in e or e.get("status") == "no board":
                continue
            image = Image.open(resolve(a.books) / e["file"]).convert("L")
            x = torch.from_numpy(crop_squares(image, tuple(e["grid"]))).float().div_(255).unsqueeze(1)
            with torch.no_grad():
                f = model.head[1](model.head[0](model.features(x)))
                logits = model.head[3](f)
            feats = F.normalize(f, dim=1).numpy()
            probs = F.softmax(logits / temperature, 1).numpy()
            truth = np.array([INDEX[s] for s in label["placement"]])
            boards[book].append((e["page"] or 0, e["file"], probs, feats, truth))
    for book in boards:
        boards[book].sort(key=lambda b: (b[0], b[1]))

    def simulate(adapted: bool) -> dict:
        rows = {}
        for book, items in boards.items():
            memory = Memory()
            row = defaultdict(int)
            for _, _, probs, feats, truth in items:
                pred, conf, _ = adapt_board(probs, feats, memory) if adapted else (probs.argmax(1), probs.max(1), 0)
                exact = bool((pred == truth).all())
                accepted = plausible([SYMBOLS[j] for j in pred])[0] and conf.min() >= a.threshold
                row["boards"] += 1
                row["exact"] += exact
                row["accepted"] += accepted
                row["silent"] += accepted and not exact
                if not accepted:
                    row["fix_squares"] += int((pred != truth).sum())
                    memory.add(feats, truth)
                    row["corrected"] += 1
            rows[book] = {key: row[key] for key in ("boards", "exact", "accepted", "silent", "corrected", "fix_squares")}
        return rows

    for name, adapted in (("model alone", False), ("adapted to the book", True)):
        rows = simulate(adapted)
        tot = defaultdict(int)
        for r in rows.values():
            for key, v in r.items():
                tot[key] += v
        print(f"\n## {name}")
        print("| Book | Boards | Exact | Accepted | Silent | Corrected | Squares to fix |\n|---|---:|---:|---:|---:|---:|---:|")
        for book, r in sorted(rows.items()):
            print(f"| {book[:34]} | {r['boards']} | {r['exact']} | {r['accepted']} | {r['silent']} | {r['corrected']} | {r['fix_squares']} |")
        print(f"| **Total** | {tot['boards']} | {tot['exact']} | {tot['accepted']} | **{tot['silent']}** | {tot['corrected']} | {tot['fix_squares']} |")


if __name__ == "__main__":
    main()
