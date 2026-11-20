# Onyx Chess Lab 0.28.1

Fixes following reports from two new users: duplicated entries in the download lists, an error
about the puzzles folder, and a flip-board button that was hard to find.

## Download lists

- The puzzle and game database lists showed some bases twice. The second copy was a new DuckDB
  version that the En Croissant catalog now offers, with the same puzzles or games in a smaller file
  (for example, Lichess Puzzles 2026 appeared as 1.09 GB and as 309.51 MB). Onyx reads only its own
  format, so that copy failed after downloading.
- Only the bases Onyx can open are listed now, each once.

## Puzzles

- A puzzles folder with other database files in it (a games database, for example) showed the error
  “no such table: puzzles”, several times. Those files are now skipped without an error.
- When the puzzles folder changed or the selected database was deleted, Onyx kept opening the old
  path and left an empty file there. It now follows the database to the new folder when a file of
  the same name is there, selects the only database when there is one, and otherwise asks you to
  choose. A missing or wrong file is reported as such (“…is not a puzzle database”).

## Flip board

- The flip-board button is now at the left end of the move bar, next to the move buttons, in
  analysis and in games against the engine. It used to be the last icon of the column beside the
  notation. Its tooltip shows the shortcut (F by default, which can be changed in Settings).

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
