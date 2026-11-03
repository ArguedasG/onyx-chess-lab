import { openPdf } from "./pdf";

const COVER_WIDTH = 320;

/**
 * A small JPEG of the book's first page, for the library. Only the first page is read (the file
 * is fetched in ranges), and this module, with pdf.js, loads only when a cover is missing.
 */
export async function renderCover(path: string): Promise<Uint8Array> {
    const task = openPdf(path);
    try {
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvas, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.82),
        );
        if (!blob) throw new Error("cover");
        return new Uint8Array(await blob.arrayBuffer());
    } finally {
        void task.destroy();
    }
}
