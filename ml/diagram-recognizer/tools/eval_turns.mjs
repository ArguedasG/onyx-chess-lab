#!/usr/bin/env node
// Private evaluation of the side-to-move heuristics (src/utils/bookText.ts) on the author's books:
// for every extracted diagram, reads the page text with pdf.js and reports how often a side to
// move is found, and from what text. Run from the repository root with:
//   node --experimental-strip-types ml/diagram-recognizer/tools/eval_turns.mjs <books-folder>

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { moveContext } from "../../../src/utils/bookText.ts";

const folder = process.argv[2];
const index = JSON.parse(
  await readFile("ml/diagram-recognizer/private-eval/books/index.json", "utf8"),
);
const byBook = new Map();
for (const entry of index) byBook.set(entry.book, [...(byBook.get(entry.book) ?? []), entry]);

const totals = { n: 0, found: 0, white: 0, black: 0 };
for (const [book, entries] of byBook) {
  const task = getDocument({
    data: new Uint8Array(await readFile(path.join(folder, book))),
    verbosity: 0,
  });
  const doc = await task.promise;
  const row = { n: 0, found: 0, white: 0, black: 0, samples: [] };
  for (const entry of entries) {
    const page = await doc.getPage(entry.page);
    const height = page.view[3] - page.view[1];
    const [x0, top0, x1, top1] = entry.pageBox;
    const box = [x0, height - top1, x1, height - top0];
    const content = await page.getTextContent();
    const runs = content.items
      .filter((item) => "str" in item && item.str.trim())
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height || Math.hypot(item.transform[2], item.transform[3]),
      }));
    const context = moveContext(runs, box);
    row.n++;
    if (context.turn) {
      row.found++;
      row[context.turn === "w" ? "white" : "black"]++;
      if (row.samples.length < 3)
        row.samples.push(
          `${context.turn}${context.fullmove ?? ""} «${context.evidence?.slice(0, 30)}»`,
        );
    }
  }
  for (const k of ["n", "found", "white", "black"]) totals[k] += row[k];
  console.log(
    `${book.slice(0, 38).padEnd(39)} ${String(row.found).padStart(2)}/${row.n}  w${row.white} b${row.black}  ${row.samples.join(" | ")}`,
  );
  await task.destroy();
}
console.log(
  `TOTAL ${totals.found}/${totals.n} with a side to move (w${totals.white} b${totals.black})`,
);
