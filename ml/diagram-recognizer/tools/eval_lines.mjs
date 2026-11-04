#!/usr/bin/env node
// Private evaluation of «Abrir esta partida» (src/utils/bookGame.ts) on the author's books: for
// every labeled diagram of a book with a text layer, the moves printed after it on its page are
// opened from the diagram's position (labels for the pieces, the text for the side to move), as a
// double click on each would. Reports how many reach the clicked move. Run from the repo root:
//   node --experimental-strip-types ml/diagram-recognizer/tools/eval_lines.mjs <books-folder>

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { joinRuns, openLine, plyOfFen, tokenize } from "../../../src/utils/bookGame.ts";
import { moveContext } from "../../../src/utils/bookText.ts";

const folder = process.argv[2];
const base = "ml/diagram-recognizer/private-eval";
const index = JSON.parse(await readFile(`${base}/books/index.json`, "utf8"));
const labels = JSON.parse(await readFile(`${base}/labels.json`, "utf8")).labels;
const report = JSON.parse(await readFile(`${base}/report-v8/results.json`, "utf8"));
const flippedGuess = new Map();
for (const boards of Object.values(report.boards))
  for (const b of boards) flippedGuess.set(b.file, !!b.flipped_guess);

const toFen = (display, flipped) => {
  const sq = flipped ? [...display].reverse() : [...display];
  const ranks = [];
  for (let r = 0; r < 8; r++) {
    let out = "",
      empty = 0;
    for (const c of sq.slice(r * 8, r * 8 + 8)) {
      if (c === ".") empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += c;
      }
    }
    ranks.push(out + (empty || ""));
  }
  return ranks.join("/");
};

const runsOf = async (doc, number) => {
  const page = await doc.getPage(number);
  const content = await page.getTextContent();
  return content.items
    .filter((item) => "str" in item && item.str.trim())
    .map((item) => ({
      page: number,
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height || Math.hypot(item.transform[2], item.transform[3]),
    }));
};

const byBook = new Map();
for (const e of index) byBook.set(e.book, [...(byBook.get(e.book) ?? []), e]);
const total = { diagrams: 0, tried: 0, reached: 0, illegal: 0, ambiguous: 0, missing: 0, fuzzy: 0 };
const samples = [];
for (const [book, entries] of byBook) {
  const task = getDocument({
    data: new Uint8Array(await readFile(path.join(folder, book))),
    verbosity: 0,
  });
  const doc = await task.promise;
  const row = { diagrams: 0, tried: 0, reached: 0, illegal: 0, ambiguous: 0, missing: 0, fuzzy: 0 };
  for (const e of entries) {
    const label = labels[e.file];
    if (!label || !["ok", "fixed"].includes(label.status)) continue;
    const page = await doc.getPage(e.page);
    const height = page.view[3] - page.view[1];
    const [x0, top0, x1, top1] = e.pageBox;
    const box = [x0, height - top1, x1, height - top0];
    const runs = await runsOf(doc, e.page);
    const context = moveContext(runs, box);
    if (!context.turn || !context.fullmove) continue;
    row.diagrams++;
    const fen = `${toFen(label.placement, flippedGuess.get(e.file))} ${context.turn} - - 0 ${context.fullmove}`;
    const { text } = joinRuns(runs);
    const tokens = tokenize(text);
    const ply = plyOfFen(fen);
    // The moves printed below the diagram: runs under its bottom edge, same column.
    const below = new Set(
      runs
        .map((r, i) => (r.y < box[1] && r.x < box[2] && r.x + r.width > box[0] ? i : -1))
        .filter((i) => i >= 0),
    );
    const { starts } = joinRuns(runs);
    const runOf = (offset) => {
      let lo = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= offset) lo = i;
      return lo;
    };
    const candidates = tokens
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          t.kind === "move" &&
          t.ply !== null &&
          t.ply >= ply &&
          t.ply < ply + 8 &&
          below.has(runOf(t.start)),
      )
      .slice(0, 6);
    for (const { t, i } of candidates) {
      row.tried++;
      const line = openLine(tokens, i, [fen]);
      if (line && line.clicked >= 0) {
        row.reached++;
        row.fuzzy += line.moves.slice(0, line.clicked + 1).some((m) => m.fuzzy) ? 1 : 0;
      } else {
        const reason = line?.failure?.reason ?? "missing";
        row[reason]++;
        if (samples.length < 40) {
          const f = line?.failure ? tokens[line.failure.token] : t;
          samples.push(
            `${book.slice(0, 18)} p${e.page} ${reason}: «${text.slice(f.start, f.end)}» in «${text.slice(Math.max(0, f.start - 50), f.end + 20).replace(/\s+/g, " ")}»`,
          );
        }
      }
    }
  }
  for (const k of Object.keys(total)) total[k] += row[k];
  console.log(
    `${book.slice(0, 40).padEnd(41)} diagrams ${String(row.diagrams).padStart(3)}  moves ${String(row.reached).padStart(3)}/${String(row.tried).padEnd(3)} (fuzzy ${row.fuzzy}; illegal ${row.illegal}, ambiguous ${row.ambiguous}, missing ${row.missing})`,
  );
  await task.destroy();
}
console.log(
  `TOTAL diagrams ${total.diagrams}, moves reached ${total.reached}/${total.tried} (fuzzy ${total.fuzzy}; illegal ${total.illegal}, ambiguous ${total.ambiguous}, missing ${total.missing})`,
);
console.log(samples.join("\n"));
