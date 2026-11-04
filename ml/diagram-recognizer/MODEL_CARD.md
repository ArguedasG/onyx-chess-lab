# Model card — diagram-squares 1.2.0

Square classifier of the Onyx Chess Lab diagram recognizer (I-56, phase 9.4). Files:
`models/1.2.0/` (ONNX, manifest, parity reference, training and evaluation records). The previous
versions, 1.0.0 and 1.1.0, stay in `models/` for comparison; the app ships only 1.2.0.

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
| Training data   | Synthetic only, dataset v8 (see `DATASET_CARD.md`)                                                  |
| Training        | 3 epochs, AdamW, one-cycle LR 3e-3, batch 256, label smoothing 0.02, seed 7; CPU, ~43 min           |
| Calibration     | Temperature 0.618 (fit on validation, minimum NLL)                                                  |
| Review rule     | A board is "to review" if any square has calibrated confidence < 0.95, or if it breaks a chess rule |
| License         | GPL-3.0-only, like Onyx                                                                             |

The exact preprocessing (crop, area resize, scaling) is in the manifest
(`diagram-squares-1.2.0.json`). The runtime must follow it to the letter.

## What changed in 1.2.0

Same architecture, sets and training; only the drawing of the boards changed (dataset v8):

- Printed boards get new dark-square fills: broken hatching (faint, fragmentary lines, as in
  poorly inked or scanned books), stipple, marble and wood, the last three sometimes faint on the
  light squares too. Plain hatching is still the most common fill.
- 15 % of screen boards have bevelled 3D squares, as in older programs.

These were the styles behind the two books that 1.1.0 left almost entirely to review apart from
Alpha (see the private evaluation).

## What changed in 1.1.0

- Trained with the 8 piece sets of sadsnake1 (maestro, staunty, cardinal, tatiana, fresca, gioco,
  dubrovny, icpieces), used with their author's permission (2026-11-02, see the dataset card).
  maestro is Onyx's default set, so screenshots of Onyx itself are now read.
- 12 000 training boards instead of 9 000, for the larger pool of 20 sets.
- An intermediate dataset (v6) used the 4 shaded sets also in the printed style; as ink they
  become solid black pieces, and the model read Alpha's black king (white inner lines) as white.
  v7 keeps them for the screen style only. v6 was not published.

## Parity

`parity.input.u8` (one real test board), `parity.logits.f32` and `parity.features.f32` (PyTorch
logits and features).

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
| test (training piece sets) | 99.75 % |       91.0 % | 0.0005 |          23.3 % |                        99.87 % |
| — print style              | 99.60 % |       86.4 % |        |                 |                                |
| — screen style             | 99.96 % |       97.4 % |        |                 |                                |
| heldout (unseen set)       | 90.67 % |        0.0 % | 0.0767 |          99.0 % | (6 of 600 accepted, all wrong) |

By source resolution (test): 99.25 % at 18–25 px per square, 99.75 % at 25–35 px, ≥ 99.86 % above.

The v8 test is harder than v7's (it has the new fills), so these numbers are lower than 1.1.0's
on its own test. On the same v8 test boards, 1.1.0 gets 97.60 % of the squares and 78.0 % of the
boards exactly (print style: 95.89 % and 63.8 %) and flags 36.2 %; 1.2.0 gets 99.75 % and 91.0 %
and flags 23.3 %.

The heldout set (`pirouetti`) has pawns, bishops and kings drawn unlike any training set; the
model reads them as other pieces. It shows the main limit of the model: **a piece design far
from everything it has seen is misread**, and calibration alone does not catch every case.
The chess rules (one king per side, pawns not on the edge ranks, counts) are the second net.

### Private (the author's books, never shared)

394 embedded diagram images from 14 books (digital, ClearScan and scanned with OCR). All three
versions are run with the app's rule (threshold 0.95):

| Result                             | 1.0.0 | 1.1.0 | 1.2.0 |
| ---------------------------------- | ----: | ----: | ----: |
| Grid found                         |   387 |   387 |   387 |
| Plausible by chess rules           |   323 |   311 |   326 |
| Accepted (plausible and confident) |   242 |   250 |   272 |
| To review                          |   145 |   137 |   115 |

Ground truth: the author labeled 150 of them (`tools/label_books.py`; the first 10 of every book
in turns, then the worst-read books): 95 read right, 49 corrected, 3 not diagrams, 3 skipped
(boards of numbers or letters).

| Against the 147 labels |    1.1.0 |     1.2.0 |
| ---------------------- | -------: | --------: |
| Squares right          |   95.4 % |    95.2 % |
| Exact boards           | 95 / 144 | 104 / 144 |
| Accepted               |       84 |        92 |
| Exact among accepted   |    100 % |     100 % |
| **Accepted but wrong** |    **0** |     **0** |
| Flagged but exact      |       11 |        12 |

The gains are where the new fills point: the book with broken hatching goes from 4 to 8 exact
boards out of 10, the one with 3D boards from 3 to 7 out of 9. The two books set in Alpha
(Everyman Chess) stay at 0 exact out of 36 with both versions, all of them flagged: the black
pieces of that font (solid, with white inner lines) are still misread, mostly on hatched squares.
A board screenshot sent by the author that 1.0.0 read with three wrong squares (two queens as
kings, a black rook as white) is read exactly since 1.1.0.

## Per-book adaptation

From 1.2.0 the ONNX file has a second output, `features`: the 128 pooled values before the
classifier. The app keeps, per book and only on the user's computer, the features of the squares
of the boards the user corrected (`books/<id>.memory.bin` in the app data folder). When a diagram
of that book is read, each square is compared with them (cosine similarity, k = 5 nearest); a
close match mixes their vote into the model's answer. The constants are in the manifest
(`adaptation`), and `tools/sim_adapt.py` is the reference of the rule.

**A square whose answer the memory changes is never confident**, so it stays marked for review:
the memory corrects readings but never makes a board accepted that the model alone would flag.
Letting close matches count as confident cost 2 silent errors in the simulation below (a white
king turned black, a pawn for a bishop), so it does not. The weights are not retrained; the
memory is ignored when the model changes.

Simulated on the author's labels (each book in page order, learning from every board left to
review, as a user would):

| 143 labeled boards          |   Model alone | Adapted to the book |
| --------------------------- | ------------: | ------------------: |
| Exact boards                |           104 |             **138** |
| Accepted                    |            92 |                  92 |
| Accepted but wrong          |             0 |                   0 |
| Squares the user had to fix |           382 |              **43** |
| — the two Alpha books (36)  | 352 (0 exact) |       15 (32 exact) |

The first board of a book is corrected by hand; from the second one on, the reader proposes the
Alpha pieces correctly almost every time. Cost: a few milliseconds per board.

## Intended use and limits

- Reading printed diagrams (books, PDFs) and 2D screen boards (Lichess, Chess.com, Onyx, video).
- **Not** for photos of real boards, partial diagrams or rotated scans.
- Books set in diagram fonts unlike the free sets (Alpha, notably) need correction; the app
  learns from those corrections within the same book (below).
- Board orientation is not predicted by the model; it comes from coordinates, text or pawn
  placement in the decoder.

## History

Datasets v1–v4 were trained only partially and dropped after checking them on real books; each
fixed one failure (see `DATASET_CARD.md`). v5 was the first version trained to the end (model
1.0.0). v6 was trained to the end and dropped after the private evaluation; v7 is model 1.1.0
and v8 model 1.2.0.
