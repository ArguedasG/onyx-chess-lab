---
title: Model games
description: Generate games between engines and bots from any position to see how it is played, one at a time or in batches.
---

The **Model Game Generator** plays games between two engines or bots from the position you choose. Use it to see how a position usually goes on: which plans appear, who wins and how, or how a player of a given level would play an endgame.

## Opening the generator

- From the home screen or the sidebar, with **Model Game Generator**. The initial position card has **Edit board / FEN** to choose where to start.
- From the analysis board, at the position you are interested in. The generator keeps the moves that led to it, so that rules like threefold repetition work correctly.

## Setting up the players

White and Black are set up separately. Each side can be:

- a **UCI engine**, such as Stockfish or Lc0, with a limited, strong, reference or custom preset;
- a **human-like bot**, which plays like a person of its level (see [Bots and tournaments](../bots-and-tournaments/)).

Depending on the player, you choose the time, depth or nodes per move. To compare, for example, how a 1500 player and a 2200 player handle a position, pit two bots of those levels against each other.

## One game or a batch

With a single game you watch the result move by move and can repeat it with the same settings or edit them.

With **Run a batch** you generate up to 1000 games:

- **Alternate colors** swaps the players' sides every two games.
- **Varied openings** starts from 20 balanced openings, each with both colors, so that games do not repeat.
- You can limit how many games run at once and how much CPU and memory they use, and pause and resume the batch.

The batch keeps running when you switch tabs.

## Experiments

Every game or batch is saved as an **experiment**, with its games, settings and result. From **View experiments** you can:

- open any game on the analysis board;
- save the games to a study (one per chapter), to a repertoire as model games or to a PGN;
- export the experiment's whole folder or delete it.

The generator also opens **Bot tournaments**, automatic leagues in which several bots play a round robin.
