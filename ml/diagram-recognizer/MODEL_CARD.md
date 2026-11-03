# Model card — diagram-squares 1.0.0

Square classifier of the Onyx Chess Lab diagram recognizer (I-56, phase 9.4). Files:
`models/1.0.0/` (ONNX, manifest, parity reference, training and evaluation records).

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
| Training data   | Synthetic only, dataset v5 (see `DATASET_CARD.md`)                                                  |
| Training        | 3 epochs, AdamW, one-cycle LR 3e-3, batch 256, label smoothing 0.02, seed 7; CPU, ~27 min           |
| Calibration     | Temperature 0.639 (fit on validation, minimum NLL)                                                  |
| Review rule     | A board is "to review" if any square has calibrated confidence < 0.95, or if it breaks a chess rule |
| License         | GPL-3.0-only, like Onyx                                                                             |

The exact preprocessing (crop, area resize, scaling) is in the manifest
(`diagram-squares-1.0.0.json`). The runtime must follow it to the letter.

## Parity

`parity.input.u8` (one real test board) and `parity.logits.f32` (PyTorch logits).

| Pair                   | Max abs difference |
| ---------------------- | -----------------: |
| PyTorch ↔ ONNX Runtime |             1.9e-6 |
| PyTorch ↔ `rten` 0.24  |             2.4e-6 |

Tolerance: 1e-4 and the same argmax on every square.

## Evaluation

### Synthetic (reproducible)

| Split                      | Squares | Exact boards |    ECE | Flagged at 0.95 |           Exact among accepted |
| -------------------------- | ------: | -----------: | -----: | --------------: | -----------------------------: |
| test (training piece sets) | 99.81 % |       93.9 % | 0.0006 |          18.5 % |                        99.51 % |
| — print style              | 99.69 % |       91.3 % |        |                 |                                |
| — screen style             | 99.96 % |       97.4 % |        |                 |                                |
| heldout (unseen set)       | 91.31 % |        0.0 % | 0.0677 |          99.5 % | (3 of 600 accepted, all wrong) |

By source resolution (test): 99.47 % at 18–25 px per square, 99.77 % at 25–35 px, ≥ 99.89 % above.

The heldout set (`pirouetti`) has pawns, bishops and kings drawn unlike any training set; the
model reads them as other pieces. It shows the main limit of the model: **a piece design far
from everything it has seen is misread**, and calibration alone does not catch every case.
The chess rules (one king per side, pawns not on the edge ranks, counts) are the second net.

### Private (the author's books, never shared)

394 embedded diagram images from 14 books (digital, ClearScan and scanned with OCR), without
ground truth yet:

| Result                             |          Boards |
| ---------------------------------- | --------------: |
| Grid found                         |             387 |
| Plausible by chess rules           |             323 |
| Accepted (plausible and confident) |             242 |
| To review                          |             145 |
| Accepted boards checked by eye     | 18 / 18 correct |

Accepted per book ranges from 30/30 (two digital books) to 0/30 on the two books set with the
Alpha diagram font (Everyman Chess), where pawns are still misread; those boards are all flagged.
Exact accuracy on this set will be measured once the correction screen (step 3) produces labels.

## Intended use and limits

- Reading printed diagrams (books, PDFs) and 2D screen boards (Lichess, Chess.com, video).
- **Not** for photos of real boards, partial diagrams or rotated scans.
- Books set in diagram fonts unlike the free sets (Alpha, notably) need correction.
- Board orientation is not predicted by the model; it comes from coordinates, text or pawn
  placement in the decoder.

## History

Datasets v1–v4 were trained only partially and dropped after checking them on real books; each
fixed one failure (see `DATASET_CARD.md`). v5 is the first version trained to the end.
