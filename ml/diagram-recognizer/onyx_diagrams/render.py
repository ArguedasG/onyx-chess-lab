"""Synthetic diagram renderer: printed book diagrams and 2D screen boards.

Everything is drawn at 96 px per square and then reduced to the target resolution, where the
degradations (blur, noise, 1-bit thresholding, JPEG) are applied, as a printer, a scanner or a
video encoder would. Returns a grayscale image and the exact grid box of the 64 squares.
"""

import io
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .positions import placement_grid

HI = 96
BOARD = 8 * HI
PIECE_NAMES = {s: ("w" if s.isupper() else "b") + s.upper() for s in "PNBRQKpnbrqk"}

# Sets that look like book diagrams get more weight in the printed style.
PRINT_WEIGHTS = {"cburnett": 3, "merida": 3, "mpchess": 3, "chessnut": 2, "celtic": 1, "fantasy": 1, "spatial": 1, "pixel": 0.3, "shapes": 0.2, "glyph-freeserif": 3, "glyph-dejavu": 3, "glyph-noto": 3}
SCREEN_WEIGHTS = {"cburnett": 2, "merida": 2, "mpchess": 1, "chessnut": 2, "celtic": 2, "fantasy": 1, "spatial": 2, "pixel": 1, "shapes": 0.3, "glyph-freeserif": 0.5, "glyph-dejavu": 0.5, "glyph-noto": 0.5}

# Sets whose white pieces give a clean inverted black piece (mpchess has an opaque padding,
# celtic has no inner lines).
INVERTIBLE = {"cburnett", "merida", "chessnut", "fantasy", "spatial", "glyph-freeserif", "glyph-dejavu", "glyph-noto"}

SCREEN_PALETTES = [
    ((240, 217, 181), (181, 136, 99)),
    ((238, 238, 210), (118, 150, 86)),
    ((222, 227, 230), (140, 162, 173)),
    ((235, 236, 208), (115, 149, 82)),
    ((255, 206, 158), (209, 139, 71)),
    ((232, 235, 239), (125, 135, 150)),
    ((240, 240, 240), (170, 170, 170)),
    ((227, 193, 111), (184, 139, 74)),
]
ARROW_COLORS = [(21, 120, 27), (136, 32, 32), (0, 48, 136), (230, 143, 0)]


@dataclass
class Rendered:
    image: Image.Image  # mode "L"
    grid: tuple[float, float, float, float]
    flipped: bool
    style: str
    piece_set: str
    square_px: float


class Sprites:
    def __init__(self, root: Path):
        self.root = root
        self.cache: dict[tuple, Image.Image] = {}

    def _inverted(self, piece_set: str, symbol: str, size: tuple[int, int]) -> Image.Image:
        """A black piece drawn as diagram fonts often do: the white piece's silhouette filled with
        black and its inner lines in white (Alpha-like style)."""
        white = Image.open(self.root / piece_set / f"{PIECE_NAMES[symbol.upper()]}.png").convert("RGBA").resize(size, Image.Resampling.LANCZOS)
        alpha = np.asarray(white)[:, :, 3] > 40
        lines = (np.asarray(white.convert("L")) < 140) & alpha
        padded = Image.new("L", (size[0] + 2, size[1] + 2), 0)
        padded.paste(Image.fromarray((alpha * 255).astype(np.uint8)), (1, 1))
        ImageDraw.floodfill(padded, (0, 0), 128)
        sil = np.asarray(padded)[1:-1, 1:-1] != 128
        k = max(3, 2 * round(min(size) * 0.03) + 1)
        inner = np.asarray(Image.fromarray((sil * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k))) > 0
        rgb = np.where(lines & inner, 255, 0).astype(np.uint8)
        a = (sil * 255).astype(np.uint8)
        return Image.merge("RGBA", [Image.fromarray(rgb)] * 3 + [Image.fromarray(a)])

    def get(
        self,
        piece_set: str,
        symbol: str,
        px: int,
        ink: bool,
        weight: int = 0,
        inverted: bool = False,
        aspect: tuple[float, float] = (1.0, 1.0),
    ) -> Image.Image:
        """`weight` thickens (> 0) or thins (< 0) the black ink of `ink` sprites, in pixels.
        `inverted` draws black pieces in the inverted style; `aspect` scales width and height."""
        inverted = inverted and symbol.islower() and piece_set in INVERTIBLE
        key = (piece_set, symbol, px, ink, weight, inverted, aspect)
        if key not in self.cache:
            size = (max(4, round(px * aspect[0])), max(4, round(px * aspect[1])))
            if inverted:
                im = self._inverted(piece_set, symbol, size)
            else:
                im = Image.open(self.root / piece_set / f"{PIECE_NAMES[symbol]}.png").convert("RGBA")
                im = im.resize(size, Image.Resampling.LANCZOS)
            if ink:
                # Printed fonts: pure black and white, no shading.
                lum = np.asarray(im.convert("L"))
                alpha = np.asarray(im)[:, :, 3]
                rgb = np.where(lum < 140, 0, 255).astype(np.uint8)
                a = np.where(alpha > 110, 255, 0).astype(np.uint8)
                im = Image.merge("RGBA", [Image.fromarray(rgb)] * 3 + [Image.fromarray(a)])
                if weight:
                    filt = ImageFilter.MinFilter if weight > 0 else ImageFilter.MaxFilter
                    im = Image.merge("RGBA", [Image.fromarray(rgb).filter(filt(2 * abs(weight) + 1))] * 3 + [Image.fromarray(a)])
            self.cache[key] = im
        return self.cache[key]


