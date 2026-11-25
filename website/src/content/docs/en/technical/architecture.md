---
title: Architecture
description: How Onyx Chess Lab is built, from the interface to the position index and the diagram recognizer.
---

Onyx is a desktop application with a web interface and a native core. This page sums up the main parts and the decisions behind them.

## Overview

| Layer | Technology |
| --- | --- |
| Desktop app | [Tauri 2](https://tauri.app/) (Windows, macOS, Linux) |
| Interface | React 19, TypeScript, Mantine, TanStack Router, Jotai |
| Core | Rust: databases, indexes, engines, files and system |
| Game databases | SQLite (`.db3`) with Onyx's own memory-mapped indexes |
| Engines | UCI processes managed from Rust |
| Diagram recognizer | Convolutional network exported to ONNX and run with [`rten`](https://github.com/robertknight/rten), pure Rust |
| Spaced repetition | [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) |

The interface never talks to the disk or the engines directly: everything goes through Rust commands with generated TypeScript types.

## Databases and the position index

Each database is a SQLite file with the games and their metadata. To search positions in databases of more than ten million games, Onyx builds separate indexes:

- **Position index:** stores each move as its number in the list of legal moves, which makes it very compact. It is serialised with [`rkyv`](https://rkyv.org/) and read through `mmap` without copying it into memory: the operating system loads only the pages it needs.
- **Pattern index:** for piece searches, where a game can almost never be ruled out early, it stores the main line as ready-to-play moves. Replaying them is about 17 times faster than generating the legal moves at every ply.

Indexes are derived data: tied to the database's revision, rebuilt if it changes and safe to delete. Searches can be cancelled and results load page by page.

## Diagram recognizer

The **Books** feature reads the diagrams in a PDF into positions. The recognizer runs offline and has two parts:

1. **Locator**, with no model: finds the grid from the board's contrast.
2. **Square classifier** (`diagram-squares` 1.2.0): a small convolutional network (293,053 parameters, 1.17 MB as ONNX) that takes each square as 48 × 48 grayscale pixels and returns one of 13 classes: empty or one of the 12 pieces. A board is read as a batch of 64 squares in about 36 ms on a laptop CPU.

The model was trained **on synthetic data only**: boards generated from positions in the Lichess puzzle database, drawn with dozens of piece sets and print (hatching, stipple, marble, wood) and screen styles. The board is then checked against the rules of chess, and if any square has a calibrated confidence below 0.95, the diagram is flagged for review.

| Synthetic test | Squares | Exact boards |
| --- | --- | --- |
| Overall | 99.75 % | 91.0 % |
| Print style | 99.60 % | 86.4 % |
| Screen style | 99.96 % | 97.4 % |

Parity between PyTorch, ONNX Runtime and `rten` is checked in the Rust tests with a 1e-4 tolerance. The data generator, training, export, model card and dataset card live in [`ml/diagram-recognizer`](https://github.com/ArguedasG/onyx-chess-lab/tree/main/ml/diagram-recognizer).

## Managed Maia 3

The [human-like bots](../human-bots/) use [Maia 3](https://github.com/CSSLab/maia3), written in Python with PyTorch. So that nobody has to install Python, Onyx downloads a private Python, creates a virtual environment inside its data folder, installs the right PyTorch build for each system (CPU-only on Linux, 2.2.2 with a compatibility module on Intel Macs) and registers the engine. If the folder moves, it detects the broken environment and offers a one-click repair.

## Distribution and updates

- Installers are built on **GitHub Actions** for Windows x64, macOS (Apple Silicon and Intel) and Linux x64 from each version tag.
- On Windows, the Tauri updater downloads the new version and checks its **minisign signature** before installing it.
- On macOS and Linux, the app checks the latest release on GitHub and shows the notes in the user's language.
- The **download catalog** (databases, puzzles and engines) is a set of JSON files in the repository's [`catalog/`](https://github.com/ArguedasG/onyx-chess-lab/tree/main/catalog) folder. The app reads it from GitHub, so a link can be fixed without publishing a release, and it ships a copy in case there is no connection.

## Quality

Every change goes through type checking, formatting and lint, hundreds of TypeScript (Vitest) and Rust tests, and project-specific audits: for example, that the English and Spanish translations are complete, or that the updater configuration never points back at the original project.

## In progress

A monthly GitHub Actions pipeline to download, convert, validate and publish updated databases, with `zstd` compression and a versioned manifest.
