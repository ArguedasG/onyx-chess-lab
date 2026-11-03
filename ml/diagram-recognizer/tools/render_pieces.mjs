#!/usr/bin/env node
// Rasterizes the free piece sets to 256 px RGBA PNGs for the synthetic data generator.
//
// Sources: the sets Onyx ships (public/pieces/*.css, SVG as data URIs) plus three free Lichess sets
// that Onyx does not ship (downloaded from lichess-org/lila at a fixed commit). Only sets whose
// license is compatible with GPLv3 are listed; see the dataset card for the audit.
//
// Usage (from the repository root): node ml/diagram-recognizer/tools/render_pieces.mjs [out-dir]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const { createCanvas, loadImage } = require("@napi-rs/canvas");

// License of each set, from lila's COPYING.md (2026-11-02).
export const SETS = {
  cburnett: { license: "GPL-2.0-or-later", source: "onyx" },
  merida: { license: "GPL-2.0-or-later", source: "onyx" },
  chessnut: { license: "Apache-2.0", source: "onyx" },
  fantasy: { license: "MIT", source: "onyx" },
  spatial: { license: "MIT", source: "onyx" },
  pixel: { license: "AGPL-3.0-or-later", source: "onyx" },
  shapes: { license: "CC-BY-SA-4.0", source: "onyx" },
  pirouetti: { license: "AGPL-3.0-or-later", source: "onyx" },
  mpchess: { license: "GPL-3.0-or-later", source: "lila" },
  celtic: { license: "MIT", source: "lila" },
  // CC BY-NC-SA 4.0 sets by sadsnake1, used with the author's permission (2026-11-02; see the
  // dataset card). From model 1.1.0.
  ...Object.fromEntries(
    ["maestro", "staunty", "cardinal", "tatiana", "fresca", "gioco", "dubrovny", "icpieces"].map(
      (set) => [
        set,
        { license: "CC-BY-NC-SA-4.0", permission: "sadsnake1, 2026-11-02", source: "onyx" },
      ],
    ),
  ),
};
const LILA_COMMIT = "2e3e641c32b361c113e696cee34f9fddefef6727";
const LILA = `https://raw.githubusercontent.com/lichess-org/lila/${LILA_COMMIT}/public/piece`;

const ROLES = { pawn: "P", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" };
const SIZE = 256;

async function svgFromCss(set) {
  const css = await readFile(path.join("public", "pieces", `${set}.css`), "utf8");
  const out = {};
  const re =
    /\.(\w+)\.(white|black)\s*\{background-image:url\('data:image\/svg\+xml;base64,([^']+)'\)/g;
  for (const [, role, color, b64] of css.matchAll(re)) {
    if (!ROLES[role]) continue;
    out[(color === "white" ? "w" : "b") + ROLES[role]] = Buffer.from(b64, "base64");
  }
  return out;
}

async function svgFromLila(set) {
  const out = {};
  for (const color of ["w", "b"]) {
    for (const role of Object.values(ROLES)) {
      const res = await fetch(`${LILA}/${set}/${color}${role}.svg`);
      if (!res.ok) throw new Error(`${set}/${color}${role}: HTTP ${res.status}`);
      out[color + role] = Buffer.from(await res.arrayBuffer());
    }
  }
  return out;
}

const outDir = process.argv[2] ?? "ml/diagram-recognizer/data/pieces";
const manifest = {};
for (const [set, meta] of Object.entries(SETS)) {
  const svgs = meta.source === "onyx" ? await svgFromCss(set) : await svgFromLila(set);
  if (Object.keys(svgs).length !== 12)
    throw new Error(`${set}: ${Object.keys(svgs).length} pieces`);
  await mkdir(path.join(outDir, set), { recursive: true });
  const hashes = {};
  for (const [name, svg] of Object.entries(svgs)) {
    const image = await loadImage(svg);
    const canvas = createCanvas(SIZE, SIZE);
    canvas.getContext("2d").drawImage(image, 0, 0, SIZE, SIZE);
    await writeFile(path.join(outDir, set, `${name}.png`), await canvas.encode("png"));
    hashes[name] = createHash("sha256").update(svg).digest("hex");
  }
  manifest[set] = {
    ...meta,
    ...(meta.source === "lila" && { commit: LILA_COMMIT }),
    svgSha256: hashes,
  };
  console.log(set, meta.license);
}
await writeFile(path.join(outDir, "pieces.json"), JSON.stringify(manifest, null, 2));
