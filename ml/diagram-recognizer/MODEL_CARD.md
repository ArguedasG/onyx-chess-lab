# Model card — diagram-squares 1.1.0

Square classifier of the Onyx Chess Lab diagram recognizer (I-56, phase 9.4). Files:
`models/1.1.0/` (ONNX, manifest, parity reference, training and evaluation records). The previous
version, 1.0.0, stays in `models/1.0.0/` for comparison; the app ships only 1.1.0.

## What it does

Given one square of a chess diagram (48 × 48 grayscale), it returns 13 logits: empty or one of
the 12 pieces. A board is read as a batch of 64 squares; the grid is found beforehand by
`onyx_diagrams/locate.py` (checkerboard contrast, no model), and the board is then checked with
chess rules.

| Field           | Value                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Architecture    | `SquareNet`: 7 conv 3 × 3 + BN + ReLU in 4 blocks (16-32-64-128), global average, linear            |
| Parameters      | 293 053 (1.17 MB ONNX, FP32, opset 17)                                                              |
| Runtime in Onyx | `rten` 0.24 (pure Rust, no DLL): 36 ms per board on an i5-1135G7                                    |
| Training data   | Synthetic only, dataset v7 (see `DATASET_CARD.md`)                                                  |
| Training        | 3 epochs, AdamW, one-cycle LR 3e-3, batch 256, label smoothing 0.02, seed 7; CPU, ~39 min           |
| Calibration     | Temperature 0.627 (fit on validation, minimum NLL)                                                  |
| Review rule     | A board is "to review" if any square has calibrated confidence < 0.95, or if it breaks a chess rule |
| License         | GPL-3.0-only, like Onyx                                                                             |

The exact preprocessing (crop, area resize, scaling) is in the manifest
(`diagram-squares-1.1.0.json`). The runtime must follow it to the letter.

## What changed in 1.1.0

- Trained with the 8 piece sets of sadsnake1 (maestro, staunty, cardinal, tatiana, fresca, gioco,
  dubrovny, icpieces), used with their author's permission (2026-11-02, see the dataset card).
  maestro is Onyx's default set, so screenshots of Onyx itself are now read.
- 12 000 training boards instead of 9 000, for the larger pool of 20 sets.
- An intermediate dataset (v6) used the 4 shaded sets also in the printed style; as ink they
  become solid black pieces, and the model read Alpha's black king (white inner lines) as white.
  v7 keeps them for the screen style only. v6 was not published.

## Parity

`parity.input.u8` (one real test board) and `parity.logits.f32` (PyTorch logits).

| Pair                   | Max abs difference |
| ---------------------- | -----------------: |
| PyTorch ↔ ONNX Runtime |             1.9e-6 |
| ONNX Runtime ↔ `rten`  |       below 1e-4 ¹ |

Tolerance: 1e-4 and the same argmax on every square. ¹ Checked by `cargo test diagram::` on the
parity board and the six fixture boards (`src-tauri/fixtures/diagram/`).

## Evaluation

### Synthetic (reproducible)

| Split                      | Squares | Exact boards |    ECE | Flagged at 0.95 |           Exact among accepted |
| -------------------------- | ------: | -----------: | -----: | --------------: | -----------------------------: |
| test (training piece sets) | 99.85 % |       94.0 % | 0.0006 |          16.1 % |                        99.64 % |
| — print style              | 99.77 % |       92.0 % |        |                 |                                |
| — screen style             | 99.95 % |       96.7 % |        |                 |                                |
| heldout (unseen set)       | 91.25 % |        0.0 % | 0.0701 |          99.5 % | (3 of 600 accepted, all wrong) |

By source resolution (test): 99.68 % at 18–25 px per square, 99.84 % at 25–35 px, ≥ 99.85 % above.

Against 1.0.0 on the v7 test boards, which include the new sets, 1.0.0 gets 99.42 % of the squares
and 80.7 % of the boards exactly, and flags 39.9 % (on the new sets alone: 96.4–99.6 % of the
squares). The new sets are read at 99.77–100 % by 1.1.0.

The heldout set (`pirouetti`) has pawns, bishops and kings drawn unlike any training set; the
model reads them as other pieces. It shows the main limit of the model: **a piece design far
from everything it has seen is misread**, and calibration alone does not catch every case.
The chess rules (one king per side, pawns not on the edge ranks, counts) are the second net.

### Private (the author's books, never shared)

394 embedded diagram images from 14 books (digital, ClearScan and scanned with OCR), without
ground truth yet:

| Result                             | 1.0.0 |           1.1.0 |
| ---------------------------------- | ----: | --------------: |
| Grid found                         |   387 |             387 |
| Plausible by chess rules           |   323 |             311 |
| Accepted (plausible and confident) |   242 |             250 |
| To review                          |   145 |             137 |
| Accepted by both, read differently |     — |               0 |
| Newly accepted, checked by eye     |     — | 18 / 18 correct |

Fewer boards are plausible only in two books whose boards are all flagged with both versions:
the Alpha-font book by McDonald (Everyman Chess) and a digital book with marble-textured
squares, a style no training set has. A board screenshot sent by the author that 1.0.0 read with three wrong
squares (two queens as kings, a black rook as white) is read exactly by 1.1.0, with no doubtful
square.

## Intended use and limits

- Reading printed diagrams (books, PDFs) and 2D screen boards (Lichess, Chess.com, Onyx, video).
- **Not** for photos of real boards, partial diagrams or rotated scans.
- Books set in diagram fonts unlike the free sets (Alpha, notably) need correction.
- Board orientation is not predicted by the model; it comes from coordinates, text or pawn
  placement in the decoder.

## History

Datasets v1–v4 were trained only partially and dropped after checking them on real books; each
fixed one failure (see `DATASET_CARD.md`). v5 was the first version trained to the end (model
1.0.0). v6 was trained to the end and dropped after the private evaluation; v7 is model 1.1.0.
