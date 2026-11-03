#!/usr/bin/env node
// Phase 9.4: render PDF pages to PNG in Node, for the private evaluation set and for debugging.
// Pages stay on the author's PC (write them outside the repository).
//
// Usage: node scripts/books/render-pages.mjs <file.pdf> <page,page,...> <out-prefix> [scale]

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// @napi-rs/canvas is an optional dependency of pdfjs-dist and is not hoisted by pnpm.
const require = createRequire(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const { createCanvas } = require("@napi-rs/canvas");

const [file, pagesArg, out, scaleArg] = process.argv.slice(2);
if (!file || !pagesArg || !out) {
  console.error(
    "Usage: node scripts/books/render-pages.mjs <file.pdf> <pages> <out-prefix> [scale]",
  );
  process.exit(1);
}

// In Node the JBIG2 and JPEG 2000 decoders (WASM) must be given as file paths, not file:// URLs;
// without them scanned pages and many diagrams render blank.
const base = fileURLToPath(new URL("../../node_modules/pdfjs-dist/", import.meta.url)).replaceAll(
  "\\",
  "/",
);
const task = getDocument({
  data: new Uint8Array(await readFile(file)),
  verbosity: 1,
  wasmUrl: `${base}wasm/`,
  standardFontDataUrl: `${base}standard_fonts/`,
  cMapUrl: `${base}cmaps/`,
  iccUrl: `${base}iccs/`,
});
const doc = await task.promise;
for (const n of pagesArg.split(",").map(Number)) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: Number(scaleArg ?? 1) });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const t0 = performance.now();
  await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
  console.log(n, Math.round(performance.now() - t0), "ms");
  await writeFile(`${out}-p${n}.png`, await canvas.encode("png"));
}
await task.destroy();