def _choice(rng: np.random.Generator, weights: dict[str, float], allowed: list[str]) -> str:
    names = [n for n in allowed if weights.get(n, 0) > 0] or allowed
    w = np.array([weights.get(n, 1.0) for n in names], dtype=float)
    return names[int(rng.choice(len(names), p=w / w.sum()))]


def _font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=max(6, px))


def _dark_pattern(rng: np.random.Generator, paper: int, ink: int) -> Image.Image:
    """Grayscale fill for the dark squares, as large as the board."""
    kind = rng.choice(["hatch", "hatch", "hatch", "flat", "dots", "cross"])
    if kind == "flat":
        return Image.new("L", (BOARD, BOARD), int(rng.integers(120, 215)))
    im = Image.new("L", (BOARD, BOARD), paper)
    d = ImageDraw.Draw(im)
    spacing = HI / rng.uniform(6, 15)
    width = max(1, int(round(spacing * rng.uniform(0.18, 0.45))))
    if kind == "dots":
        r = spacing * rng.uniform(0.15, 0.3)
        for y in np.arange(0, BOARD, spacing):
            for x in np.arange((y / spacing % 2) * spacing / 2, BOARD, spacing):
                d.ellipse((x - r, y - r, x + r, y + r), fill=ink)
        return im
    angles = [rng.choice([45, 135])] if kind == "hatch" else [45, 135]
    for angle in angles:
        for k in np.arange(-BOARD, 2 * BOARD, spacing):
            if angle == 45:
                d.line((k, 0, k + BOARD, BOARD), fill=ink, width=width)
            else:
                d.line((k, BOARD, k + BOARD, 0), fill=ink, width=width)
    return im


def _coords_outside(d: ImageDraw.ImageDraw, margin: int, flipped: bool, ink: int, rng) -> None:
    font = _font(int(HI * rng.uniform(0.2, 0.32)))
    files = "abcdefgh"[::-1] if flipped else "abcdefgh"
    ranks = "12345678" if flipped else "87654321"
    for i in range(8):
        cx = margin + (i + 0.5) * HI
        d.text((cx, margin + BOARD + margin * 0.45), files[i], fill=ink, font=font, anchor="mm")
        d.text((margin * 0.5, margin + (i + 0.5) * HI), ranks[i], fill=ink, font=font, anchor="mm")


