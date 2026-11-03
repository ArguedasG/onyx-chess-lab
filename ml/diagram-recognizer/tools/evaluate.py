"""Evaluates a trained SquareNet on the synthetic test splits and calibrates its confidence.

1. Fits a temperature on the validation split (minimum NLL), as the manifest will store it.
2. On `test` (training piece sets) and `heldout` (a set never seen): accuracy per square, per
   board (all 64 right), per style, per piece set and per source resolution, plus the confusion
   matrix.
3. The "to review" rule: a board is flagged when its least confident square is below a threshold.
   For each threshold, the share of flagged boards and the exact accuracy of the accepted ones.

Usage: python tools/evaluate.py --run runs/v1 [--data data/v1]
"""

import argparse
import glob
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.model import SquareNet  # noqa: E402

THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99]


def load(data: Path, split: str) -> dict[str, np.ndarray]:
    parts = [np.load(f) for f in sorted(glob.glob(str(data / f"{split}-*.npz")))]
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0].files}


@torch.no_grad()
def logits_of(model: SquareNet, x: np.ndarray, batch: int = 2048) -> torch.Tensor:
    out = [model(torch.from_numpy(x[i : i + batch]).float().div_(255).unsqueeze(1)) for i in range(0, len(x), batch)]
    return torch.cat(out)


def fit_temperature(logits: torch.Tensor, y: torch.Tensor) -> float:
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def closure():
        opt.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), y)
        loss.backward()
        return loss

    opt.step(closure)
    return float(log_t.detach().exp())


def ece(conf: np.ndarray, correct: np.ndarray, bins: int = 15) -> float:
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs(conf[m].mean() - correct[m].mean())
    return float(total)


def report_split(d: dict[str, np.ndarray], logits: torch.Tensor, temperature: float) -> dict:
    probs = F.softmax(logits / temperature, 1).numpy()
    pred = probs.argmax(1)
    conf = probs.max(1)
    y = d["y"]
    correct = pred == y
    out: dict = {"squares": int(len(y)), "square_acc": float(correct.mean()), "ece": ece(conf, correct)}

    out["by_style"] = {name: float(correct[d["style"] == i].mean()) for i, name in enumerate(["print", "screen"]) if (d["style"] == i).any()}
    sets = json.loads((Path(ARGS.data) / "dataset.json").read_text())
    names = sets["train_sets"] + sets["heldout_sets"]
    out["by_set"] = {names[i]: float(correct[d["piece_set"] == i].mean()) for i in np.unique(d["piece_set"])}
    px = d["square_px"].astype(float)
    buckets = [(18, 25), (25, 35), (35, 50), (50, 75), (75, 111)]
    out["by_square_px"] = {f"{lo}-{hi}": float(correct[(px >= lo) & (px < hi)].mean()) for lo, hi in buckets if ((px >= lo) & (px < hi)).any()}
    cm = np.zeros((13, 13), dtype=int)
    np.add.at(cm, (y, pred), 1)
    out["confusion"] = cm.tolist()

    boards = np.unique(d["board"])
    exact, min_conf, styles = [], [], []
    for b in boards:
        m = d["board"] == b
        exact.append(bool(correct[m].all()))
        min_conf.append(float(conf[m].min()))
        styles.append(int(d["style"][m][0]))
    exact, min_conf, styles = np.array(exact), np.array(min_conf), np.array(styles)
    out["boards"] = int(len(boards))
    out["board_acc"] = float(exact.mean())
    out["board_acc_by_style"] = {name: float(exact[styles == i].mean()) for i, name in enumerate(["print", "screen"]) if (styles == i).any()}
    out["review_rule"] = [
        {
            "threshold": t,
            "flagged": float((min_conf < t).mean()),
            "accepted_board_acc": float(exact[min_conf >= t].mean()) if (min_conf >= t).any() else None,
            "wrong_but_accepted": int((~exact & (min_conf >= t)).sum()),
        }
        for t in THRESHOLDS
    ]
    return out


def main() -> None:
    run = Path(ARGS.run)
    model = SquareNet()
    weights = run / "final.pt"
    model.load_state_dict(torch.load(weights) if weights.exists() else torch.load(run / "last.pt", weights_only=False)["model"])
    model.eval()
    torch.set_num_threads(4)

    val = load(Path(ARGS.data), "val")
    t = fit_temperature(logits_of(model, val["x"]), torch.from_numpy(val["y"]).long())
    report = {"temperature": t}
    for split in ["test", "heldout"]:
        d = load(Path(ARGS.data), split)
        report[split] = report_split(d, logits_of(model, d["x"]), t)
        r = report[split]
        print(f"\n[{split}] squares {r['square_acc']:.4%}  boards {r['board_acc']:.2%} ({r['boards']})  ECE {r['ece']:.4f}")
        print("  by style:", {k: f"{v:.4%}" for k, v in r["by_style"].items()}, "boards:", {k: f"{v:.2%}" for k, v in r["board_acc_by_style"].items()})
        print("  by px:", {k: f"{v:.4%}" for k, v in r["by_square_px"].items()})
        print("  by set:", {k: f"{v:.4%}" for k, v in r["by_set"].items()})
        for rule in r["review_rule"]:
            acc = rule["accepted_board_acc"]
            print(f"  t={rule['threshold']:.2f}: flagged {rule['flagged']:.1%}, accepted exact {acc:.2%}, wrong but accepted {rule['wrong_but_accepted']}" if acc is not None else f"  t={rule['threshold']:.2f}: all flagged")
    print(f"\ntemperature {t:.3f}")
    (run / "eval.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--run", required=True)
    p.add_argument("--data", default="data/v1")
    ARGS = p.parse_args()
    main()
