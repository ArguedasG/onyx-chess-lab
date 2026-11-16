# Onyx Chess Lab 0.27.3

Fixes following reports from two users: an opening book PGN that could not be imported, and a
Review my mistakes session that was lost when opening a game.

## PGN files in the old Mac format

- Some PGN files, often older exports from chess publishers, use classic Mac line endings (CR only,
  no LF) and a non-UTF-8 text encoding (Latin-1 or Windows-1252). Onyx split lines only on LF, so it
  read the whole file as a single line; since it was not valid UTF-8, it dropped it, found no games
  and failed with “invalid args `pgn` for command `lex_pgn`”.
- The reader now accepts LF, CRLF and lone CR line endings, and reads lines that are not UTF-8 as
  Windows-1252 instead of dropping them. Checked with the file from the report (650 KB): all 96
  games are read and accents such as the “ü” of Grünfeld are kept.
- The same applies to importing studies, opening repertoires, endgames and tactics from a file.
- Lines that start with “%” before the first game (such as “%BOOKTITLE”) are ignored, as the PGN
  standard says. They used to count as an empty first game, which was the one opened on import.

## Importing from a file

- If the import fails, the Import window shows the reason and the button can be used again. It used
  to keep loading, and Onyx had to be closed to try another file.
- A file with no games says so: “No games were found in this PGN file.”

## Review my mistakes

- Opening a game from a review session left the page and lost the session, its position and the
  filter you came from. Coming back meant starting over and remembering which mistakes were already
  reviewed.
- Now, when you return with the back arrow of the game tab, the session reopens on the same mistake,
  with its counter, and keeps the filter (for example, hanging pieces from Priorities).
- Opening a game from the list brings you back to the same filtered list and page.
- Closing the session with the X ends it as before. The state is kept while Onyx is open, not
  across restarts.

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
