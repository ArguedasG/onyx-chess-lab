"""Writes the parity fixtures that the Rust runtime is tested against.

Output: src-tauri/fixtures/diagram/
- gray.png + gray.json: an RGB image and the SHA-256 of Pillow's convert("L");
- resample.png + resample.json: a grayscale image and Pillow BOX resizes of several boxes
  (fractional, upscaling, downscaling, touching the borders), as base64 bytes;
- board-<n>.png + boards.json: synthetic boards (print and screen) with the grid and score of
  `locate.find_grid`, the SHA-256 of the 64 cropped squares and the ONNX Runtime logits of the
  shipped model.

Usage: python tools/make_parity_fixtures.py [--model models/1.0.0/diagram-squares-1.0.0.onnx]
"""

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onyx_diagrams.detect import detect_boards  # noqa: E402
from onyx_diagrams.locate import find_grid  # noqa: E402
from onyx_diagrams.positions import sample_positions  # noqa: E402
from onyx_diagrams.render import Sprites, render_print, render_screen  # noqa: E402
from onyx_diagrams.squares import SIZE, crop_squares  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "src-tauri" / "fixtures" / "diagram"
SETS = ["cburnett", "merida", "chessnut", "glyph-dejavu", "glyph-noto", "mpchess"]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="models/1.0.0/diagram-squares-1.0.0.onnx")
    p.add_argument("--db", required=True)
    a = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(424242)

    rgb = Image.fromarray(rng.integers(0, 256, (37, 53, 3), dtype=np.uint8), "RGB")
    rgb.save(OUT / "gray.png")
    (OUT / "gray.json").write_text(json.dumps({"sha256": hashlib.sha256(rgb.convert("L").tobytes()).hexdigest()}))

    gray = Image.fromarray(rng.integers(0, 256, (83, 97), dtype=np.uint8), "L")
    gray.save(OUT / "resample.png")
    boxes = [
        ((0, 0, 97, 83), (48, 48)),
        ((10.25, 3.5, 40.75, 31.125), (48, 48)),
        ((0.0, 0.0, 12.3, 12.3), (48, 48)),
        ((60.4, 50.2, 97.0, 83.0), (48, 48)),
        ((5.0, 5.0, 90.0, 80.0), (20, 17)),
        ((0, 0, 97, 83), (160, 137)),
    ]
    cases = []
    for box, size in boxes:
        out = gray.resize(size, Image.Resampling.BOX, box=box)
        cases.append({"box": list(box), "size": list(size), "bytes": base64.b64encode(out.tobytes()).decode()})
    (OUT / "resample.json").write_text(json.dumps(cases))

    session = ort.InferenceSession(a.model, providers=["CPUExecutionProvider"])
    sprites = Sprites(Path("data/pieces"))
    fens = sample_positions(a.db, 6, 99)
    boards = []
    for n, fen in enumerate(fens):
        r = (render_print if n % 2 == 0 else render_screen)(fen, rng, sprites, SETS)
        name = f"board-{n}.png"
        r.image.save(OUT / name)
        grid, score = find_grid(r.image)
        squares = crop_squares(r.image, grid)
        logits = session.run(None, {"squares": squares.astype(np.float32)[:, None] / 255})[0]
        boards.append(
            {
                "file": name,
                "style": r.style,
                "grid": list(grid),
                "score": score,
                "squares_sha256": hashlib.sha256(squares.tobytes()).hexdigest(),
                "logits": [round(float(v), 6) for v in logits.ravel()],
            }
        )
        print(name, r.style, r.image.size, [round(v, 2) for v in grid], round(score, 3))
    (OUT / "boards.json").write_text(json.dumps(boards))

    # Pages with several boards among lines of fake text, for the page detector.
    pages = []
    font = ImageFont.load_default(size=22)
    for n in range(2):
        page = Image.new("L", (1000, 1400), 250)
        d = ImageDraw.Draw(page)
        for y in range(40, 1380, 34):
            words = " ".join("".join(chr(97 + int(c)) for c in rng.integers(0, 26, int(rng.integers(2, 9)))) for _ in range(9))
            d.text((40, y), words, fill=30, font=font)
        fens_page = sample_positions(a.db, 4, 500 + n)
        for k, fen in enumerate(fens_page):
            r = render_print(fen, rng, sprites, SETS)
            board = r.image.resize((280, 280))
            page.paste(Image.new("L", (300, 300), 250), (90 + (k % 2) * 460, 150 + (k // 2) * 560))
            page.paste(board, (100 + (k % 2) * 460, 160 + (k // 2) * 560))
        name = f"page-{n}.png"
        page.save(OUT / name)
        found = detect_boards(page)
        pages.append({"file": name, "boards": [{"grid": list(box), "agreement": value} for box, value in found]})
        print(name, len(found), [round(v, 3) for _, v in found])
    (OUT / "pages.json").write_text(json.dumps(pages))
    assert SIZE == 48


if __name__ == "__main__":
    main()
