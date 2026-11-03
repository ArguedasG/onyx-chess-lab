import type { TextRun } from "@/utils/bookText";
import { ImageKind, OPS, type PdfPage } from "./pdf";

/** A rectangle in PDF units (x0, y0, x1, y1), origin at the page's bottom-left. */
export type PdfBox = [number, number, number, number];

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: number[]): Matrix {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

/** The unit square an image is painted on, through the current matrix. */
function imageBox(m: Matrix): PdfBox {
    const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]];
    const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export type EmbeddedImage = { objId: string; box: PdfBox; width: number };

/**
 * Images painted on the page that look like a diagram: roughly square, 2–60 % of the page.
 * Full-page images (scans) are left out; their diagrams are found by cropping instead.
 */
export async function diagramImages(page: PdfPage): Promise<EmbeddedImage[]> {
    const [px0, py0, px1, py1] = page.view;
    const pageArea = (px1 - px0) * (py1 - py0);
    const ops = await page.getOperatorList();
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const found: EmbeddedImage[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === OPS.transform) ctm = multiply(ctm, args);
        else if (fn === OPS.paintFormXObjectBegin) {
            stack.push(ctm);
            if (Array.isArray(args[0]) && args[0].length === 6) ctm = multiply(ctm, args[0]);
        } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
        else if (fn === OPS.paintImageXObject) {
            const box = imageBox(ctm);
            const w = box[2] - box[0];
            const h = box[3] - box[1];
            const cover = (w * h) / pageArea;
            if (h > 0 && cover >= 0.02 && cover <= 0.6 && w / h > 0.8 && w / h < 1.25) {
                found.push({ objId: args[0], box, width: args[1] ?? 0 });
            }
        }
    }
    return found;
}

export const contains = (box: PdfBox, x: number, y: number) =>
    x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

type DecodedImage = {
    width: number;
    height: number;
    bitmap?: ImageBitmap;
    data?: Uint8ClampedArray;
    kind?: number;
};

/** The decoded pixels of an embedded image as a canvas (already loaded when the page is shown). */
export function imageCanvas(page: PdfPage, objId: string): HTMLCanvasElement | null {
    const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
    if (!store.has(objId)) return null;
    const image = store.get(objId) as DecodedImage | null;
    if (!image) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (image.bitmap) {
        ctx.drawImage(image.bitmap, 0, 0);
        return canvas;
    }
    if (!image.data) return null;
    const out = ctx.createImageData(image.width, image.height);
    const n = image.width * image.height;
    if (image.kind === ImageKind.RGBA_32BPP) out.data.set(image.data.subarray(0, n * 4));
    else if (image.kind === ImageKind.RGB_24BPP) {
        for (let i = 0; i < n; i++) {
            out.data[i * 4] = image.data[i * 3];
            out.data[i * 4 + 1] = image.data[i * 3 + 1];
            out.data[i * 4 + 2] = image.data[i * 3 + 2];
            out.data[i * 4 + 3] = 255;
        }
    } else {
        // 1 bit per pixel, rows padded to a byte, 1 = white.
        const rowBytes = Math.ceil(image.width / 8);
        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                const v = (image.data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
                const o = (y * image.width + x) * 4;
                out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
                out.data[o + 3] = 255;
            }
        }
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
}

type Viewport = ReturnType<PdfPage["getViewport"]>;

/** A PDF-units box in viewport (CSS or canvas) pixels: [x0, y0, x1, y1] with y down. */
export function viewportRect(viewport: Viewport, box: PdfBox): [number, number, number, number] {
    const [ax, ay] = viewport.convertToViewportPoint(box[0], box[1]);
    const [bx, by] = viewport.convertToViewportPoint(box[2], box[3]);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/** Renders a region of the page (PDF units) to a canvas about `target` pixels wide. */
export async function regionCanvas(
    page: PdfPage,
    box: PdfBox,
    target = 1000,
): Promise<HTMLCanvasElement> {
    const scale = Math.min(4, Math.max(1, target / (box[2] - box[0])));
    const viewport = page.getViewport({ scale });
    const [left, top, right, bottom] = viewportRect(viewport, box);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(right - left));
    canvas.height = Math.max(1, Math.round(bottom - top));
    await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -left, -top] }).promise;
    return canvas;
}

export function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error("canvas"));
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        }, "image/png");
    });
}

/** Text runs of the page in PDF units, for the side-to-move heuristics. */
export async function textRuns(page: PdfPage): Promise<TextRun[]> {
    const content = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [, , c, d, e, f] = item.transform as number[];
        runs.push({
            str: item.str,
            x: e,
            y: f,
            width: item.width,
            height: item.height || Math.hypot(c, d),
        });
    }
    return runs;
}

/** The whole page rendered about `targetHeight` pixels tall, for the page detector. */
export async function pageCanvas(
    page: PdfPage,
    targetHeight = 1500,
): Promise<{ canvas: HTMLCanvasElement; viewport: Viewport }> {
    const height = page.view[3] - page.view[1];
    const scale = Math.min(3, Math.max(1, targetHeight / height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return { canvas, viewport };
}

/** A box in the pixels of a rendered viewport back to PDF units. */
export function pdfBox(viewport: Viewport, grid: [number, number, number, number]): PdfBox {
    const [ax, ay] = viewport.convertToPdfPoint(grid[0], grid[1]);
    const [bx, by] = viewport.convertToPdfPoint(grid[2], grid[3]);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}
