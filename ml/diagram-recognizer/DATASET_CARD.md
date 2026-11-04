# Dataset card — diagram squares (synthetic)

Dataset used to train the diagram recognizer of Onyx Chess Lab (I-56, phase 9.4). It is fully
synthetic and can be rebuilt bit for bit from this folder, the free piece sets and the Lichess
puzzle database.

## Summary

| Field       | Value                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Task        | Classify one square of a chess diagram: empty or one of the 12 pieces (13 classes)               |
| Unit        | One 48 × 48 grayscale square cut from a rendered board (see `onyx_diagrams/squares.py`)          |
| Generator   | `tools/generate.py` + `onyx_diagrams/render.py`, deterministic for a seed                        |
| Positions   | Lichess puzzle database (CC0), as-is or after the first move; 7 % opening positions, 8 % thinned |
| Real images | **None.** No book, screenshot or photo is part of the data                                       |
| License     | Generated images: GPL-3.0-only, like Onyx. Positions: CC0. Piece sets: see below                 |

## Versions

| Version | Date       | Boards (train / val / test / heldout) | Why it changed                                                                                                                                                                                                                                               |
| ------- | ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1      | 2026-11-02 | 9 000 / 600 / 1 000 / 600             | First version. Stopped after 1.2 epochs: on real books, black pieces on hatched squares read as white kings                                                                                                                                                  |
| v2      | 2026-11-02 | same                                  | + paper halo around pieces on dark squares, faded print, teaching marks, clean 1-bit dithering. Piece _type_ still confused on Everyman (Alpha-font) books                                                                                                   |
| v3      | 2026-11-02 | same                                  | + three print-style sets from the Unicode chess glyphs of free fonts, ink weight variation. Black king still read as white (Alpha's black pieces have large white inner lines)                                                                               |
| v4      | 2026-11-02 | same                                  | + "inverted" black pieces (white piece silhouette in black with its inner lines in white), width/height variation                                                                                                                                            |
| v5      | 2026-11-02 | same                                  | + procedural pawns (head, neck, collar, body and base with random proportions) in 35 % of printed boards: Alpha-style pawns still read as bishops or rooks in v4                                                                                             |
| v6      | 2026-11-03 | 12 000 / 600 / 1 000 / 600            | + the 8 sets of sadsnake1, used with permission (maestro, Onyx's default set, was misread in screenshots of Onyx itself); more training boards for the larger set pool                                                                                       |
| v7      | 2026-11-03 | same as v6                            | The 4 shaded sets (staunty, tatiana, gioco, dubrovny) only in the screen style: as ink they become solid black pieces, and v6 read Alpha's black king (white inner lines) as white                                                                           |
| v8      | 2026-11-03 | same as v6                            | New dark-square fills in the printed style: broken hatching (faint, fragmentary lines, as in poorly inked or scanned books), stipple, marble and wood, the last three sometimes faint on the light squares too; bevelled 3D squares in 15 % of screen boards |

All versions share the seed 20261102 and therefore the same positions (v6 draws 3 000 more for
training, which shifts the later splits); only the rendering changed. Each run keeps a copy of its `dataset.json` in `runs/<version>/` (v3's was not kept).

## Splits

- **train / val:** the training piece sets (12 up to v5, 20 from v6); empty squares kept with
  probability 0.3 (they are ~60 % of a board) so that the classes are less unbalanced.
- **test:** same distribution as training, new positions, all 64 squares per board (board
  accuracy).
- **heldout:** one piece set never used in training (`pirouetti`), all 64 squares. It measures
  generalization to an unseen drawing style.

## Rendering

Every board is drawn at 96 px per square and reduced to its target size, where the
degradations happen, as a printer, a scanner or a video encoder would.

| Style  | Share | Square size | What varies                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ----: | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print  |  60 % | 18–90 px    | Dark squares hatched, cross-hatched, dotted or flat gray; pure black-and-white "font" pieces with thinner or bolder ink; paper halo around pieces on dark squares; inverted black pieces; narrower or taller pieces; teaching marks on empty squares; frames; outer coordinates; side-to-move mark; faded ink, blur, noise, gamma, 1-bit dithering (JBIG2), JPEG, small rotation |
| Screen |  40 % | 20–110 px   | Board palettes and textures; last-move and check highlights; move dots and capture rings; arrows over pieces; inner coordinates; dark margins; JPEG (video)                                                                                                                                                                                                                      |

Both styles: 15–25 % of the boards seen from Black's side; pieces scaled 78–100 % of the square
with a small offset; the grid box is cut with simulated detection error (±1.2 % of the board,
plus ±3 % per square).

## Piece sets (license audit, 2026-11-02)

Licenses as listed in lichess-org/lila `COPYING.md`. Only sets compatible with GPLv3 are used.

| Set             | License                                  | Source                                | Split   |
| --------------- | ---------------------------------------- | ------------------------------------- | ------- |
| cburnett        | GPL-2.0-or-later                         | Onyx (`public/pieces`)                | train   |
| merida          | GPL-2.0-or-later                         | Onyx                                  | train   |
| chessnut        | Apache-2.0                               | Onyx                                  | train   |
| fantasy         | MIT                                      | Onyx                                  | train   |
| spatial         | MIT                                      | Onyx                                  | train   |
| pixel           | AGPL-3.0-or-later                        | Onyx                                  | train   |
| shapes          | CC-BY-SA-4.0                             | Onyx                                  | train   |
| mpchess         | GPL-3.0-or-later                         | lila, pinned commit                   | train   |
| celtic          | MIT                                      | lila, pinned commit                   | train   |
| pirouetti       | AGPL-3.0-or-later                        | Onyx                                  | heldout |
| glyph-freeserif | GPL-3.0-or-later WITH Font-exception-2.0 | GNU FreeFont (FreeSerif.otf), from v3 | train   |
| glyph-dejavu    | Bitstream-Vera                           | DejaVu Sans 2.37, from v3             | train   |
| glyph-noto      | OFL-1.1                                  | Noto Sans Symbols 2, from v3          | train   |
| maestro         | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| staunty         | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| cardinal        | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| tatiana         | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| fresca          | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| gioco           | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| dubrovny        | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |
| icpieces        | CC-BY-NC-SA-4.0, with permission         | Onyx, from v6                         | train   |

The `glyph-*` sets are drawn by `tools/render_glyph_pieces.py` from the chess glyphs
(U+2654–U+265F) of the fonts; white glyphs get their silhouette filled with white. GNU FreeSans was
tried and has no chess glyphs.

**Permission for the sadsnake1 sets.** maestro, staunty, cardinal, tatiana, fresca, gioco,
dubrovny and icpieces are by sadsnake1 under CC BY-NC-SA 4.0, which on its own is not compatible
with a GPL model. On 2026-11-02 their author answered the Onyx author's request (via Buy Me a
Coffee): _"Yes, use the sets. I am happy if more people will use the piece sets."_ They are used
as training data from v6 (model 1.1.0) on the strength of that permission; the sets themselves are
not redistributed by the model.

Excluded: the other CC BY-NC-SA sets (horsey, california, anarcandy, disguised), the "freeware" ones without a free license
(alpha, leipzig, companion, chess7, reillycraig, riohacha) and those whose license could not be
verified (governor, kosal, libra). `data/pieces/pieces.json` keeps the SHA-256 of every SVG.

## Known limits

- Diagram fonts used by publishers (Diagram TT, Alpha, Leipzig…) are not free and are not drawn;
  their traits (halo, inverted black pieces, print glyphs) are imitated, and generalization to
  them is measured on the private set.
- No photos of real boards, no perspective, no strong rotation: out of scope (I-58).
- Board drawn only as a full 8 × 8 grid; partial diagrams are out of scope.
- v1 only: in 1-bit mode a flat gray dark square could turn white (~1.5 % of the boards). Fixed
  from v2 (dithering instead of a threshold).

## Private evaluation set

Crops of the author's own books, used **only** to measure the model: never for training, never
shared, never committed (`private-eval/`, ignored by git).
