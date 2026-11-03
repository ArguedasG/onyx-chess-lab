#!/usr/bin/env node
// Private evaluation set: extracts the embedded diagram images of the author's books.
//
// For each PDF it walks pages spread over the book and saves up to --per-book images that look
// like diagrams (roughly square, 4–45 % of the page) as PNG, plus an index. The output folder is
// ignored by git: book content never leaves the author's PC.
//
// Usage (from the repository root):
//   node ml/diagram-recognizer/tools/extract_diagrams.mjs <books-folder> [--per-book 30]
//     [--out ml/diagram-recognizer/private-eval/books]

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, ImageKind, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const { createCanvas } = require("@napi-rs/canvas");

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) =>
  args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const PER_BOOK = Number(opt("per-book", 30));
const OUT = opt("out", "ml/diagram-recognizer/private-eval/books");
const base = fileURLToPath(
  new URL("../../../node_modules/pdfjs-dist/", import.meta.url),
).replaceAll("\\", "/");

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function slug(file) {
  return file
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function diagramsOnPage(page) {
  const { width, height } = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const found = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, a);
    else if (fn === OPS.paintImageXObject) {
      const w = Math.hypot(ctm[0], ctm[1]);
      const h = Math.hypot(ctm[2], ctm[3]);
      const cover = (w * h) / (width * height);
      if (cover >= 0.04 && cover <= 0.45 && w / h > 0.85 && w / h < 1.18) {
        // PDF y grows upwards; the box is stored in page units from the top-left.
        found.push({
          objId: a[0],
          box: [ctm[4], height - ctm[5] - h, ctm[4] + w, height - ctm[5]],
        });
      }
    }
  }
  return found;
}

function toCanvas(img) {
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(img.width, img.height);
  const n = img.width * img.height;
  if (img.kind === ImageKind.RGBA_32BPP) out.data.set(img.data.subarray(0, n * 4));
  else if (img.kind === ImageKind.RGB_24BPP) {
    for (let i = 0; i < n; i++) {
      out.data[i * 4] = img.data[i * 3];
      out.data[i * 4 + 1] = img.data[i * 3 + 1];
      out.data[i * 4 + 2] = img.data[i * 3 + 2];
      out.data[i * 4 + 3] = 255;
    }
  } else {
    // 1 bit per pixel, rows padded to a byte, 1 = white.
    const rowBytes = Math.ceil(img.width / 8);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const bit = (img.data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const o = (y * img.width + x) * 4;
        out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
        out.data[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

const index = [];
for (const file of (await readdir(folder)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()) {
  const task = getDocument({
    data: new Uint8Array(await readFile(path.join(folder, file))),
    verbosity: 0,
    isOffscreenCanvasSupported: false,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  });
  const doc = await task.promise;
  const dir = path.join(OUT, slug(file));
  await mkdir(dir, { recursive: true });
  const seen = new Set();
  let saved = 0;
  // Walk pages in a spread order (strided), so the sample covers the whole book.
  const stride = Math.max(1, Math.floor(doc.numPages / (PER_BOOK * 1.5)));
  for (let start = 0; start < stride && saved < PER_BOOK; start++) {
    for (
      let n = Math.max(1, Math.floor(doc.numPages * 0.04)) + start;
      n <= doc.numPages && saved < PER_BOOK;
      n += stride
    ) {
      const page = await doc.getPage(n);
      for (const d of await diagramsOnPage(page)) {
        if (saved >= PER_BOOK || seen.has(d.objId)) continue;
        seen.add(d.objId);
        // Images reused across pages ("g_" ids) live in commonObjs.
        const store = d.objId.startsWith("g_") ? page.commonObjs : page.objs;
        const img = await new Promise((resolve) => {
          store.get(d.objId, resolve);
          setTimeout(() => resolve(null), 5000);
        });
        if (!img?.data) continue;
        const name = `p${String(n).padStart(4, "0")}-${saved}.png`;
        await writeFile(path.join(dir, name), await toCanvas(img).encode("png"));
        index.push({
          book: file,
          slug: slug(file),
          page: n,
          file: `${slug(file)}/${name}`,
          pageBox: d.box,
          width: img.width,
          height: img.height,
        });
        saved++;
      }
      page.cleanup();
    }
  }
  console.log(`${String(saved).padStart(3)} ${file}`);
  await task.destroy();
}
await writeFile(path.join(OUT, "index.json"), JSON.stringify(index, null, 2));
