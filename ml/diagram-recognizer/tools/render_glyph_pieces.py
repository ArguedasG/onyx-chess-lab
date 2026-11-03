"""Piece sets drawn from the Unicode chess glyphs (U+2654–U+265F) of free fonts.

These glyphs imitate book diagrams: white pieces are outlines, black pieces are filled. A white
glyph's interior is transparent in the font, so it is filled with white (its silhouette with the
holes closed), as a diagram font does over a hatched square.

Fonts (downloaded from their official sources to data/fonts-download/):
- GNU FreeFont (FreeSerif; FreeSans has no chess glyphs): GPL-3.0-or-later with font exception;
- DejaVu Sans: Bitstream Vera license (permissive);
- Noto Sans Symbols 2: SIL Open Font License 1.1.

Usage: python tools/render_glyph_pieces.py [--fonts data/fonts-download] [--out data/pieces]
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SIZE = 256
GLYPHS = {"wK": "♔", "wQ": "♕", "wR": "♖", "wB": "♗", "wN": "♘", "wP": "♙", "bK": "♚", "bQ": "♛", "bR": "♜", "bB": "♝", "bN": "♞", "bP": "♟"}
FONTS = {
    "glyph-freeserif": ("FreeSerif.otf", "GPL-3.0-or-later WITH Font-exception-2.0"),
    "glyph-dejavu": ("DejaVuSans.ttf", "Bitstream-Vera"),
    "glyph-noto": ("NotoSansSymbols2-Regular.ttf", "OFL-1.1"),
}


def glyph_mask(font: ImageFont.FreeTypeFont, ch: str) -> np.ndarray:
    """Glyph coverage (0–255) centred in a SIZE × SIZE square, sized to ~90 % of it."""
    canvas = Image.new("L", (SIZE * 2, SIZE * 2), 0)
    ImageDraw.Draw(canvas).text((SIZE, SIZE), ch, font=font, fill=255, anchor="mm")
    box = canvas.getbbox()
    glyph = canvas.crop(box)
    scale = SIZE * 0.9 / max(glyph.size)
    glyph = glyph.resize((max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))), Image.Resampling.LANCZOS)
    out = Image.new("L", (SIZE, SIZE), 0)
    out.paste(glyph, ((SIZE - glyph.width) // 2, (SIZE - glyph.height) // 2))
    return np.asarray(out)


def silhouette(mask: np.ndarray) -> np.ndarray:
    """Closes the holes of a glyph: everything not reachable from the border is inside."""
    ink = Image.fromarray(np.where(mask > 100, 255, 0).astype(np.uint8))
    padded = Image.new("L", (SIZE + 2, SIZE + 2), 0)
    padded.paste(ink, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    outside = np.asarray(padded)[1:-1, 1:-1] == 128
    return np.where(outside, 0, 255).astype(np.uint8)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--fonts", default="data/fonts-download")
    p.add_argument("--out", default="data/pieces")
    a = p.parse_args()
    out = Path(a.out)
    manifest_path = out / "pieces.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for name, (file, license_id) in FONTS.items():
        font_path = Path(a.fonts) / file
        font = ImageFont.truetype(str(font_path), int(SIZE * 1.2))
        (out / name).mkdir(parents=True, exist_ok=True)
        for piece, ch in GLYPHS.items():
            mask = glyph_mask(font, ch)
            if piece.startswith("w"):
                fill = silhouette(mask)
                lum = np.where(mask > 0, 255 - mask, 255).astype(np.uint8)
                alpha = np.maximum(fill, mask)
            else:
                lum = np.zeros_like(mask)
                alpha = mask
            rgba = np.dstack([lum, lum, lum, alpha])
            Image.fromarray(rgba, "RGBA").save(out / name / f"{piece}.png")
        manifest[name] = {"license": license_id, "source": f"font:{file}", "fontSha256": hashlib.sha256(font_path.read_bytes()).hexdigest()}
        print(name, license_id)
    manifest_path.write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