def procedural_pawn(params: dict, white: bool, px: int) -> Image.Image:
    """A pawn drawn from simple parts (head, neck, collar, body, base) with given proportions.

    Fonts draw pawns in many ways (round and squat, or tall with a thin neck and a disc collar, as
    in Alpha); sampling the proportions covers designs that no free set has. White pawns are
    white with a black outline, black pawns are filled black (optionally with a white collar line).
    """
    S = 256
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = S / 2
    base_y1 = S * 0.94
    base_y0 = base_y1 - S * params["base_h"]
    body_top = base_y0 - S * params["body_h"]
    collar_y = body_top - S * params["collar_h"] / 2
    head_r = S * params["head_r"]
    head_cy = collar_y - S * params["neck_h"] - head_r
    fill, line = ((255, 255, 255, 255), (0, 0, 0, 255)) if white else ((0, 0, 0, 255), (0, 0, 0, 255))
    w = max(2, round(S * params["stroke"]))
    bw = S * params["base_w"] / 2
    d.rounded_rectangle((cx - bw, base_y0, cx + bw, base_y1), radius=S * 0.02, fill=fill, outline=line, width=w)
    tw, bw2 = S * params["body_top_w"] / 2, S * params["body_bot_w"] / 2
    d.polygon([(cx - tw, body_top), (cx + tw, body_top), (cx + bw2, base_y0 + w), (cx - bw2, base_y0 + w)], fill=fill, outline=line, width=w)
    nw = S * params["neck_w"] / 2
    d.rectangle((cx - nw, head_cy + head_r * 0.6, cx + nw, collar_y), fill=fill, outline=line, width=w)
    cw, ch = S * params["collar_w"] / 2, S * params["collar_h"] / 2
    d.ellipse((cx - cw, collar_y - ch, cx + cw, collar_y + ch), fill=fill, outline=line, width=w)
    d.ellipse((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), fill=fill, outline=line, width=w)
    if not white and params["inner_line"]:
        d.line((cx - cw * 0.7, collar_y, cx + cw * 0.7, collar_y), fill=(255, 255, 255, 255), width=max(1, w // 2))
    return im.resize((px, px), Image.Resampling.LANCZOS)


def sample_pawn(rng) -> dict:
    return {
        "head_r": rng.uniform(0.1, 0.16),
        "neck_h": rng.uniform(0.02, 0.1),
        "neck_w": rng.uniform(0.08, 0.16),
        "collar_w": rng.uniform(0.2, 0.42),
        "collar_h": rng.uniform(0.04, 0.09),
        "body_h": rng.uniform(0.24, 0.42),
        "body_top_w": rng.uniform(0.1, 0.22),
        "body_bot_w": rng.uniform(0.3, 0.55),
        "base_h": rng.uniform(0.04, 0.12),
        "base_w": rng.uniform(0.42, 0.72),
        "stroke": rng.uniform(0.02, 0.045),
        "inner_line": bool(rng.random() < 0.5),
    }


def _paste_pieces(
    canvas: Image.Image,
    symbols: list[str],
    origin: int,
    sprites: Sprites,
    piece_set: str,
    rng,
    ink: bool,
    scale_range: tuple[float, float],
    halo: tuple[int, int] | None = None,
) -> None:
    """`halo` = (width px, paper level): printed diagrams cut a paper-colored margin around the
    pieces that stand on dark (hatched) squares, so the piece does not merge with the pattern."""
    scale = rng.uniform(*scale_range)
    px = int(HI * scale)
    weight = int(rng.choice([-1, 0, 0, 1, 2])) if ink else 0
    inverted = ink and rng.random() < 0.35
    aspect = (float(rng.uniform(0.82, 1.05)), float(rng.uniform(0.95, 1.1))) if rng.random() < 0.5 else (1.0, 1.0)
    aspect = (round(aspect[0], 2), round(aspect[1], 2))
    pawn = sample_pawn(rng) if rng.random() < (0.35 if ink else 0.1) else None
    pawn_sprites = {}
    for i, s in enumerate(symbols):
        if s == ".":
            continue
        r, c = divmod(i, 8)
        if pawn and s in "Pp":
            if s not in pawn_sprites:
                pawn_sprites[s] = procedural_pawn(pawn, s == "P", px)
            sprite = pawn_sprites[s]
        else:
            sprite = sprites.get(piece_set, s, px, ink, weight, inverted, aspect)
        jx, jy = rng.normal(0, HI * 0.012, 2)
        x = int(origin + c * HI + (HI - sprite.width) / 2 + jx)
        y = int(origin + r * HI + (HI - sprite.height) / 2 + jy)
        if halo and (r + c) % 2 == 1:
            width, paper = halo
            alpha = sprite.getchannel("A").point(lambda v: 255 if v > 40 else 0)
            mask = alpha.filter(ImageFilter.MaxFilter(2 * width + 1))
            canvas.paste(Image.new("RGBA", sprite.size, (paper, paper, paper, 255)), (x, y), mask)
        canvas.alpha_composite(sprite, (x, y))


def _markers(d: ImageDraw.ImageDraw, symbols: list[str], origin: int, ink: int, rng) -> None:
    """Teaching marks on empty squares (stars, crosses, dots, numbers): still empty squares."""
    empty = [i for i, s in enumerate(symbols) if s == "."]
    kind = rng.choice(["star", "cross", "dot", "number"])
    font = _font(int(HI * 0.45))
    for i in rng.choice(empty, min(len(empty), int(rng.integers(1, 6))), replace=False):
        r, c = divmod(int(i), 8)
        cx, cy = origin + (c + 0.5) * HI, origin + (r + 0.5) * HI
        k = HI * rng.uniform(0.18, 0.3)
        if kind == "star":
            pts = [(cx + (k if j % 2 == 0 else k * 0.45) * math.sin(j * math.pi / 5), cy - (k if j % 2 == 0 else k * 0.45) * math.cos(j * math.pi / 5)) for j in range(10)]
            d.polygon(pts, fill=(ink,) * 3)
        elif kind == "cross":
            w = max(2, int(HI * 0.06))
            d.line((cx - k, cy - k, cx + k, cy + k), fill=(ink,) * 3, width=w)
            d.line((cx - k, cy + k, cx + k, cy - k), fill=(ink,) * 3, width=w)
        elif kind == "dot":
            d.ellipse((cx - k / 2, cy - k / 2, cx + k / 2, cy + k / 2), fill=(ink,) * 3)
        else:
            d.text((cx, cy), str(int(rng.integers(1, 30))), fill=(ink,) * 3, font=font, anchor="mm")


def _degrade(im: Image.Image, rng, print_style: bool, paper: int, ink: int) -> Image.Image:
    if rng.random() < 0.5:
        im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 1.0)))
    if print_style and rng.random() < 0.25:
        # 1-bit images (JBIG2 / CCITT in scanned books). Gray becomes a dot pattern, never white:
        # a plain threshold would erase flat gray dark squares.
        # The paper level is stretched to pure white first, as a scanner's threshold would.
        shift = rng.uniform(-25, 25)
        im = im.point(lambda v: int(np.clip(v * 255 / max(paper, 1) + shift, 0, 255))).convert("1").convert("L")
    a = np.asarray(im, dtype=np.float32)
    if rng.random() < 0.5:
        a = a + rng.normal(0, rng.uniform(2, 12), a.shape)
    if rng.random() < 0.3:
        gamma = rng.uniform(0.7, 1.4)
        a = 255 * (np.clip(a, 0, 255) / 255) ** gamma
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if rng.random() < (0.4 if print_style else 0.6):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=int(rng.integers(20 if not print_style else 30, 92)))
        im = Image.open(io.BytesIO(buf.getvalue())).convert("L")
    return im


