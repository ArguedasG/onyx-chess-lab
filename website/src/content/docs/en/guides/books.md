---
title: Books
description: Read your chess books in PDF next to the board, turn their diagrams into positions and open the games printed in the text.
---

**Books** is a PDF reader built for chess: the book on the left and a board on the right. The book's diagrams and games stop being pictures and text and go to the board, where you can analyze them with the engine.

## Your library

Add your PDFs from **Books** or by dragging them onto the window. Onyx stores the file's path and a fingerprint to recognize it, never a copy. If you move a file, **Locate the file…** finds it again.

The library shows the covers, lets you search and remembers where you left off in each book with **Continue reading**.

## Reading

Opening a book shows two columns: the PDF and a study column with a large board, the notation and the analysis board's tools.

- **Ctrl + wheel** changes the zoom.
- **Diagrams** mode marks the diagrams on the visible pages, and the arrows take you to the previous or next one.
- Long books are not loaded whole: only the pages you see are drawn.

## From a diagram to the board

**Double-click a diagram** and the board is set to that position. If the text says whose move it is or the move number, Onyx reads that too.

It works with diagrams embedded as images and with scanned pages. If any square is doubtful, the editor opens with those squares in red for you to check: Onyx never presents a doubtful reading as certain.

The recognizer works offline and **learns from your corrections in each book**. After you fix a few squares, the next diagrams in that book come out better. What it learns stays on your computer and can be forgotten from the reader's menu. How the recognizer is built is explained in [Architecture](../../technical/architecture/).

## Opening a game from the text

**Double-click a move in the text** and the line up to that move goes to the board, starting from the diagram above it, the board or the initial position.

- It understands notation in English, Spanish and German, and figurines too.
- It follows variations in brackets and games that continue on the next page.
- If a move cannot be played, it is marked in red on the page and the board stays on the previous one.

In digital PDFs almost every line opens correctly. In scanned books it depends on the quality of the recognized text.

## Positions from an image

Outside books, the position editor has **From image**: open, paste or drag a screenshot from Chess.com, Lichess, a video or a PDF and turn it into a position.
