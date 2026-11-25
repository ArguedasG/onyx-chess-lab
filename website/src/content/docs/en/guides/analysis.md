---
title: Analysis
description: Onyx's analysis board, the game report, the database panel and what you can do with any position.
---

The analysis board is the center of Onyx. From it you analyze with the engine, look positions up in your databases and send any position to training, a study or a repertoire.

## Opening a game

- **Analysis Board** on the home screen or in the sidebar opens an empty board.
- From **Databases**, **Studies**, **Players** or a PGN file, any game opens in a new tab.
- With **Import** you paste a PGN or a FEN. In the position editor, **From image** turns a screenshot into a position.

Moves, variations, comments and annotations (!, ?, !?, ±…) are edited directly in the notation. The right arrow moves forward, the left arrow goes back, and the space bar plays the engine's best move.

## The right-hand panel

Its three main tabs are:

- **Analysis:** your active engines, with their lines, evaluation and depth. You can run several at once and change their options with the gear icon.
- **Database:** what was played in this position in your local database, on Lichess or in Lichess Masters. It has four views:
  - **Moves**, with their scores;
  - **Games**, the list of games that went through this position;
  - **Plans**, what each side usually does over the next few moves, in any order, drawn on the board as numbered arrows;
  - **Report**, a full report on the position or the opening.
- **Info:** the game's details: players, event, date and result.

The notation header shows the opening's name and, when Onyx recognizes it, the position's pawn structure.

In **Database**, **Search by** switches the exact-position search to a **pawn structure** or **pattern** search (only the pieces that matter), and **Filters** narrows it by rating, date, time control or result.

## The game report

In the **Analysis** tab, **Generate report** analyzes the whole game with the engine:

- it classifies inaccuracies, mistakes and blunders by the winning chances they lose, not only by centipawns;
- it shows the **Key moments**, the moves that decided the game;
- it marks the first move that is not in your reference database (the novelty).

By default it spends 250 ms on each position and looks again, more deeply, at the doubtful moves. Positions already analyzed are cached, so repeating a report is almost instant. If you want, it can take the evaluations of the first moves from the Lichess cloud; this is off by default because it sends those positions to Lichess.

Then **Learn from your mistakes** takes you to each mistake so you can find a better move. Afterwards, Onyx explains what your move allowed, with arrows on the board.

## Position actions

The menu for the current position lets you:

- look the position up in your repertoires, telling apart whether you reached it by the same route or by a transposition;
- create a tactics or endgame exercise from it;
- add it to a study or a repertoire;
- **Generate repertoire from here** or **Find surprises in this line**;
- open the model game generator at that position (see [Model games](../model-games/)).