def _reduce(im: Image.Image, square_px: float, rng) -> tuple[Image.Image, float]:
    scale = square_px / HI
    size = (max(8, round(im.width * scale)), max(8, round(im.height * scale)))
    method = rng.choice([Image.Resampling.BOX, Image.Resampling.BILINEAR, Image.Resampling.LANCZOS])
    return im.resize(size, method), size[0] / im.width


def render_print(board_fen: str, rng, sprites: Sprites, sets: list[str]) -> Rendered:
    piece_set = _choice(rng, PRINT_WEIGHTS, sets)
    flipped = rng.random() < 0.15
    symbols = placement_grid(board_fen)
    symbols = symbols[::-1] if flipped else symbols
    paper = int(rng.integers(225, 256))
    ink = int(rng.integers(0, 60))
    margin = int(HI * rng.uniform(0.15, 0.7))
    halo = (int(HI * rng.uniform(0.02, 0.07)), paper) if rng.random() < 0.6 else None
    size = BOARD + 2 * margin

    canvas = Image.new("RGBA", (size, size), (paper,) * 3 + (255,))
    dark = _dark_pattern(rng, paper, ink)
    light_level = paper if rng.random() < 0.85 else int(rng.integers(215, 250))
    board = Image.new("L", (BOARD, BOARD), light_level)
    mask = Image.new("L", (BOARD, BOARD), 0)
    md = ImageDraw.Draw(mask)
    for r in range(8):
        for c in range(8):
            if (r + c) % 2 == 1:
                md.rectangle((c * HI, r * HI, (c + 1) * HI - 1, (r + 1) * HI - 1), fill=255)
    board.paste(dark, (0, 0), mask)
    canvas.paste(Image.merge("RGBA", [board] * 3 + [Image.new("L", board.size, 255)]), (margin, margin))

    _paste_pieces(canvas, symbols, margin, sprites, piece_set, rng, ink=rng.random() < 0.5, scale_range=(0.78, 0.98), halo=halo)

    d = ImageDraw.Draw(canvas)
    if rng.random() < 0.15:
        _markers(d, symbols, margin, ink, rng)
    if rng.random() < 0.85:
        t = int(rng.integers(1, 9))
        d.rectangle((margin - t, margin - t, margin + BOARD + t - 1, margin + BOARD + t - 1), outline=(ink,) * 3, width=t)
        if rng.random() < 0.25:
            g = int(rng.integers(3, 9))
            d.rectangle((margin - t - g - 2, margin - t - g - 2, margin + BOARD + t + g + 1, margin + BOARD + t + g + 1), outline=(ink,) * 3, width=2)
    if rng.random() < 0.5 and margin > HI * 0.3:
        _coords_outside(d, margin, flipped, ink, rng)
    if rng.random() < 0.2:
        # Side-to-move mark next to the board.
        y = margin + (BOARD - HI * 0.3 if rng.random() < 0.5 else 0)
        x = margin + BOARD + margin * 0.2
        d.polygon([(x, y), (x + HI * 0.25, y + HI * 0.15), (x, y + HI * 0.3)], fill=(ink,) * 3)

    im = canvas.convert("L")
    if rng.random() < 0.2:
        # Faded print (light gray ink, as in some ClearScan backgrounds).
        k = rng.uniform(0.35, 0.75)
        im = im.point(lambda v: int(paper - (paper - v) * k))
    if rng.random() < 0.1:
        im = im.rotate(rng.uniform(-0.8, 0.8), resample=Image.Resampling.BILINEAR, fillcolor=paper)
    square_px = float(np.exp(rng.uniform(np.log(18), np.log(90))))
    im, s = _reduce(im, square_px, rng)
    im = _degrade(im, rng, True, paper, ink)
    grid = (margin * s, margin * s, (margin + BOARD) * s, (margin + BOARD) * s)
    return Rendered(im, grid, flipped, "print", piece_set, square_px)


