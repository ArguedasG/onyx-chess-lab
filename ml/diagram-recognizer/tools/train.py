"""Trains SquareNet on a synthetic dataset, in short resumable lots.

The run stops on its own after `--minutes` and saves a checkpoint; launching the same command
again resumes from it (same data order, same learning-rate schedule). Metrics go to
runs/<name>/metrics.jsonl.

Usage: python tools/train.py --name v1 [--data data/v1] [--epochs 8] [--minutes 12]
"""

import argparse
import glob
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.model import SquareNet  # noqa: E402


def load_split(data: Path, split: str) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for f in sorted(glob.glob(str(data / f"{split}-*.npz"))):
        d = np.load(f)
        xs.append(d["x"])
        ys.append(d["y"])
    return np.concatenate(xs), np.concatenate(ys)


def augment(x: torch.Tensor, g: torch.Generator) -> torch.Tensor:
    """Cheap photometric noise on a [B, 1, H, W] batch in 0–1. Never inverts (colour is the label)."""
    b = x.shape[0]
    gain = 1 + (torch.rand(b, 1, 1, 1, generator=g) - 0.5) * 0.4
    bias = (torch.rand(b, 1, 1, 1, generator=g) - 0.5) * 0.2
    noise = torch.randn(x.shape, generator=g) * (torch.rand(b, 1, 1, 1, generator=g) * 0.05)
    return (x * gain + bias + noise).clamp(0, 1)


@torch.no_grad()
def evaluate(model: SquareNet, x: np.ndarray, y: np.ndarray, batch: int = 1024) -> dict:
    model.eval()
    loss, correct = 0.0, 0
    for i in range(0, len(x), batch):
        xb = torch.from_numpy(x[i : i + batch]).float().div_(255).unsqueeze(1)
        yb = torch.from_numpy(y[i : i + batch]).long()
        logits = model(xb)
        loss += F.cross_entropy(logits, yb, reduction="sum").item()
        correct += (logits.argmax(1) == yb).sum().item()
    model.train()
    return {"val_loss": loss / len(x), "val_acc": correct / len(x)}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True)
    p.add_argument("--data", default="data/v1")
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=3e-3)
    p.add_argument("--minutes", type=float, default=12)
    p.add_argument("--threads", type=int, default=4)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--eval-every", type=int, default=400)
    a = p.parse_args()

    torch.set_num_threads(a.threads)
    run = Path("runs") / a.name
    run.mkdir(parents=True, exist_ok=True)
    data = Path(a.data)
    x_train, y_train = load_split(data, "train")
    x_val, y_val = load_split(data, "val")
    steps_per_epoch = len(x_train) // a.batch
    total_steps = steps_per_epoch * a.epochs

    torch.manual_seed(a.seed)
    model = SquareNet()
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=total_steps, pct_start=0.15)
    step = 0
    ckpt = run / "last.pt"
    if ckpt.exists():
        state = torch.load(ckpt, weights_only=False)
        model.load_state_dict(state["model"])
        opt.load_state_dict(state["opt"])
        sched.load_state_dict(state["sched"])
        step = state["step"]
        print(f"resumed at step {step}/{total_steps}")
    else:
        (run / "config.json").write_text(json.dumps({**vars(a), "train_squares": len(x_train), "val_squares": len(x_val), "total_steps": total_steps}, indent=2))

    def save() -> None:
        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(), "step": step}, ckpt)

    t0 = time.time()
    model.train()
    seen, running = 0, 0.0
    while step < total_steps:
        epoch, offset = divmod(step, steps_per_epoch)
        order = np.random.default_rng([a.seed, epoch]).permutation(len(x_train))
        g = torch.Generator().manual_seed(a.seed * 1000 + step)
        idx = order[offset * a.batch : (offset + 1) * a.batch]
        xb = augment(torch.from_numpy(x_train[idx]).float().div_(255).unsqueeze(1), g)
        yb = torch.from_numpy(y_train[idx]).long()
        loss = F.cross_entropy(model(xb), yb, label_smoothing=0.02)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        step += 1
        seen += len(idx)
        running += loss.item()

        last = step == total_steps
        out_of_time = (time.time() - t0) / 60 > a.minutes
        if step % a.eval_every == 0 or last or out_of_time:
            m = {"step": step, "epoch": round(step / steps_per_epoch, 3), "train_loss": running / a.eval_every, "lr": sched.get_last_lr()[0], "squares_per_s": round(seen / (time.time() - t0)), **evaluate(model, x_val, y_val)}
            running = 0.0
            with open(run / "metrics.jsonl", "a") as f:
                f.write(json.dumps(m) + "\n")
            print(json.dumps(m), flush=True)
            save()
        if out_of_time and not last:
            print(f"time budget reached at step {step}/{total_steps}; run the same command to resume")
            return
    torch.save(model.state_dict(), run / "final.pt")
    print("training finished")


if __name__ == "__main__":
    main()
