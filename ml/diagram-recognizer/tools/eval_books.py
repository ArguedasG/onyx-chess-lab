"""Private evaluation on the author's books, without ground truth yet.

For each extracted diagram: find the grid, classify the 64 squares and check the board with
chess rules (one king per side, no pawn on the first or last rank in either orientation, at most
8 pawns and 16 pieces per side). Reports per book the share of boards found, plausible and
flagged for review, and writes galleries (original crop with the grid, and the predicted board
with doubtful squares in red) to review by eye. Nothing here leaves the author's PC.

Usage: python tools/eval_books.py --run runs/v1 [--books private-eval/books] [--threshold 0.9]
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.locate import find_grid  # noqa: E402
from onyx_diagrams.model import CLASSES, SquareNet  # noqa: E402
from onyx_diagrams.render import PIECE_NAMES  # noqa: E402
from onyx_diagrams.squares import crop_squares  # noqa: E402

NO_BOARD = 0.15
TILE = 240


def plausible(labels: list[str]) -> tuple[bool, bool, str]:
    """Returns (plausible, flipped, reason). `labels` in display order, top-left first."""
    count = lambda s: labels.count(s)  # noqa: E731
    if count("K") != 1 or count("k") != 1:
        return False, False, f"kings {count('K')}/{count('k')}"
    if any(s in "Pp" for s in labels[:8] + labels[56:]):
        return False, False, "pawn on edge rank"
    if count("P") > 8 or count("p") > 8:
        return False, False, "too many pawns"
    if sum(s.isupper() for s in labels) > 16 or sum(s.islower() for s in labels) > 16:
        return False, False, "too many pieces"
    # Orientation guess: white pawns usually stand below black ones.
    rows = lambda s: [i // 8 for i, x in enumerate(labels) if x == s]  # noqa: E731
    wp, bp = rows("P"), rows("p")
    flipped = bool(wp and bp and np.mean(wp) < np.mean(bp))
    return True, flipped, ""


def draw_board(labels: list[str], conf: np.ndarray, threshold: float, pieces: Path) -> Image.Image:
    sq = TILE // 8
    im = Image.new("RGB", (TILE, TILE))
    d = ImageDraw.Draw(im)
    for i, s in enumerate(labels):
        r, c = divmod(i, 8)
        color = (181, 136, 99) if (r + c) % 2 else (240, 217, 181)
        if conf[i] < threshold:
            color = (230, 60, 60)
        d.rectangle((c * sq, r * sq, (c + 1) * sq - 1, (r + 1) * sq - 1), fill=color)
        if s != ".":
            p = Image.open(pieces / f"{PIECE_NAMES[s]}.png").convert("RGBA").resize((sq, sq))
            im.paste(p, (c * sq, r * sq), p)
    return im


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--run", required=True)
    p.add_argument("--books", default="private-eval/books")
    p.add_argument("--out", default="private-eval/report")
    p.add_argument("--threshold", type=float, default=0.9)
    p.add_argument("--pieces", default="data/pieces/cburnett")
    p.add_argument("--per-book", type=int, default=0, help="only the first N diagrams of each book (0 = all)")
    a = p.parse_args()

    run, books, out = Path(a.run), Path(a.books), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    model = SquareNet()
    final = run / "final.pt"
    model.load_state_dict(torch.load(final) if final.exists() else torch.load(run / "last.pt", weights_only=False)["model"])
    model.eval()
    temperature = json.loads((run / "eval.json").read_text())["temperature"] if (run / "eval.json").exists() else 1.0
    symbols = ["." if c == "empty" else c for c in CLASSES]

    index = json.loads((books / "index.json").read_text())
    if a.per_book:
        taken: dict[str, int] = defaultdict(int)
        index = [e for e in index if (taken.__setitem__(e["slug"], taken[e["slug"]] + 1) or taken[e["slug"]]) <= a.per_book]
    per_book: dict[str, list[dict]] = defaultdict(list)
    tiles: dict[str, list[Image.Image]] = defaultdict(list)
    for entry in index:
        image = Image.open(books / entry["file"]).convert("L")
        grid, score = find_grid(image)
        result = {"file": entry["file"], "page": entry["page"], "grid": grid, "score": score}
        if score < NO_BOARD:
            result["status"] = "no board"
        else:
            x = torch.from_numpy(crop_squares(image, grid)).float().div_(255).unsqueeze(1)
            with torch.no_grad():
                probs = F.softmax(model(x) / temperature, 1).numpy()
            labels = [symbols[k] for k in probs.argmax(1)]
            conf = probs.max(1)
            ok, flipped, reason = plausible(labels)
            result |= {
                "labels": "".join(labels),
                "min_conf": float(conf.min()),
                "doubtful": int((conf < a.threshold).sum()),
                "plausible": ok,
                "reason": reason,
                "flipped_guess": flipped,
                "status": "accepted" if ok and conf.min() >= a.threshold else "review",
            }
            crop = image.convert("RGB")
            ImageDraw.Draw(crop).rectangle(grid, outline=(0, 160, 255), width=max(1, image.width // 150))
            crop.thumbnail((TILE, TILE))
            tile = Image.new("RGB", (2 * TILE + 10, TILE + 18), (255, 255, 255))
            tile.paste(crop, (0, 0))
            tile.paste(draw_board(labels, conf, a.threshold, Path(a.pieces)), (TILE + 10, 0))
            ImageDraw.Draw(tile).text((2, TILE + 3), f"{Path(entry['file']).name} {result['status']} {reason}", fill=(0, 0, 0))
            tiles[entry["slug"]].append(tile)
        per_book[entry["slug"]].append(result)

    summary = {}
    print(f"{'book':42} {'n':>3} {'found':>6} {'plaus.':>7} {'accept':>7} {'review':>7}")
    for slug, results in per_book.items():
        n = len(results)
        found = [r for r in results if r["status"] != "no board"]
        row = {
            "n": n,
            "found": len(found),
            "plausible": sum(r.get("plausible", False) for r in found),
            "accepted": sum(r["status"] == "accepted" for r in found),
            "review": sum(r["status"] == "review" for r in found),
        }
        summary[slug] = row
        print(f"{slug[:42]:42} {n:3} {row['found']:6} {row['plausible']:7} {row['accepted']:7} {row['review']:7}")
        sheet_tiles = tiles[slug]
        if sheet_tiles:
            cols = 3
            w, h = sheet_tiles[0].size
            sheet = Image.new("RGB", (cols * w, -(-len(sheet_tiles) // cols) * h), (255, 255, 255))
            for i, t in enumerate(sheet_tiles):
                sheet.paste(t, ((i % cols) * w, (i // cols) * h))
            sheet.save(out / f"{slug}.png")
    total = {k: sum(v[k] for v in summary.values()) for k in ["n", "found", "plausible", "accepted", "review"]}
    print(f"{'TOTAL':42} {total['n']:3} {total['found']:6} {total['plausible']:7} {total['accepted']:7} {total['review']:7}")
    (out / "results.json").write_text(json.dumps({"summary": summary, "total": total, "boards": per_book}, indent=2))


if __name__ == "__main__":
    main()
