"""Finds the 8 × 8 grid of a board inside an image (a diagram crop or a screenshot).

The board is the square whose 64 cells show the strongest checkerboard contrast: the mean
darkness of the dark cells minus that of the light ones. The top-left square of a diagram is light
whatever the orientation (a8 or h1), which fixes the sign and rules out grids shifted by one
square. Hatched dark squares count as dark because only cell means are compared.

Search: coarse over every position and size on a copy reduced to 160 px, then a fine pass at full
resolution around the best candidate. Cell sums come from an integral image, so each candidate
costs 64 × 4 lookups; the Rust port (src-tauri/src/diagram/locate.rs) repeats the same operations
in the same order, so both give the same grid.
"""

import numpy as np
from PIL import Image

COARSE = 160
MIN_SIDE = 0.45  # the board covers at least 45 % of the shorter side of the image
TEXTURE_WEIGHT = 1.0
MIN_SPREAD = 5.0


def _integral(a: np.ndarray) -> np.ndarray:
    # In float64 every sum is an exact integer, so any implementation gets the same values.
    out = np.zeros((a.shape[0] + 1, a.shape[1] + 1), dtype=np.float64)
    out[1:, 1:] = a.astype(np.float64).cumsum(0).cumsum(1)
    return out


def _contrast(I: np.ndarray, ys: np.ndarray, xs: np.ndarray, side: float, side_y: float | None = None) -> np.ndarray:
    """Checkerboard contrast for every (y0, x0) pair of the given arrays (broadcast)."""
    side_y = side if side_y is None else side_y
    ex = np.round(np.arange(9) * side / 8).astype(int)
    ey = np.round(np.arange(9) * side_y / 8).astype(int)
    score = 0.0
    for r in range(8):
        for c in range(8):
            y0, y1 = ys + ey[r], ys + ey[r + 1]
            x0, x1 = xs + ex[c], xs + ex[c + 1]
            total = I[y1, x1] - I[y0, x1] - I[y1, x0] + I[y0, x0]
            score = score + (total if (r + c) % 2 else -total)
    # Every cell is weighted by the nominal cell area (side² / 64), not by its rounded one.
    return score / (32 * side * side_y / 64)


def _signal(gray: np.ndarray) -> np.ndarray:
    """Darkness plus texture: hatched or dotted squares are textured over their whole area, while
    paper is flat; pieces only add texture along their outlines."""
    g = gray.astype(np.float32)
    tex = np.zeros_like(g)
    tex[:, 1:] += np.abs(np.diff(g, axis=1))
    tex[1:, :] += np.abs(np.diff(g, axis=0))
    return (255 - g) + TEXTURE_WEIGHT * tex


def find_grid(image: Image.Image) -> tuple[tuple[float, float, float, float], float]:
    """Returns the grid box (x0, y0, x1, y1) in image pixels and a normalized score.

    The score is the checkerboard contrast divided by the image's darkness spread; below ~0.15
    there is probably no board in the image.
    """
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    dark = _signal(gray)
    h, w = dark.shape
    spread = float(dark.astype(np.float64).std()) + 1e-6
    if spread < MIN_SPREAD:
        # A nearly uniform image has no board (and its tiny contrast would be divided by ~0).
        return (0.0, 0.0, float(w), float(h)), 0.0

    # Coarse pass.
    s = min(1.0, COARSE / max(h, w))
    small = np.asarray(image.convert("L").resize((max(8, round(w * s)), max(8, round(h * s))), Image.Resampling.BOX), dtype=np.float32)
    sh, sw = small.shape
    Is = _integral(_signal(small))
    best = (-np.inf, 0, 0, 0)
    for side in range(max(8, int(MIN_SIDE * min(sh, sw))), min(sh, sw) + 1):
        ys = np.arange(0, sh - side + 1)[:, None]
        xs = np.arange(0, sw - side + 1)[None, :]
        c = _contrast(Is, ys, xs, side)
        k = int(np.argmax(c))
        if c.flat[k] > best[0]:
            yi, xi = divmod(k, c.shape[1])
            best = (float(c.flat[k]), int(ys[yi, 0]), int(xs[0, xi]), side)

    # Fine pass at full resolution: position ± one coarse pixel, each side ± 2 coarse pixels.
    _, y0, x0, side = best
    I = _integral(dark)
    fy, fx, fside = y0 / s, x0 / s, side / s
    r = int(np.ceil(1 / s)) + 1
    best_full = (-np.inf, 0.0, 0.0, 0.0, 0.0)
    for sx in np.arange(fside - 2 / s, fside + 2 / s + 1):
        for sy in np.arange(sx * 0.97, sx * 1.03 + 1, max(1.0, sx * 0.005)):
            ys = np.arange(max(0, int(fy) - r), min(h - int(np.ceil(sy)), int(fy) + r) + 1)[:, None]
            xs = np.arange(max(0, int(fx) - r), min(w - int(np.ceil(sx)), int(fx) + r) + 1)[None, :]
            if ys.size == 0 or xs.size == 0 or sx < 8:
                continue
            c = _contrast(I, ys, xs, float(sx), float(sy))
            k = int(np.argmax(c))
            if c.flat[k] > best_full[0]:
                yi, xi = divmod(k, c.shape[1])
                best_full = (float(c.flat[k]), float(xs[0, xi]), float(ys[yi, 0]), float(sx), float(sy))
    score, gx, gy, sx, sy = best_full
    return (gx, gy, gx + sx, gy + sy), score / spread
