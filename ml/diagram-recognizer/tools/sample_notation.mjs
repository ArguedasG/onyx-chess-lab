#!/usr/bin/env node
// Private diagnosis for «Abrir esta partida» (phase 9.4, step 5): dumps the text layer of a few
// pages of every book (lines in reading order, the fonts used and the non-ASCII characters of each
// font), to see how moves and figurines come out. Output stays in private-eval/ (ignored by git).
// Run from the repository root:
//   node ml/diagram-recognizer/tools/sample_notation.mjs <books-folder> [pages per book]

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const folder = process.argv[2];
const perBook = Number(process.argv[3] ?? 2);
const index = JSON.parse(
  await readFile("ml/diagram-recognizer/private-eval/books/index.json", "utf8"),
);
const pagesByBook = new Map();
for (const entry of index) {
  const pages = pagesByBook.get(entry.book) ?? new Set();
  pages.add(entry.page);
  pagesByBook.set(entry.book, pages);
}

const out = [];
for (const [book, pages] of pagesByBook) {
  const task = getDocument({
    data: new Uint8Array(await readFile(path.join(folder, book))),
    verbosity: 0,
  });
  const doc = await task.promise;
  out.push(`\n######## ${book}`);
  const chosen = [...pages].sort((a, b) => a - b);
  const picks = [chosen[Math.floor(chosen.length / 3)], chosen[Math.floor((2 * chosen.length) / 3)]]
    .filter((p, i, all) => p && all.indexOf(p) === i)
    .slice(0, perBook);
  for (const number of picks) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const fonts = new Map();
    const runs = content.items.filter((item) => "str" in item && item.str.trim());
    for (const item of runs) {
      const style = content.styles[item.fontName];
      const key = `${item.fontName} (${style?.fontFamily ?? "?"})`;
      const chars = fonts.get(key) ?? new Set();
      for (const c of item.str) if (c.charCodeAt(0) > 126) chars.add(c);
      fonts.set(key, chars);
    }
    out.push(`\n=== page ${number}: ${runs.length} runs`);
    for (const [font, chars] of fonts)
      out.push(
        `  font ${font}: ${[...chars].map((c) => `${c} U+${c.charCodeAt(0).toString(16)}`).join(", ")}`,
      );
    // Lines: same baseline within 2 units, left to right; runs keep their font in brackets when
    // it is not the page's most common one.
    const counts = new Map();
    for (const r of runs) counts.set(r.fontName, (counts.get(r.fontName) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const lines = [];
    for (const r of [...runs].sort(
      (a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
    )) {
      const y = r.transform[5];
      const line = lines.find((l) => Math.abs(l.y - y) < 2);
      const text = r.fontName === main ? r.str : `[${r.fontName.slice(-4)}:${r.str}]`;
      if (line) line.parts.push({ x: r.transform[4], text });
      else lines.push({ y, parts: [{ x: r.transform[4], text }] });
    }
    for (const l of lines)
      out.push(
        `  ${l.parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.text)
          .join("|")}`,
      );
  }
  await task.destroy();
}
const file = "ml/diagram-recognizer/private-eval/notation-sample.txt";
await writeFile(file, out.join("\n"));
console.log(`written ${file}`);
