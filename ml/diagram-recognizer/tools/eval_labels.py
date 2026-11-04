"""Measures model readings against the author's labels (private evaluation, with ground truth).

Reads one or more `eval_books.py` reports and `private-eval/labels.json` (written by
`label_books.py`) and prints, per report: square accuracy, exact boards, and above all how many
boards the app would accept with a wrong square (silent errors). Diagrams labeled "not a diagram"
count as wrong when accepted; skipped ones are left out.

Usage: python tools/eval_labels.py [--reports private-eval/report-v7-t095 private-eval/report-v8]
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def evaluate(results: dict, labels: dict) -> dict:
    total = defaultdict(int)
    per_book: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    for book, boards in results["boards"].items():
        for board in boards:
            label = labels.get(board["file"])
            if not label or label["status"] == "skip":
                continue
            accepted = board.get("status") == "accepted"
            rows = (total, per_book[book])
            for row in rows:
                row["labeled"] += 1
                row["accepted"] += accepted
            if label["status"] == "not_diagram":
                for row in rows:
                    row["not_diagram"] += 1
                    row["accepted_wrong"] += accepted
                continue
            truth, read = label["placement"], board.get("labels")
            right = sum(a == b for a, b in zip(truth, read)) if read else 0
            exact = read == truth
            for row in rows:
                row["boards"] += 1
                row["squares"] += 64
                row["squares_right"] += right
                row["exact"] += exact
                row["accepted_exact"] += accepted and exact
                row["accepted_wrong"] += accepted and not exact
                row["review_exact"] += (not accepted) and exact
    return {"total": dict(total), "books": {book: dict(row) for book, row in per_book.items()}}


def pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f} %" if whole else "-"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--reports", nargs="+", default=["private-eval/report-v8"])
    p.add_argument("--labels", default="private-eval/labels.json")
    p.add_argument("--out", default="private-eval/labels-eval.json")
    a = p.parse_args()

    resolve = lambda value: Path(value) if Path(value).is_absolute() else ROOT / value  # noqa: E731
    labels = json.loads(resolve(a.labels).read_text(encoding="utf-8"))["labels"]
    print(f"{len(labels)} labels")
    out = {}
    for report in a.reports:
        results = json.loads((resolve(report) / "results.json").read_text(encoding="utf-8"))
        r = evaluate(results, labels)
        out[report] = r
        t = r["total"]
        boards, accepted = t.get("boards", 0), t.get("accepted", 0)
        print(f"\n## {report}")
        print("| Metric | Value |\n|---|---:|")
        print(f"| Labeled diagrams (without skipped) | {t.get('labeled', 0)} |")
        print(f"| Squares right | {pct(t.get('squares_right', 0), t.get('squares', 0))} |")
        print(f"| Exact boards | {t.get('exact', 0)} / {boards} ({pct(t.get('exact', 0), boards)}) |")
        print(f"| Accepted | {accepted} |")
        print(f"| Accepted and exact | {pct(t.get('accepted_exact', 0), accepted)} |")
        print(f"| **Accepted but wrong (silent errors)** | {t.get('accepted_wrong', 0)} |")
        print(f"| Flagged for review but exact | {t.get('review_exact', 0)} |")
        print("\n| Book | Labeled | Exact | Accepted | Accepted but wrong |\n|---|---:|---:|---:|---:|")
        for book, row in sorted(r["books"].items()):
            print(
                f"| {book[:40]} | {row.get('labeled', 0)} | {row.get('exact', 0)} / {row.get('boards', 0)}"
                f" | {row.get('accepted', 0)} | {row.get('accepted_wrong', 0)} |"
            )
    path = resolve(a.out)
    path.write_text(json.dumps(out, indent=1), encoding="utf-8", newline="\n")
    print(f"\nWritten to {path}")


if __name__ == "__main__":
    main()
