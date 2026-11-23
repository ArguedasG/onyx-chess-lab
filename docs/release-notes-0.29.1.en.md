# Onyx Chess Lab 0.29.1

A fix following a user report: changing a data folder in Settings left everything behind, so
engines and databases had to be installed again and games imported from Lichess seemed lost.

## Moving data folders

- When you choose a new folder for databases, engines, puzzles or files in Settings → Directories,
  Onyx now shows what the current folder holds (number of files and size) and asks what to do:
  - **Move**: the contents go to the new folder and everything that points to them is updated:
    engines, the reference and puzzle databases, open tabs, sessions and Player Analysis profiles.
    Onyx then reloads and tells you what moved.
  - **Use without moving**: the previous behaviour. Your current data stays in the old folder.
- Until now only the path changed. Nothing was deleted: the data was still in the old folder.
- If the new folder already has a file with the same name, that file is kept and the old one stays
  where it was. Onyx lists them before and after the move.
- Nothing is deleted from the old folder until everything is in the new one. If something fails
  (for example, a file in use), everything goes back and nothing is moved.
- Moving to another drive copies the files first, so large databases can take a few minutes.
- After moving the engines folder, Maia 3 asks for its one-click Repair.

## Recovering data from an earlier folder change

1. In Settings → Directories, select the old folder and choose **Use without moving**. Your data
   appears again.
2. Select the new folder again and choose **Move**.

On macOS, the default folder is `~/Library/Application Support/io.github.arguedasg.onyxchesslab`.
The Library folder is hidden: press Command + Shift + G in the folder picker and paste the path.

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
