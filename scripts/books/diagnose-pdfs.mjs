#!/usr/bin/env node
// Phase 9.4, step 0: classify a folder of chess books (PDF) without reading their content.
//
// For a sample of pages per book it records only metadata: producer, fonts, how much text is
// visible or invisible (OCR layer), and how much of the page is covered by images. From that it
// guesses the kind of book (digital, scanned with OCR, vectorized scan, scanned without text) and
// how its diagrams are drawn (diagram font, images or vector paths).
//
// Usage: node scripts/books/diagnose-pdfs.mjs <folder> [--pages 24] [--out report.json]

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SAMPLE_PAGES = Number(option("pages", 24));
const OUT = option("out", "lab-results/books-diagnosis/report.json");

if (!folder) {
  console.error("Usage: node scripts/books/diagnose-pdfs.mjs <folder> [--pages 24] [--out file]");
  process.exit(1);
}

// Names of fonts used for diagrams or figurines (Merida, Alpha, ChessBase DiagramTTF, etc.).
const CHESS_FONT =
  /chess|merida|alpha|diagram|leipzig|cases|kingdom|figurine|figur|isc|informator|linares|usc|magnetic|marroquin|habsburg|berlin|condal|motif|harlequin|zurich|tilburg|good ?companion|cburnett|smart|mayan|lucena|fritz|ttf ?fig|chesssym|diagramttf|figurinecb/i;

function samplePageNumbers(count) {
  if (count <= SAMPLE_PAGES) return Array.from({ length: count }, (_, i) => i + 1);
  // Skip the first 4% (cover, front matter) and spread the rest evenly.
  const start = Math.max(1, Math.floor(count * 0.04));
  const span = count - start;
  return Array.from({ length: SAMPLE_PAGES }, (_, i) =>
    Math.min(count, start + Math.round((i * span) / (SAMPLE_PAGES - 1))),
  );
}

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

