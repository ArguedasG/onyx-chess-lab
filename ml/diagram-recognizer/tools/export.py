"""Exports a trained SquareNet to ONNX with its manifest and parity reference.

Outputs in <run>/export/:
- diagram-squares-<version>.onnx (opset 17, dynamic batch, logits);
- diagram-squares-<version>.json: the manifest (exact preprocessing, classes, temperature,
  review threshold, hashes, training config and metrics);
- parity.input.u8 / parity.logits.f32: one real test board (64 squares) and the PyTorch logits,
  which the Rust runtime must reproduce (max abs diff ≤ 1e-4, same argmax).

Usage: python tools/export.py --run runs/v1 --version 1.0.0 --threshold 0.9
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.model import CLASSES, SquareNet  # noqa: E402
from onyx_diagrams.squares import SIZE  # noqa: E402


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--run", required=True)
    p.add_argument("--data", default="data/v1")
    p.add_argument("--version", required=True)
    p.add_argument("--threshold", type=float, required=True)
    a = p.parse_args()

    run, data = Path(a.run), Path(a.data)
    out = run / "export"
    out.mkdir(exist_ok=True)
    name = f"diagram-squares-{a.version}"
    model = SquareNet()
    model.load_state_dict(torch.load(run / "final.pt"))
    model.eval()

    onnx_path = out / f"{name}.onnx"
    torch.onnx.export(
        model,
        (torch.zeros(1, 1, SIZE, SIZE),),
        str(onnx_path),
        input_names=["squares"],
        output_names=["logits"],
        dynamic_axes={"squares": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )

    # Parity: the first full board of the test split.
    test = np.load(data / "test-000.npz")
    board = test["x"][test["board"] == test["board"][0]][:64]
    assert board.shape == (64, SIZE, SIZE)
    x = board.astype(np.float32)[:, None] / 255
    with torch.no_grad():
        ref = model(torch.from_numpy(x)).numpy()
    ort_out = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"]).run(None, {"squares": x})[0]
    diff = float(np.abs(ref - ort_out).max())
    same = bool((ref.argmax(1) == ort_out.argmax(1)).all())
    assert diff <= 1e-4 and same, (diff, same)
    board.tofile(out / "parity.input.u8")
    ref.astype("<f4").tofile(out / "parity.logits.f32")

    evaluation = json.loads((run / "eval.json").read_text())
    config = json.loads((run / "config.json").read_text())
    dataset = json.loads((data / "dataset.json").read_text())
    manifest = {
        "name": "diagram-squares",
        "version": a.version,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "task": "Classify one chess diagram square into empty or one of the 12 pieces",
        "architecture": {"name": "SquareNet", "widths": [16, 32, 64, 128], "params": sum(t.numel() for t in model.parameters())},
        "input": {
            "name": "squares",
            "shape": ["batch", 1, SIZE, SIZE],
            "dtype": "float32",
            "color": "grayscale, L = R*299/1000 + G*587/1000 + B*114/1000 (PIL 'L')",
            "crop": "board grid box split in 8 x 8 equal squares, row by row from the top-left of the image",
            "resize": "area average (PIL Image.Resampling.BOX) of the square box to 48 x 48",
            "scale": "value / 255",
        },
        "output": {"name": "logits", "shape": ["batch", len(CLASSES)], "classes": CLASSES},
        "calibration": {"temperature": evaluation["temperature"], "review_threshold": a.threshold, "rule": "a board is 'to review' if any square has max softmax(logits / T) below the threshold"},
        "metrics": {
            split: {k: evaluation[split][k] for k in ["square_acc", "board_acc", "ece", "board_acc_by_style"]}
            | {"review_rule_at_threshold": next((r for r in evaluation[split]["review_rule"] if r["threshold"] == a.threshold), None)}
            for split in ["test", "heldout"]
        },
        "training": {k: config[k] for k in ["epochs", "batch", "lr", "seed", "train_squares", "total_steps"]},
        "dataset": {"version": dataset["version"], "seed": dataset["seed"], "positions_sha256": dataset["positions_sha256"], "dataset_json_sha256": sha256(data / "dataset.json")},
        "parity": {"input": "parity.input.u8", "logits": "parity.logits.f32", "torch_vs_onnxruntime_max_diff": diff, "tolerance": 1e-4},
        "sha256": {"onnx": sha256(onnx_path), "checkpoint": sha256(run / "final.pt")},
        "license": "GPL-3.0-only (trained only on synthetic data; see the dataset card)",
    }
    (out / f"{name}.json").write_text(json.dumps(manifest, indent=2))
    print(f"{onnx_path} ({onnx_path.stat().st_size / 1e6:.2f} MB), parity diff {diff:.2e}")


if __name__ == "__main__":
    main()
