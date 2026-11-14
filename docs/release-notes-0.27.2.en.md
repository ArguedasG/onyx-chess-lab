# Onyx Chess Lab 0.27.2

Fixes and improvements following the reports of a Mac user who thoroughly tested player analysis,
mistake review and course imports.

## Importing courses

- Many exported courses start chapters or lines from a position of the course (a `[FEN]` tag,
  often with fake counters such as "0 1") instead of the initial position. Onyx only joined records
  with the same start, so each one ended up in its own section, even with "One combined section".
  Such a record now joins the lines that reach that position, even when they are in another record
  of the file; if it cannot be joined it gets its own section instead of failing the import.
- Line titles starting with a move number ("3.Nc3/Nd2 - 5.Bc4 #1") were taken for chapter numbers
  and split a whole chapter into one section per line.
- "Typical Plans" chapters go to informative sections, like tactics and exercises, and a chapter
  that is almost all plans or tactics goes there whole, introduction included.
- With the two courses from the report: the Jobava London goes from 37 mixed sections to 28, one
  per chapter, and The French: Simplified keeps its theory chapters whole, with plans, tactics and
  model games apart.
- In the import review, each section has a visible "Do not import this section" button (before, it
  was only in the "⋯" menu).

## Player Analysis

- The engine analysis runs in the background. It already kept going when you left the card, but
  coming back showed no progress bar and Cancel was disabled; now it shows "X of N games analyzed",
  Cancel works and you cannot start a second analysis of the same card by mistake.
- Progress is saved every minute: closing the app loses at most the last minute, and games already
  analyzed are never repeated. Recalculate no longer discards the engine analysis.
- With games chosen in the Games tab, the Engine tab shows only those games and an "Analyze N games"
  button, without the limit of 10 or the "×" that went back to the most recent games.
- The filters have the "All time / 12 months / 3 months / 1 month" shortcuts, like the Games tab.
- Scrolling no longer jumps back with large samples (hundreds of analyzed games).
- "Add all to My mistakes" in "Training candidates" adds every error of the analysis at once.

## Review my mistakes

- After each answer, three lines appear with their evaluation: your move, the engine's best move and
  the game move with how it is punished. Step through them on the board by clicking a move or with
  the arrows, to see the difference between them.
- The arrows are drawn only on the starting position, not over the position after your move.

## Players

- Players opens your own card instead of the first saved card (waiting for your accounts to load),
  "Open my card" in Accounts selects it, and if your account cards cannot be loaded you see why,
  with a Retry button.

Your repertoires, studies, books, training progress, databases, analyses and settings are
preserved. Repertoires already imported do not change; import the course again to get the new
grouping.
