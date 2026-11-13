// The pdf.js worker, bundled by Vite so it gets the polyfills (imports run in order, so they are
// installed before pdf.js) and the build target's syntax lowering. pdf.js starts listening for
// messages by itself when it is imported inside a worker.
import "@/polyfills";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
