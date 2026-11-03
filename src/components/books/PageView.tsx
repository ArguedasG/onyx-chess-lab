import { useDebouncedValue } from "@mantine/hooks";
import { memo, useEffect, useRef, useState } from "react";
import type { BoardReading } from "@/bindings";
import { type PdfBox, viewportRect } from "./diagram";
import { type PdfDocument, type PdfPage, TextLayer } from "./pdf";
import classes from "./PageView.module.css";

/** A board found on a page, with its box in PDF units. */
export type Detection = { box: PdfBox; reading: BoardReading; corrected?: boolean };

export function markColor(detection: Detection): string {
  if (detection.corrected) return "var(--mantine-color-blue-6)";
  return detection.reading.status === "accepted"
    ? "var(--mantine-color-green-6)"
    : "var(--mantine-color-orange-6)";
}

/**
 * One page of the book: the canvas, the text layer (to select and copy text) and the marks of the
 * diagrams found on it. While zooming the canvas is stretched and only drawn again once the zoom
 * settles; the text layer follows the zoom through `--total-scale-factor`.
 */
function PageView({
  doc,
  number,
  scale,
  selectable,
  highlight,
  detections,
  onDoubleClick,
  onPick,
}: {
  doc: PdfDocument;
  number: number;
  scale: number;
  selectable: boolean;
  highlight: PdfBox | null;
  detections: Detection[] | undefined;
  onDoubleClick: (page: PdfPage, x: number, y: number) => void;
  onPick: (page: PdfPage, detection: Detection) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PdfPage | null>(null);
  const [renderScale] = useDebouncedValue(scale, 180);

  useEffect(() => {
    let alive = true;
    void doc.getPage(number).then((p) => alive && setPage(p));
    return () => {
      alive = false;
    };
  }, [doc, number]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: renderScale });
    const next = document.createElement("canvas");
    next.width = Math.floor(viewport.width * dpr);
    next.height = Math.floor(viewport.height * dpr);
    const task = page.render({
      canvas: next,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    // Drawn off screen and copied at once, so the old picture stays until the new one is ready.
    task.promise
      .then(() => {
        canvas.width = next.width;
        canvas.height = next.height;
        canvas.getContext("2d")?.drawImage(next, 0, 0);
      })
      .catch(() => {});
    return () => task.cancel();
  }, [page, renderScale]);

  useEffect(() => {
    const container = textRef.current;
    if (!page || !container || !selectable) return;
    const layer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale: 1 }),
    });
    layer.render().catch(() => {});
    return () => {
      layer.cancel();
      container.replaceChildren();
    };
  }, [page, selectable]);

  const viewport = page?.getViewport({ scale });
  const rect = (box: PdfBox) => {
    const [x0, y0, x1, y1] = viewportRect(viewport!, box);
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  };

  return (
    <div
      className={classes.page}
      style={{ height: "100%", "--total-scale-factor": scale } as React.CSSProperties}
      onDoubleClick={(event) => {
        if (!page || !viewport) return;
        // A double click on a word selects it; only blank areas and pictures read diagrams.
        if ((event.target as HTMLElement).closest(".textLayer span")) return;
        const r = event.currentTarget.getBoundingClientRect();
        const [x, y] = viewport.convertToPdfPoint(event.clientX - r.left, event.clientY - r.top);
        onDoubleClick(page, x, y);
      }}
    >
      <canvas ref={canvasRef} className={classes.canvas} />
      {selectable && <div ref={textRef} className="textLayer" />}
      {page &&
        viewport &&
        detections?.map((detection, i) => (
          <div
            key={i}
            className={classes.mark}
            style={
              {
                ...rect(detection.box),
                "--mark-color": markColor(detection),
              } as React.CSSProperties
            }
            onClick={() => onPick(page, detection)}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ))}
      {viewport && highlight && <div className={classes.highlight} style={rect(highlight)} />}
    </div>
  );
}

export default memo(PageView);
