import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// Vite turns `?url` imports into the URL of the emitted file (a default export the linter cannot see).
// oxlint-disable-next-line import/default
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// The legacy build supports the older WebKit of macOS and Linux webviews.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = pdfjs.PDFDocumentProxy;
export type PdfPage = pdfjs.PDFPageProxy;
export const OPS = pdfjs.OPS;
export const ImageKind = pdfjs.ImageKind;

/**
 * Opens a book from its path. The file is read in ranges through the asset protocol, so a long
 * book only loads the parts that are shown. Runtime files (WASM decoders for JBIG2 and JPEG 2000,
 * CMaps, standard fonts) are served at /pdfjs/ by the Vite plugin in vite.config.ts.
 */
export function openPdf(path: string) {
    return pdfjs.getDocument({
        url: convertFileSrc(path),
        wasmUrl: "/pdfjs/wasm/",
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        iccUrl: "/pdfjs/iccs/",
        disableAutoFetch: true,
        rangeChunkSize: 256 * 1024,
    });
}
