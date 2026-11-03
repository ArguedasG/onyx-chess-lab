/// <reference types="vitest/config" />
import { resolve } from "node:path";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, type Plugin } from "vite";
import * as os from "node:os";
import { readdirSync, readFileSync, statSync } from "node:fs";

/**
 * Serves pdf.js runtime files (WASM image decoders, CMaps, standard fonts, ICC profiles) at
 * /pdfjs/ for the Books reader (phase 9.4). Without the decoders, JBIG2 and JPEG 2000 images
 * (scanned books, many diagrams) render blank. The files are only fetched when a book is open.
 */
function pdfjsAssets(): Plugin {
    const root = resolve(import.meta.dirname, "node_modules/pdfjs-dist");
    const folders = ["wasm", "cmaps", "standard_fonts", "iccs"];
    const files = folders.flatMap((folder) =>
        readdirSync(resolve(root, folder))
            .filter(
                (name) =>
                    statSync(resolve(root, folder, name)).isFile() && !name.startsWith("LICENSE"),
            )
            .map((name) => `${folder}/${name}`),
    );
    return {
        name: "onyx-pdfjs-assets",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const path = req.url?.split("?")[0] ?? "";
                const file = path.startsWith("/pdfjs/") ? path.slice("/pdfjs/".length) : null;
                if (!file || !files.includes(file)) return next();
                if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
                res.end(readFileSync(resolve(root, file)));
            });
        },
        generateBundle() {
            for (const file of files) {
                this.emitFile({
                    type: "asset",
                    fileName: `pdfjs/${file}`,
                    source: readFileSync(resolve(root, file)),
                });
            }
        },
    };
}

const isDebug = !!process.env.TAURI_ENV_DEBUG;
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        tanstackRouter({
            target: "react",
        }),
        react(),
        babel({
            presets: [reactCompilerPreset()],
        }),
        pdfjsAssets(),
    ],
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
    build: {
        minify: isDebug ? false : "esbuild",
        sourcemap: isDebug ? "inline" : false,
        target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari13",
    },
    resolve: {
        alias: {
            "@": resolve(import.meta.dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
    },
    define: {
        "import.meta.env.VITE_PLATFORM": JSON.stringify(os.platform()),
    },
});