def _arrow(d: ImageDraw.ImageDraw, a: tuple[float, float], b: tuple[float, float], color, width: float) -> None:
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    head = width * 2.2
    tip = b
    base = (b[0] - head * math.cos(ang), b[1] - head * math.sin(ang))
    d.line((a, base), fill=color, width=int(width))
    left = (base[0] + head * 0.9 * math.sin(ang), base[1] - head * 0.9 * math.cos(ang))
    right = (base[0] - head * 0.9 * math.sin(ang), base[1] + head * 0.9 * math.cos(ang))
    d.polygon([tip, left, right], fill=color)


def render_screen(board_fen: str, rng, sprites: Sprites, sets: list[str]) -> Rendered:
    piece_set = _choice(rng, SCREEN_WEIGHTS, sets)
    flipped = rng.random() < 0.25
    symbols = placement_grid(board_fen)
    symbols = symbols[::-1] if flipped else symbols
    light, dark = SCREEN_PALETTES[int(rng.integers(len(SCREEN_PALETTES)))]
    jitter = rng.integers(-18, 19, 6)
    light = tuple(int(np.clip(v + j, 0, 255)) for v, j in zip(light, jitter[:3]))
    dark = tuple(int(np.clip(v + j, 0, 255)) for v, j in zip(dark, jitter[3:]))
    margin = 0 if rng.random() < 0.5 else int(HI * rng.uniform(0.05, 0.6))
    bg = tuple(int(v) for v in rng.integers(20, 80, 3)) if rng.random() < 0.6 else (245, 245, 245)
    size = BOARD + 2 * margin

    canvas = Image.new("RGBA", (size, size), bg + (255,))
    d = ImageDraw.Draw(canvas)
    for r in range(8):
        for c in range(8):
            x, y = margin + c * HI, margin + r * HI
            d.rectangle((x, y, x + HI - 1, y + HI - 1), fill=(dark if (r + c) % 2 else light) + (255,))
    if rng.random() < 0.3:
        # Texture (wood or marble look).
        noise = rng.normal(0, rng.uniform(4, 14), (BOARD // 8, BOARD // 8))
        tex = Image.fromarray(np.clip(128 + noise, 0, 255).astype(np.uint8)).resize((BOARD, BOARD), Image.Resampling.BICUBIC)
        layer = Image.merge("RGBA", [tex] * 3 + [Image.new("L", tex.size, int(rng.integers(30, 80)))])
        canvas.alpha_composite(layer, (margin, margin))

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    sq = lambda i: (margin + (i % 8) * HI, margin + (i // 8) * HI)  # noqa: E731
    if rng.random() < 0.6:
        color = [(205, 210, 106), (155, 199, 0), (20, 85, 30), (99, 168, 225)][int(rng.integers(4))]
        for i in rng.choice(64, 2, replace=False):
            x, y = sq(int(i))
            od.rectangle((x, y, x + HI - 1, y + HI - 1), fill=color + (int(rng.integers(90, 150)),))
    if rng.random() < 0.08:
        kings = [i for i, s in enumerate(symbols) if s in "Kk"]
        if kings:
            x, y = sq(kings[0])
            for k in range(6, 0, -1):
                g = HI * (1 - k / 7) / 2
                od.ellipse((x + g, y + g, x + HI - g, y + HI - g), fill=(255, 0, 0, 40))
    canvas.alpha_composite(overlay)

    _paste_pieces(canvas, symbols, margin, sprites, piece_set, rng, ink=False, scale_range=(0.85, 1.0))

    top = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    if rng.random() < 0.15:
        for i in rng.choice(64, int(rng.integers(2, 8)), replace=False):
            x, y = sq(int(i))
            if symbols[int(i)] == ".":
                rr = HI * 0.14
                td.ellipse((x + HI / 2 - rr, y + HI / 2 - rr, x + HI / 2 + rr, y + HI / 2 + rr), fill=(20, 85, 30, 90))
            else:
                td.ellipse((x + 2, y + 2, x + HI - 3, y + HI - 3), outline=(20, 85, 30, 90), width=int(HI * 0.08))
    if rng.random() < 0.35:
        for _ in range(int(rng.integers(1, 4))):
            a, b = rng.choice(64, 2, replace=False)
            (ax, ay), (bx, by) = sq(int(a)), sq(int(b))
            color = ARROW_COLORS[int(rng.integers(len(ARROW_COLORS)))] + (int(rng.integers(120, 210)),)
            _arrow(td, (ax + HI / 2, ay + HI / 2), (bx + HI / 2, by + HI / 2), color, HI * rng.uniform(0.12, 0.22))
    if rng.random() < 0.6:
        font = _font(int(HI * rng.uniform(0.16, 0.24)))
        files = "abcdefgh"[::-1] if flipped else "abcdefgh"
        ranks = "12345678" if flipped else "87654321"
        for i in range(8):
            x, y = sq(56 + i)
            td.text((x + HI * 0.92, y + HI * 0.95), files[i], fill=(dark if i % 2 == 0 else light) + (255,), font=font, anchor="rb")
            x, y = sq(i * 8)
            td.text((x + HI * 0.06, y + HI * 0.04), ranks[i], fill=(dark if i % 2 == 0 else light) + (255,), font=font, anchor="lt")
    canvas.alpha_composite(top)

    im = canvas.convert("L")
    square_px = float(np.exp(rng.uniform(np.log(20), np.log(110))))
    im, s = _reduce(im, square_px, rng)
    im = _degrade(im, rng, False, 255, 0)
    grid = (margin * s, margin * s, (margin + BOARD) * s, (margin + BOARD) * s)
    return Rendered(im, grid, flipped, "screen", piece_set, square_px)


def render(board_fen: str, rng, sprites: Sprites, sets: list[str], print_share: float = 0.6) -> Rendered:
    if rng.random() < print_share:
        return render_print(board_fen, rng, sprites, sets)
    return render_screen(board_fen, rng, sprites, sets)
