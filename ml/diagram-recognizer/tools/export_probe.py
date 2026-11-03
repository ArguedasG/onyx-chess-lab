"""Step 1 of phase 9.4: export an untrained SquareNet to ONNX to benchmark Rust runtimes.

Writes, for each input size, `<out>/probe-<size>.onnx` plus a deterministic input batch and the
ONNX Runtime output (raw little-endian f32) so the Rust bench can check parity, and prints the
reference latency of ONNX Runtime and PyTorch on this machine.

Usage: python tools/export_probe.py [--out runs/probe] [--sizes 48 64]
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.model import CLASSES, SquareNet  # noqa: E402


def median_ms(fn, runs: int = 30) -> float:
    fn()
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        fn()
        times.append((time.perf_counter() - t0) * 1000)
    return float(np.median(times))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="runs/probe")
    parser.add_argument("--sizes", type=int, nargs="+", default=[48, 64])
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(0)
    model = SquareNet().eval()
    params = sum(p.numel() for p in model.parameters())
    summary = {"params": params, "classes": CLASSES, "sizes": {}}

    for size in args.sizes:
        path = out / f"probe-{size}.onnx"
        dummy = torch.zeros(1, 1, size, size)
        torch.onnx.export(
            model,
            (dummy,),
            str(path),
            input_names=["squares"],
            output_names=["logits"],
            dynamic_axes={"squares": {0: "batch"}, "logits": {0: "batch"}},
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )

        rng = np.random.default_rng(size)
        batch = rng.random((64, 1, size, size), dtype=np.float32)
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        expected = session.run(None, {"squares": batch})[0]
        batch.tofile(out / f"probe-{size}.input.f32")
        expected.astype(np.float32).tofile(out / f"probe-{size}.output.f32")

        with torch.no_grad():
            torch_out = model(torch.from_numpy(batch)).numpy()
        batch128 = np.concatenate([batch, batch[:, :, ::-1, ::-1].copy()])
        summary["sizes"][size] = {
            "onnx_bytes": path.stat().st_size,
            "torch_vs_ort_max_diff": float(np.abs(torch_out - expected).max()),
            "ort_ms_64": median_ms(lambda: session.run(None, {"squares": batch})),
            "ort_ms_128": median_ms(lambda: session.run(None, {"squares": batch128})),
        }
        print(size, summary["sizes"][size])

    (out / "probe.json").write_text(json.dumps(summary, indent=2))
    print(f"params: {params}")


if __name__ == "__main__":
    main()
