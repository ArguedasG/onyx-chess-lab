# Onyx Chess Lab 0.29.0

Onyx gets an identity of its own, separate from En Croissant: its own data folder, publisher and
installer entry. Your data moves to the new folder by itself the first time you open this version.
This release also brings update notices to macOS and Linux and improvements to tactics training
for visualisation courses.

## Your data moves to Onyx's own folder

- Onyx now has its own app identifier (`io.github.arguedasg.onyxchesslab`) and publisher (Gabriel
  Arguedas). Until now it still used En Croissant's.
- The first time you open 0.29, your data folder moves to the new location by itself:
  - databases and puzzles;
  - engines;
  - repertoires and training progress;
  - Player Analysis profiles;
  - settings and recent files.

  Saved paths are updated, and nothing is deleted.

- On Windows, the installer moves its own registry entry as well, so updating and uninstalling keep
  working and your installation folder is kept.
- New installations create `Documents/Onyx Chess Lab`. Existing installations keep the documents
  folder they already use.

## If you also use En Croissant

- Until now Onyx and En Croissant shared one data folder. That folder now moves to Onyx, so En
  Croissant will start empty the next time you open it.
- Onyx tells you once, the first time it starts, when it finds that the folder was shared. Nothing
  is deleted.

## Maia 3 after the update

- Maia 3's Python environment depends on the folder it lives in, so it has to be rebuilt after the
  move.
- The first time you open 0.29, Onyx opens **Recommended engines** with a **Repair Maia 3** button:
  one click reinstalls it.
- If you close that window, a notice stays at the top of **Engines**. The repair never leaves Maia
  listed twice.

## Update notices on macOS and Linux

- Onyx now checks for new versions on macOS and Linux too. It shows the release notes in the same
  window as on Windows, with a button that opens the download page.
- Windows keeps its signed automatic updates.
- This notice starts working from 0.29 onwards, so this update still has to be downloaded by hand
  on macOS and Linux.

## Tactics

- **Blind for exercises where you move first.** The board stays frozen on the starting position
  while you play the whole line from memory. The opponent's replies appear written below the board
  and as an arrow. This is how visualisation courses work: play the given moves in your head, then
  find the tactic. It also works in Storm, Streak and Countdown.
- **Show PGN comments.** When an exercise has comments, an option in the side panel shows:
  - the opening comment, for example the moves you are asked to visualise;
  - the comments of the moves already played.

  Comments of moves still to come are never shown, since they usually give the solution away. When
  the exercise is over, the rest of the line's comments appear. The option is remembered.

- **Records without moves are skipped.** When a PGN is imported, records that only contain text,
  such as a course's introduction, no longer count as exercises. Sets imported before this version
  keep them; import the PGN again to drop them.
- **Review set** now shows the whole puzzle list as soon as it opens. It used to appear empty the
  first time, and with long sets only the first rows were drawn.

## Other changes

- Removed an analytics library inherited from En Croissant that Onyx never used.

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
