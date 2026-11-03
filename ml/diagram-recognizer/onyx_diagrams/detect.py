"""Finds every board on a page (scanned books, pages with many diagrams).

`locate.find_grid` assumes one board covering most of the image. Here every position and size
from 8 % to 70 % of the page width (sizes 3 % apart) is tried on a copy reduced to 400 px, and a
candidate is scored by **neighbour agreement**: of the 112 pairs of adjacent cells, the share in
which the dark cell is darker than the light one. Each cell is measured on its four corners, which
show the square and not the piece standing in its middle. A real board scores 0.85–1 even with pieces on
it, while text, blank paper or noise score about 0.5 whatever their contrast, so the measure
does not depend on how dark the squares are printed. Cell sums come from an integral image.
Local maxima are kept from the best down, skipping any that overlaps a board already taken; each
one is then refined at full resolution in a small neighbourhood (`locate.refine`).
"""

import numpy as np
from PIL import Image

from .locate import _integral, _signal, refine

COARSE = 400
MIN_FRACTION = 0.08
MAX_FRACTION = 0.7
SIDE_STEP = 1.03
MIN_AGREEMENT = 0.8
# A dark cell must be darker than its light neighbour by this much (signal units) to agree.
AGREEMENT_MARGIN = 3.0
# Side of each corner patch, as a share of the cell.
CORNER = 0.25


def _edges(side: float) -> np.ndarray:
    return np.round(np.arange(9) * side / 8).astype(int)


def agreement_map(integral: np.ndarray, side: int) -> np.ndarray:
    """Neighbour agreement of the grid of that side for every top-left corner (y, x)."""
    h, w = integral.shape[0] - 1, integral.shape[1] - 1
    e = _edges(side)
    ny, nx = h - side + 1, w - side + 1

    def box(y0: int, y1: int, x0: int, x1: int) -> np.ndarray:
        return (
            integral[y1 : y1 + ny, x1 : x1 + nx]
            - integral[y0 : y0 + ny, x1 : x1 + nx]
            - integral[y1 : y1 + ny, x0 : x0 + nx]
            + integral[y0 : y0 + ny, x0 : x0 + nx]
        )

    means = {}
    for r in range(8):
        for c in range(8):
            y0, y1, x0, x1 = e[r], e[r + 1], e[c], e[c + 1]
            # The four corners of a cell show the square itself: pieces are round and centred.
            ky = max(1, round(CORNER * (y1 - y0)))
            kx = max(1, round(CORNER * (x1 - x0)))
            total = box(y0, y0 + ky, x0, x0 + kx) + box(y0, y0 + ky, x1 - kx, x1) + box(y1 - ky, y1, x0, x0 + kx) + box(y1 - ky, y1, x1 - kx, x1)
            means[r, c] = total / (4 * ky * kx)
    agree = np.zeros((ny, nx))
    for r in range(8):
        for c in range(8):
            for dr, dc in ((0, 1), (1, 0)):
                if r + dr > 7 or c + dc > 7:
                    continue
                a, b = means[r, c], means[r + dr, c + dc]
                dark, light = (a, b) if (r + c) % 2 else (b, a)
                agree += dark - light > AGREEMENT_MARGIN
    return agree / 112


def _reduce(values: np.ndarray, s: float) -> np.ndarray:
    """Area average of a 2D array to `s` times its size (like a BOX resize)."""
    h, w = values.shape
    sh, sw = max(8, round(h * s)), max(8, round(w * s))
    ys = np.round(np.arange(sh + 1) * h / sh).astype(int)
    xs = np.round(np.arange(sw + 1) * w / sw).astype(int)
    # Sums of whole numbers are exact in any order; one division at the end (Rust does the same).
    sums = np.add.reduceat(np.add.reduceat(values, ys[:-1], axis=0), xs[:-1], axis=1)
    return sums / (np.diff(ys)[:, None] * np.diff(xs)[None, :])


def _local_maxima(score: np.ndarray, radius: int) -> list[tuple[float, int, int]]:
    padded = np.pad(score, radius, constant_values=-np.inf)
    neighbourhood = np.full_like(score, -np.inf)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx or dy:
                window = padded[radius + dy : radius + dy + score.shape[0], radius + dx : radius + dx + score.shape[1]]
                neighbourhood = np.maximum(neighbourhood, window)
    ys, xs = np.nonzero(score >= neighbourhood)
    return [(float(score[y, x]), int(x), int(y)) for y, x in zip(ys, xs)]


def _overlap(a, b) -> float:
    """Intersection over the smaller area."""
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return w * h / smaller


def detect_boards(image: Image.Image) -> list[tuple[tuple[float, float, float, float], float]]:
    """Grid boxes (x0, y0, x1, y1) in image pixels with their agreement, best first."""
    gray = image.convert("L")
    w, h = gray.size
    s = min(1.0, COARSE / max(w, h))
    # Texture is measured at full resolution, then averaged down: a faint hatching survives as
    # texture energy, while reducing the image first would blur it into plain gray.
    signal = _reduce(_signal(np.asarray(gray, dtype=np.float32)).astype(np.float64), s)
    sh, sw = signal.shape
    integral = np.zeros((sh + 1, sw + 1))
    # Row prefix sums, then down the columns: the same order of additions as the Rust port.
    integral[1:, 1:] = signal.cumsum(1).cumsum(0)

    sides: list[int] = []
    side = max(12.0, MIN_FRACTION * sw)
    while side <= MAX_FRACTION * min(sh, sw):
        if not sides or round(side) != sides[-1]:
            sides.append(round(side))
        side *= SIDE_STEP

    candidates = []
    for side in sides:
        agree = agreement_map(integral, side)
        for value, x, y in _local_maxima(agree, max(1, side // 16)):
            if value >= MIN_AGREEMENT:
                candidates.append((value, side, x, y))
    # Best agreement first; among equals, the larger board (a sub-grid can agree as well).
    candidates.sort(key=lambda c: (-c[0], -c[1]))

    taken = []
    for value, side, x, y in candidates:
        box = (x, y, x + side, y + side)
        if any(_overlap(box, other) > 0.15 for other, _ in taken):
            continue
        taken.append((box, value))

    # Refine each board at full resolution around where it was found (a wider search could jump to
    # a neighbouring board on a dense page).
    full = _integral(_signal(np.asarray(gray, dtype=np.float32)))
    boards = []
    for (x0, y0, x1, y1), value in taken:
        (gx, gy, gw, gh), _ = refine(full, h, w, x0 / s, y0 / s, (x1 - x0) / s, s)
        boards.append(((gx, gy, gx + gw, gy + gh), value))
    return boards