async function analysePage(page) {
  const viewport = page.getViewport({ scale: 1 });
  const pageArea = viewport.width * viewport.height;
  const ops = await page.getOperatorList();
  const text = await page.getTextContent();

  let ctm = [1, 0, 0, 1, 0, 0];
  let renderMode = 0;
  const stack = [];
  const images = [];
  let invisibleGlyphs = 0;
  let visibleGlyphs = 0;
  let paths = 0;
  let currentFont = null;
  const glyphsByFont = new Map();

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push([ctm, renderMode]);
        break;
      case OPS.restore:
        if (stack.length) [ctm, renderMode] = stack.pop();
        break;
      case OPS.transform:
        ctm = multiply(ctm, a);
        break;
      case OPS.setTextRenderingMode:
        renderMode = a[0];
        break;
      case OPS.setFont:
        currentFont = a[0];
        break;
      case OPS.showText:
      case OPS.showSpacedText: {
        const glyphs = (a[0] ?? []).filter((g) => g && typeof g === "object").length;
        if (renderMode === 3 || renderMode === 7) invisibleGlyphs += glyphs;
        else visibleGlyphs += glyphs;
        if (currentFont)
          glyphsByFont.set(currentFont, (glyphsByFont.get(currentFont) ?? 0) + glyphs);
        break;
      }
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintImageXObjectRepeat: {
        const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
        const w = Math.hypot(ctm[0], ctm[1]);
        const h = Math.hypot(ctm[2], ctm[3]);
        // Pixel size of the image, to know how many pixels a square gets.
        const px = fn === OPS.paintInlineImageXObject ? (a[0]?.width ?? 0) : (a[1] ?? 0);
        images.push({
          cover: area / pageArea,
          aspect: h > 0 ? w / h : 0,
          mask: fn === OPS.paintImageMaskXObject,
          px,
          dpi: w > 0 ? Math.round((px / w) * 72) : 0,
        });
        break;
      }
      case OPS.constructPath:
        paths++;
        break;
    }
  }

  // Real font names live in commonObjs once the operator list is loaded.
  const fonts = [];
  for (const [loadedName, glyphs] of glyphsByFont) {
    let name = loadedName;
    let type3 = false;
    try {
      const font = page.commonObjs.get(loadedName);
      name = font?.name ?? loadedName;
      type3 = Boolean(font?.isType3Font);
    } catch {
      // Font not resolved: keep the internal name.
    }
    fonts.push({ name: name.replace(/^[A-Z]{6}\+/, ""), glyphs, type3, loadedName });
  }

  // Board-like text: 8 or more runs of 8–10 characters without spaces in a font that is not
  // used for prose (diagram fonts draw each rank, borders included, as one run).
  const lineLengths = new Map();
  const longRuns = new Map();
  let chessUnicode = 0;
  for (const item of text.items) {
    if (!("str" in item)) continue;
    const str = item.str.trim();
    const len = [...str].length;
    if (len > 14) longRuns.set(item.fontName, (longRuns.get(item.fontName) ?? 0) + 1);
    if (len >= 8 && len <= 10 && !/\s/.test(str)) {
      const runs = lineLengths.get(item.fontName) ?? [];
      runs.push({ x: item.transform[4], y: item.transform[5] });
      lineLengths.set(item.fontName, runs);
    }
    for (const ch of item.str) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x2654 && cp <= 0x265f) chessUnicode++;
    }
  }
  // The 8 ranks of a diagram share the same x and are evenly spaced vertically.
  const isBoardStack = (runs) => {
    const byX = new Map();
    for (const r of runs) {
      const key = Math.round(r.x / 3);
      byX.set(key, [...(byX.get(key) ?? []), r.y]);
    }
    return [...byX.values()].some((ys) => {
      if (ys.length < 8) return false;
      const sorted = ys.sort((a, b) => b - a);
      const steps = sorted.slice(1).map((y, i) => sorted[i] - y);
      const step = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)];
      return step > 0 && steps.filter((d) => Math.abs(d - step) < step * 0.15).length >= 7;
    });
  };
  const boardFonts = [...lineLengths]
    .filter(([f, runs]) => isBoardStack(runs) && (longRuns.get(f) ?? 0) <= runs.length / 4)
    .map(([f]) => {
      const font = fonts.find((x) => x.loadedName === f);
      return font?.name ?? f;
    });

  const fullPage = images.find((im) => im.cover >= 0.8);
  const fullPageImage = Boolean(fullPage);
  // A diagram image is roughly square and covers 4–45% of the page.
  const diagrams = images.filter(
    (im) =>
      !im.mask && im.cover >= 0.04 && im.cover <= 0.45 && im.aspect > 0.85 && im.aspect < 1.18,
  );
  const diagramImages = diagrams.length;
  const diagramPx = diagrams.map((im) => im.px);
  const scanDpi = fullPage?.dpi ?? 0;

  return {
    visibleGlyphs,
    invisibleGlyphs,
    fullPageImage,
    images: images.length,
    diagramImages,
    diagramPx,
    scanDpi,
    paths,
    fonts,
    boardFonts,
    chessUnicode,
  };
}

