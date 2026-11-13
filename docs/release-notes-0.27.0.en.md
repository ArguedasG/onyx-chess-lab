# Onyx Chess Lab 0.27.0

Maia 3 comes to macOS and Linux with the same one-click installation as on Windows, databases gain
a piece pattern search, and every section explains what you can do in it. It also fixes books on
Macs with an older Safari and catches broken database downloads, following a report from a Mac
user.

## Maia 3 on macOS and Linux

- “Recommended engines” installs Maia 3, the engine behind the human-like bots, tournaments and
  twins, on macOS (Apple Silicon and Intel) and Linux x64 too. Onyx downloads its own Python 3.11,
  PyTorch and the Maia3-5M model, pinned by version and SHA-256; no system Python is needed.
- **Apple Silicon:** needs macOS 14 (Sonoma) or newer, which PyTorch requires. On older versions the
  installation stops at the start with a clear message.
- **Intel Macs:** PyTorch stopped publishing builds for them at 2.2.2, which lacks one piece Maia 3
  uses (`RMSNorm`). Onyx adds a small compatibility module on those Macs only; tested with the same
  positions and seed, it gives exactly the same evaluations and moves as the current version.
- **Linux:** the CPU-only PyTorch is installed from PyTorch's own server, without several GB of CUDA
  libraries. It needs glibc 2.28 or newer (Ubuntu 20.04, Debian 10 or later).
- So far it has only been validated on Windows. The README explains the requirements and how to
  install Maia by hand if the guided installation fails.

## A guide in every section

- Tactics, Openings, Endgames, Books, Studies, Databases, Players and Tournaments have a **“What can
  I do here?”** button: what the section is for, what you can do and where to start.

## Databases

- **Pattern search** (“Pattern” button in the Database panel): draw only the pieces that matter,
  mark squares that must be empty, choose the side to move or “Only these pieces”, and get the games
  where that pattern appeared at any moment, whatever the rest of the board. The first search
  prepares the base once (about two minutes and 2 GB for 10 million games); after that, each
  pattern takes seconds.
- **Shared filters** for Elo (including the player's and the opponent's) and dates in the games list,
  the board's Database panel and Player Analysis, with a button to clear them.
- New game header on the board: event, site, round, ratings and opening, with clear placeholders
  when they are missing.
- With the tools zone folded, the board no longer queries the reference database on every move.

## Training

- **Openings:** “Search a move” finds a move in every section of the repertoire, trained or not, at
  any point and in any variation, and opens the section at it.
- **Tactics:** “Train failed”, in the ⋯ menu of each set, repeats only the exercises whose last
  attempt failed, shuffled or in order.
- **Puzzle trainer:** the bookmark button saves a finished puzzle into one of your sets.

## Interface

- Ctrl+Shift+B hides the sidebar and Ctrl+Shift+T the tab bar (Cmd on macOS), to give the board more
  room. They can be changed in Settings → Keybinds.
- Deleting a study names it and reminds you that it goes to the trash.
- Players: a new “1 month” period.

## Fixes

- **Books on older Macs:** with a Safari older than 17.4, opening a PDF failed with
  “Promise.withResolvers is not a function”. pdf.js uses recent functions without a fallback; Onyx
  adds them where they are missing, also in the process that reads the PDF. Nothing changes on
  Windows.
- **Database downloads:** if what was downloaded is not a SQLite database (for example a web page
  put in its place by a proxy, antivirus or firewall), it is not saved and the error says what
  arrived. A damaged database no longer waits 30 seconds to say “timed out waiting for connection”:
  it explains why at once, and its panel has a **Delete** button to remove it and download it again.
- Human-like bots show their rating at the time control of the game (the catalogue Elo is a blitz
  level), on the board and in the bot history.
- Player date filters saved before this version are compared correctly again.

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
