---
title: Human-like bots
description: How Onyx's bots were built and calibrated to play like people of a given rating, each with a personality of its own.
---

Onyx's bots are not a strong engine weakened on purpose. A limited Stockfish plays almost perfectly and then suddenly gives away a piece for no reason, something no person would do. Onyx's bots start from a model that imitates human players and add a repertoire, a style, strength control and thinking times on top of it.

There are more than 70 bots, from 800 to 2800, each with a name, a playing personality, an opening style and a repertoire of its own.

## The base: Maia 3

[Maia 3](https://github.com/CSSLab/maia3) is a neural network trained on human games from Lichess. Given a position and a rating, it does not look for the best move: it predicts what a person of that rating would play, typical inaccuracies included. That is why its mistakes look like people's mistakes.

Maia only reports its candidates in order. To reason about them, Onyx launches it through a small script of its own that prints the probability of every legal move before each move. Maia's code is not modified, and a normal UCI client ignores those lines.

## What happens on every move

1. **Repertoire.** If the game follows one of the bot's lines, it plays its opening. There are about 120 lines grouped into 49 families, and each bot has one with White and one against e4, against d4 and against flank openings. Less theoretical bots leave the book earlier.
2. **Maia's candidates.** The most likely moves until they cover 90% of the probability, six at most.
3. **Verification.** A single short Stockfish search (about 150 ms), limited to those candidates, measures how much each one loses against the best.
4. **Style.** Within the group of acceptable moves, the bot's personality shifts probability towards the moves that suit it.
5. **Strength.** At the top levels, candidates that lose too much are discarded.
6. **Choice.** The move is drawn with the bot's temperature, the way Maia samples its own policy.
7. **Time.** Finally, the bot decides how long to "think" before moving.

Maia and the verification together take less than half a second, well below the simulated thinking time.

## Personalities

Every candidate move is described by two traits measured on the board:

- **Aggression:** checks, attacks on the squares around the enemy king, pieces moving towards it, pawns advancing in front of it. Moves that reinforce the bot's own king, retreats and castling count against it.
- **Simplification:** trades of pieces of similar value, captures and less tension on the board. Positions with many attacked pieces count against it.

Those two axes give five personalities:

| Personality | Aggression | Complexity |
| --- | --- | --- |
| Striker | aggressive | simplifies |
| Savage | aggressive | complicates |
| Guardian | defensive | simplifies |
| Lurker | defensive | complicates |
| Balancer | neutral | neutral |

And four opening styles (Adventurer, Fencer, Practical and Classical), depending on how sharp and how theoretical their choices are.

**The most important rule: a style does not change strength.** The first version did: by pushing towards certain moves, aggressive styles became stronger and defensive ones made more mistakes (one of them lost about 500 points). Now the style only shifts probability **within** the group of moves Stockfish keeps close to the best, and that group keeps its total weight. Maia's human mistakes keep exactly the same probability. The style also fades in endgames, so that it never delays a necessary technical move.

## The strength ladder

- **Up to 2400:** pure Maia at its rating. Maia's ladder is consistent with itself, mistakes included: a 1900 beats an 1800 about as often as a person would.
- **Above 2400:** Maia 2400 with a filter. The bot may only choose among candidates within a margin of the best: 400 centipawns at 2450, 220 at 2600, 175 at 2700 and 140 at 2800. It still plays human moves, but stops making the mistakes a player of that level would not make.

Three other plans that mixed in the filter from 1800 upwards were tried first. They disturbed a ladder that already worked and could not separate the levels above 2600, so they were dropped.

## How it was calibrated

Everything was measured with bot-versus-bot matches inside the app itself, more than a thousand games in all, always in short batches of 10 to 30 minutes, with alternating colors and fixed seeds so that every experiment can be repeated.

- **Style lab.** Each personality against a neutral bot of the same rating, at 1500 and 2000, in three rounds of 200 games. Checks, trades, attacked pieces, material and game length showed whether each style stood apart from the others, and the probability Maia gave to the chosen moves showed whether they were still human (it dropped by only 1 to 4 points).
- **Blind test.** The author reviewed 20 games without knowing which style each bot had. The style was recognizable when the position allowed it, as with real players; in games decided early or with a single good move it was not.
- **Strength.** Five calibration rounds for the top levels, then 40-game matches against Maia 2400.

Three measurement problems turned up along the way, and fixing them mattered as much as the tuning:

1. **The lab was not using the real bot**, but Maia without style or filter. It now plays exactly as in a normal game.
2. **Games repeated themselves.** With repertoires and Maia picking its most likely move, the 40 games of a match came from two or three lines. The fix was a set of 20 balanced openings, each played once with each color.
3. **Noise.** With 40 games the margin of error is about ±100 Elo. A striking result from one match disappeared when repeated, so the rule is never to recalibrate from a single match.

Results with varied openings, 40 games per match:

| Match | Score | Measured difference | Expected |
| --- | --- | --- | --- |
| Bot 2400 vs Maia 2400 | 18 – 22 | −35 | 0 |
| Bot 2450 vs Maia 2400 | 25 – 15 | +89 | +50 |
| Bot 2500 vs Maia 2400 | 29 – 11 | +169 | +100 |
| Bot 2550 vs Maia 2400 | 25.5 – 14.5 | +98 | +150 |
| Bot 2600 vs Maia 2400 | 31.5 – 8.5 | +228 | +200 |
| Bot 2700 vs Maia 2400 | 34 – 6 | +301 | +300 |
| Bot 2800 vs bot 2600 | 26.5 – 13.5 | +117 | +200 |

All of them fall within the expected noise. The personalities, played against a neutral bot of the same level, gave an average difference of −7 ± 25 Elo: they change how the bot plays, not how strong it is.

## Rating by time control

Maia learned mostly from blitz games and does not use the clock, so a bot plays the same at any time control. What changes is the label: a bot's number is its blitz rating, and in rapid and classical it is shown lower, because its mistakes weigh more when the opponent has time to punish them. For example, a 2000 bot shows as 1830 in rapid and 1675 in classical. The formula was adjusted after the blind test.

Your own rating against the bots uses Glicko-2, one per time control, as on Lichess. It is an internal Onyx scale: it is not a FIDE rating nor the rating of any platform.

## Thinking time

A bot that answers instantly does not feel human. Each bot has a timing profile, and the length of each move depends on:

- the time control (slower in rapid and classical);
- the first move out of its repertoire, which is where a person stops to think the most;
- critical positions, when only one move is clearly better;
- obvious recaptures, which go faster.

## Limits and next steps

The current version is approximate on purpose, and it will keep being tuned with real games and feedback from the people who play against the bots.

- **More realistic repertoires.** Today the lines and their popularity are written by hand. The next step is to measure them in the Lichess database by rating range, so that a 1200 bot opens the way 1200 players do.
- **Stronger styles.** The aggressive–defensive axis separates well, but the simplify–complicate axis is weaker at low levels, and the Lurker still gives as many checks as a neutral bot. There is room for new traits and more personalities.
- **More bots.** The catalog has room for more profiles, and the seeded generated players that tournaments already use could appear in the bot explorer.
- **The highest levels.** The 2800 bot plays a little below its number in several measurements. If that holds, its margin will be narrowed; in the longer term, a search guided by the human model could give more natural top levels.
- **Leagues with varied openings.** Bot leagues still use repertoires, so two bots can repeat almost the same game every time they meet.
