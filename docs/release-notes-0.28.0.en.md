# Onyx Chess Lab 0.28.0

A new feature, Plans, inspired by other analysis tools, and a round of tidying in the noisiest parts:
the database panel and Player Analysis. It also prepares Onyx for databases the size of the Mega
Database (about 12.6 million games).

## Plans

- New **Plans** view in the database panel. It answers “what does this side do in its next few
  moves, in any order?”, not only “what is played now?”. Each move is counted once per game and is
  told by its origin and destination square (`Ng1-f3`), so the order it came in does not matter.
- Choose the side (the side to move by default), how many moves to read (3, 4, 6 or 8) and the least
  share of games (10, 20, 30 or 50%). Changing the share recalculates nothing.
- **The typical plan is drawn on the board** as numbered arrows, in the order it is usually played.
  It takes the most frequent moves that do not clash (the same knight cannot go to both f3 and e2)
  and that usually appear in the same games, five at most.
- Each row shows the move it is usually played on, the number of games, the share and, with at least
  30 rated games, how those games scored against what the ratings predicted, compared with the whole
  position. That keeps a good plan apart from one that only the stronger players choose. It is a
  correlation, not a cause. Expanding a row shows what the move is usually played with.
- **A pawn-structure search** has plans too. Pieces stand elsewhere in each game, so a piece move
  counts by its destination (`N→f3`) and is drawn as a numbered circle; pawns keep their origin.
- **Opening report:** new Typical plans section with a table for each side (4-move window). It
  follows the report's rating class and period filters and is included in the HTML export. Reports
  saved before have no plans; generate them again.
- Very broad positions are read from an even sample of 100,000 games, and the view says so. Measured
  on a 12-million-game database: the start position takes 0.8 s with 4 moves and 1.0 s with 8.
- A game with unreadable moves in the database is left out of the plans instead of preventing them.

## Database panel

- One view at a time: **Moves | Games | Plans | Report**. The move table and the game list used to
  be stacked in folding sections, which was too much with the notation open.
- The toolbar has two tidy rows instead of one that wrapped on its own:
  - Top, what is queried: source, database, a **Search by** menu (board position, pawn structure,
    pattern) and the **Filters** button, which summarises what is active (for example
    `Blitz, Rapid · 1600–2000` or `Elo 1600– · 1-0`).
  - Bottom, what is shown: the view, the pattern-search badge, the number of games and refresh.
- No feature was lost: pawn structure and pattern are in Search by, and the weak-games notice is
  part of the Filters summary.
- The filters are sized by the panel, not the window: with a large notation panel they scroll to
  their end. The Filters button text is centred again.

## Large databases

- **A search keeps up to 22.4 million games** instead of 11.2 million. Each match takes 12 bytes
  instead of 24 in the search's temporary file, with no data lost and the check against the index
  kept.
- Before, at the start position of a database of more than 11.2 million games, the list and the
  report left out the last games of the database, probably the most recent ones, and the panel said
  so (“Very broad position…”). With the Mega Database they all fit now.
- **Live statistics:** during a long search the Moves view fills in as it runs. The number of games
  found and the move table update about four times per second until the full result arrives. Quick
  searches look as before.
- Reference with the Mega Database 2027, 1.e4 only: Onyx 8 s, ChessBase 26 11.6 s.

## Player Analysis

- The Analysis tab looked different from the rest of the player card. Its filters now fit in one
  line, with the same look as Summary or Rivals: period, a button for a hand-picked date range,
  colour, opponent Elo and time control.
- The secondary actions (analysis library, save version, export JSON or HTML, turn the analysis off
  and delete the profile) are in a **⋯** menu next to **Recalculate**. Deleting the profile comes
  last, away from an accidental click.
- Summary, Openings, Findings and Engine are tabs of their own with icons. **Engine** shows “Not run”
  until the engine has analysed the games, since other parts depend on it.
- The engine settings fit in one row. Once there are results, they fold into a summary line
  (“Stockfish · 10 of 54 games (Blitz) · 250 ms per position”) with Settings and Analyze buttons, so
  the results come first.

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
