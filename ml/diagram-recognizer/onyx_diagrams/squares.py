"""Square preprocessing: the contract shared by training, evaluation and the Rust runtime.

A board is given as its grid box (the 8 × 8 squares, without frame or coordinates) in a grayscale
image. Each square is cut from that box and resampled with an area filter (PIL BOX) to 48 × 48;
the model input is that value / 255. Squares are listed row by row from the top-left corner of
the image, whatever the board orientation.
"""

import numpy as np
from PIL import Image

SIZE = 48


def square_boxes(grid: tuple[float, float, float, float]) -> list[tuple[float, float, float, float]]:
    x0, y0, x1, y1 = grid
    w, h = (x1 - x0) / 8, (y1 - y0) / 8
    return [(x0 + c * w, y0 + r * h, x0 + (c + 1) * w, y0 + (r + 1) * h) for r in range(8) for c in range(8)]


def crop_squares(
    image: Image.Image,
    grid: tuple[float, float, float, float],
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Returns uint8 [64, SIZE, SIZE]. With `rng`, simulates grid detection error (training)."""
    if image.mode != "L":
        image = image.convert("L")
    if rng is not None:
        x0, y0, x1, y1 = grid
        side = x1 - x0
        x0, y0, x1, y1 = (v + float(np.clip(rng.normal(0, 0.012 * side), -0.03 * side, 0.03 * side)) for v in grid)
        grid = (x0, y0, x1, y1)
    out = np.empty((64, SIZE, SIZE), dtype=np.uint8)
    for i, (a, b, c, d) in enumerate(square_boxes(grid)):
        if rng is not None:
            w = c - a
            dx, dy = rng.uniform(-0.03, 0.03, 2) * w
            grow = rng.uniform(-0.03, 0.05) * w
            a, b, c, d = a + dx - grow, b + dy - grow, c + dx + grow, d + dy + grow
        # A box is never larger than the image (boards that touch the edge of a screenshot).
        a, b = max(0.0, a), max(0.0, b)
        c, d = min(float(image.width), c), min(float(image.height), d)
        out[i] = np.asarray(image.resize((SIZE, SIZE), Image.Resampling.BOX, box=(a, b, c, d)))
    return out


def square_labels(grid_symbols: list[str], flipped: bool) -> list[str]:
    """Labels in display order (top-left first) from the rank-8-first placement grid."""
    return grid_symbols[::-1] if flipped else list(grid_symbols)
