# Onyx Chess Lab 0.27.1

Urgent fix for repertoires imported from courses, following a user report.

## Repertoires that grew until they failed with “Invalid string length”

- When a move had more than one move-quality glyph (for example “!” and “?!”), Onyx wrote them
  glued with commas: `Nf3!,?!!,?!`. This is common in courses that repeat the same move in several
  lines with different glyphs, because importing merges them into one tree.
- Reading that text back counted every glyph separately, so the glyphs multiplied, and each save
  squared them (2, 4, 16, 256, 65,536…). With the course from the report (681 KB), the repertoire
  went from 424 KB to 101 MB in three saves. On the next one, adding a section, importing more lines
  or reorganizing failed with “Invalid string length”.
- The move-quality glyph is now written once, right after the move, and the other annotations as
  NAGs (`$16`…). Checked with the same course: the repertoire keeps its size after six saves in a
  row.

## Repertoires already affected

- They repair themselves: when opened, repeated glyphs are read as one, and the next save writes the
  file clean.
- If a repertoire grew so much that it can no longer be opened, import the course again into a new
  repertoire.

## Annotations

- Like the annotation editor, a move keeps at most one move-quality glyph and one evaluation. When
  lines from different sources are merged, the move keeps the glyph it already had.
- The evaluation chart shows a move's annotations without commas.

Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.