function classify(meta, pages) {
  const n = pages.length || 1;
  const share = (pred) => pages.filter(pred).length / n;
  const scanned = share((p) => p.fullPageImage);
  const invisible = pages.reduce((s, p) => s + p.invisibleGlyphs, 0);
  const visible = pages.reduce((s, p) => s + p.visibleGlyphs, 0);
  const fontGlyphs = new Map();
  for (const p of pages) {
    for (const f of p.fonts) {
      const e = fontGlyphs.get(f.name) ?? { glyphs: 0, type3: f.type3, pages: 0 };
      e.glyphs += f.glyphs;
      e.pages++;
      fontGlyphs.set(f.name, e);
    }
  }
  const type3Glyphs = [...fontGlyphs.values()]
    .filter((f) => f.type3)
    .reduce((s, f) => s + f.glyphs, 0);
  const producer = `${meta.Producer ?? ""} ${meta.Creator ?? ""}`;
  const clearScanHint = /paper capture|clearscan|abbyy|finereader|omnipage|readiris/i.test(
    producer,
  );

  // ClearScan names its synthetic fonts "Fd" plus a number; it often keeps the scan as background.
  const clearScanGlyphs = [...fontGlyphs]
    .filter(([name]) => /^Fd\d+$/.test(name))
    .reduce((sum, [, f]) => sum + f.glyphs, 0);

  let kind;
  if (visible > 200 && clearScanGlyphs > visible * 0.5) {
    kind = "escaneo vectorizado (ClearScan)";
  } else if (scanned >= 0.6) {
    if (invisible > visible * 0.5 && invisible > 200) kind = "escaneado con OCR (texto invisible)";
    else if (visible > 200) kind = "escaneado con texto visible (revisar)";
    else kind = "escaneado sin texto";
  } else if (visible < 50 * n) {
    kind = "casi sin texto (revisar)";
  } else if (type3Glyphs > visible * 0.5 || (clearScanHint && scanned < 0.2)) {
    kind = "posible escaneo vectorizado (ClearScan o similar)";
  } else {
    kind = "digital";
  }

  const boardFonts = new Set(pages.flatMap((p) => p.boardFonts));
  const chessFonts = [...fontGlyphs.keys()].filter((name) => CHESS_FONT.test(name));
  const diagramImages = pages.reduce((s, p) => s + p.diagramImages, 0);
  const diagrams = boardFonts.size
    ? "fuente de diagramas"
    : diagramImages >= n * 0.3
      ? "imágenes"
      : scanned >= 0.6
        ? "dentro del escaneo"
        : "vectoriales o sin detectar (revisar)";

  const median = (xs) => {
    const v = xs.filter((x) => x > 0).sort((x, y) => x - y);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  const diagramPx = median(pages.flatMap((p) => p.diagramPx));

  return {
    kind,
    // Median pixel width of a diagram image and of a square (board without border ≈ 92%).
    diagramPx,
    squarePx: Math.round((diagramPx * 0.92) / 8),
    scanDpi: median(pages.map((p) => p.scanDpi)),
    diagrams,
    scannedPageShare: Number(scanned.toFixed(2)),
    visibleGlyphs: visible,
    invisibleGlyphs: invisible,
    type3GlyphShare: visible ? Number((type3Glyphs / visible).toFixed(2)) : 0,
    diagramImagesPerPage: Number((diagramImages / n).toFixed(2)),
    boardFonts: [...boardFonts],
    chessFonts,
    chessUnicodeGlyphs: pages.reduce((s, p) => s + p.chessUnicode, 0),
    fonts: [...fontGlyphs]
      .sort((a, b) => b[1].glyphs - a[1].glyphs)
      .slice(0, 12)
      .map(([name, f]) => ({ name, glyphs: f.glyphs, type3: f.type3, pages: f.pages })),
  };
}

async function analyseBook(file) {
  const data = new Uint8Array(await readFile(file));
  const task = getDocument({
    data,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    fontExtraProperties: true,
  });
  const doc = await task.promise;
  const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
  const pages = [];
  for (const n of samplePageNumbers(doc.numPages)) {
    const page = await doc.getPage(n);
    pages.push({ page: n, ...(await analysePage(page)) });
    page.cleanup();
  }
  const meta = {
    Producer: info?.Producer,
    Creator: info?.Creator,
    PDFFormatVersion: info?.PDFFormatVersion,
  };
  const result = {
    file: path.basename(file),
    pages: doc.numPages,
    ...meta,
    ...classify(meta, pages),
    sample: pages,
  };
  await task.destroy();
  return result;
}

const files = (await readdir(folder)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
const books = [];
for (const f of files) {
  const t0 = performance.now();
  try {
    const book = await analyseBook(path.join(folder, f));
    book.ms = Math.round(performance.now() - t0);
    books.push(book);
    console.log(`${book.kind.padEnd(48)} | diagramas: ${book.diagrams.padEnd(36)} | ${f}`);
  } catch (e) {
    books.push({ file: f, error: String(e) });
    console.log(`ERROR ${f}: ${e}`);
  }
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify(
    { createdAt: new Date().toISOString(), samplePages: SAMPLE_PAGES, books },
    null,
    2,
  ),
);
console.log(`\nInforme: ${OUT}`);
