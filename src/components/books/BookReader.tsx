import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  NumberInput,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback, useElementSize } from "@mantine/hooks";
import {
  IconBookOff,
  IconCheck,
  IconDeviceFloppy,
  IconRotate,
  IconScan,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSetAtom } from "jotai";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type BoardReading, commands } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { tabsAtom } from "@/state/atoms";
import { diagramDoubtsAtom, diagramEditRequestAtom } from "@/state/diagramReading";
import { type MoveContext, moveContext } from "@/utils/bookText";
import {
  type BookNotes,
  type DiagramCorrection,
  findCorrection,
  loadBookLibrary,
  loadBookNotes,
  saveCorrection,
  updateBook,
} from "@/utils/books";
import { diagramFen, doubtMarks, flipPlacement, legalTurn } from "@/utils/diagramFen";
import { unwrap } from "@/utils/unwrap";
import {
  canvasToBase64,
  contains,
  diagramImages,
  imageCanvas,
  type PdfBox,
  pageCanvas,
  pdfBox,
  regionCanvas,
  textRuns,
  viewportRect,
} from "./diagram";
import { openPdf, type PdfDocument, type PdfPage } from "./pdf";

const GAP = 8;
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];

/** A board found on a page, with its box in PDF units. */
type Detection = { box: PdfBox; reading: BoardReading };

/** Where the side to move came from. */
type TurnSource = "mark" | "text" | "check" | null;

type Result = {
  page: number;
  box: PdfBox;
  context: MoveContext;
  turnSource: TurnSource;
  ms: number;
  reading: BoardReading | null;
  correction: DiagramCorrection | null;
  flipped: boolean;
};

type BookRef = { id: string; path: string; title: string };

function PageView({
  doc,
  number,
  scale,
  highlight,
  detections,
  onDoubleClick,
  onPick,
}: {
  doc: PdfDocument;
  number: number;
  scale: number;
  highlight: PdfBox | null;
  detections: Detection[] | undefined;
  onDoubleClick: (page: PdfPage, x: number, y: number) => void;
  onPick: (page: PdfPage, detection: Detection) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PdfPage | null>(null);

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
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    const task = page.render({
      canvas,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [page, scale]);

  const viewport = page?.getViewport({ scale });
  const rect = (box: PdfBox) => {
    const [x0, y0, x1, y1] = viewportRect(viewport!, box);
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  };

  return (
    <Box pos="relative" style={{ background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }}
        onDoubleClick={(event) => {
          if (!page || !viewport) return;
          const r = event.currentTarget.getBoundingClientRect();
          const [x, y] = viewport.convertToPdfPoint(event.clientX - r.left, event.clientY - r.top);
          onDoubleClick(page, x, y);
        }}
      />
      {page &&
        viewport &&
        detections?.map((detection, i) => (
          <Box
            key={i}
            pos="absolute"
            onClick={() => onPick(page, detection)}
            style={{
              ...rect(detection.box),
              cursor: "pointer",
              border: `3px solid var(--mantine-color-${detection.reading.status === "accepted" ? "green" : "orange"}-6)`,
              background:
                detection.reading.status === "accepted"
                  ? "rgba(64, 192, 87, 0.08)"
                  : "rgba(253, 126, 20, 0.12)",
            }}
          />
        ))}
      {viewport && highlight && (
        <Box
          pos="absolute"
          style={{
            ...rect(highlight),
            border: "3px solid var(--mantine-color-blue-5)",
            pointerEvents: "none",
          }}
        />
      )}
    </Box>
  );
}

function BookReader({ book, tabId }: { book: BookRef; tabId: string }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const setDoubts = useSetAtom(diagramDoubtsAtom);
  const setEditRequest = useSetAtom(diagramEditRequestAtom);
  const setTabs = useSetAtom(tabsAtom);
  const { ref: sizeRef, width } = useElementSize();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [startPage, setStartPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<BookNotes | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Map<number, Detection[]>>(new Map());
  const [detectedInfo, setDetectedInfo] = useState<{
    page: number;
    count: number;
    ms: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = openPdf(book.path);
    task.promise
      .then(async (opened) => {
        if (cancelled) return;
        const first = await opened.getPage(1);
        const [x0, y0, x1, y1] = first.view;
        const entry = (await loadBookLibrary()).books.find((b) => b.id === book.id);
        setStartPage(Math.min(entry?.lastPage ?? 1, opened.numPages));
        setPageSize({ w: x1 - x0, h: y1 - y0 });
        setDoc(opened);
        void updateBook(book.id, {
          pages: opened.numPages,
          lastOpenedAt: new Date().toISOString(),
        });
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    void loadBookNotes(book.id).then((n) => !cancelled && setNotes(n));
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [book.id, book.path]);

  const scale = pageSize && width > 0 ? ((width - 2 * GAP) / pageSize.w) * zoom : 1;
  const pageHeight = pageSize ? pageSize.h * scale : 800;

  const virtualizer = useVirtualizer({
    count: doc?.numPages ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => pageHeight + GAP,
    overscan: 1,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [pageHeight, virtualizer]);

  // Back to the last reading point once the size of a page is known.
  const restored = useRef(false);
  useEffect(() => {
    if (!doc || !pageSize || width === 0 || restored.current) return;
    restored.current = true;
    virtualizer.scrollToIndex(startPage - 1, { align: "start" });
  }, [doc, pageSize, width, startPage, virtualizer]);

  const currentPage = Math.min(
    doc?.numPages ?? 1,
    Math.floor((virtualizer.scrollOffset ?? 0) / (pageHeight + GAP) + 0.3) + 1,
  );
  const saveLastPage = useDebouncedCallback((page: number) => {
    void updateBook(book.id, { lastPage: page });
  }, 1500);
  useEffect(() => {
    if (doc && restored.current) saveLastPage(currentPage);
  }, [doc, currentPage, saveLastPage]);

  const apply = useCallback(
    (next: Result): Result => {
      const { reading, correction, context, flipped } = next;
      if (correction) {
        store.getState().setFen(correction.fen);
        setDoubts(null);
        return next;
      }
      if (!reading?.placement) return next;
      const placement = flipped ? flipPlacement(reading.placement) : reading.placement;
      // A mark printed beside the diagram beats the text; a check on the wrong side beats both.
      const mark = reading.turnMark === "w" || reading.turnMark === "b" ? reading.turnMark : null;
      const turn = mark ?? context.turn ?? "w";
      const fixed = legalTurn(diagramFen(placement, turn, context.fullmove));
      store.getState().setFen(fixed.fen);
      setDoubts(doubtMarks(reading.squares, reading.doubtful, flipped));
      const turnSource: TurnSource = fixed.switched
        ? "check"
        : mark
          ? "mark"
          : context.turn
            ? "text"
            : null;
      const needsReview = reading.status === "review" || turnSource === null;
      setEditRequest((previous) => ({
        store,
        count: (previous?.count ?? 0) + 1,
        open: needsReview,
      }));
      return { ...next, turnSource };
    },
    [store, setDoubts, setEditRequest],
  );

  /** Finds every board of a page (scans, pages with many diagrams). Cached per page. */
  const detectPage = useCallback(
    async (page: PdfPage): Promise<Detection[]> => {
      const cached = detections.get(page.pageNumber);
      if (cached) return cached;
      const started = performance.now();
      const { canvas, viewport } = await pageCanvas(page);
      const readings = unwrap(await commands.detectBoardImages(await canvasToBase64(canvas)));
      const found = readings
        .filter((r) => r.grid)
        .map((reading) => ({ reading, box: pdfBox(viewport, reading.grid!) }));
      setDetections((previous) => new Map(previous).set(page.pageNumber, found));
      setDetectedInfo({
        page: page.pageNumber,
        count: found.length,
        ms: Math.round(performance.now() - started),
      });
      return found;
    },
    [detections],
  );

  const finish = useCallback(
    async (page: PdfPage, box: PdfBox, reading: BoardReading | null, started: number) => {
      const correction = notes ? findCorrection(notes, page.pageNumber, box) : null;
      const context = moveContext(await textRuns(page), box);
      const next = apply({
        page: page.pageNumber,
        box,
        context,
        turnSource: null,
        ms: Math.round(performance.now() - started),
        reading: correction ? null : reading,
        correction,
        flipped: false,
      });
      setResult(next);
    },
    [notes, apply],
  );

  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setReadError(null);
      try {
        await work();
      } catch (e) {
        setReadError(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const readAt = (page: PdfPage, x: number, y: number) =>
    run(async () => {
      const started = performance.now();
      const image = (await diagramImages(page)).find((im) => contains(im.box, x, y));
      if (image) {
        // An embedded diagram: its own pixels, already decoded for the page.
        const saved = notes ? findCorrection(notes, page.pageNumber, image.box) : null;
        const reading = saved
          ? null
          : unwrap(
              await commands.recognizeBoardImage(
                await canvasToBase64(
                  imageCanvas(page, image.objId) ?? (await regionCanvas(page, image.box)),
                ),
              ),
            );
        await finish(page, image.box, reading, started);
        return;
      }
      // A scan or a vector diagram: every board of the page, then the one under the click.
      const found = (await detectPage(page)).find((d) => contains(d.box, x, y));
      if (!found) {
        setResult(null);
        setReadError(t("Board.ImageReader.NoBoard"));
        return;
      }
      await finish(page, found.box, found.reading, started);
    });

  const pick = (page: PdfPage, detection: Detection) =>
    run(() => finish(page, detection.box, detection.reading, performance.now()));

  const detectCurrent = () =>
    run(async () => {
      if (!doc) return;
      const page = await doc.getPage(currentPage);
      setDetections((previous) => {
        const next = new Map(previous);
        next.delete(currentPage);
        return next;
      });
      await detectPage(page);
    });

  const flip = () => {
    if (!result?.reading) return;
    setResult(apply({ ...result, flipped: !result.flipped }));
  };

  const usePosition = () => {
    setDoubts(null);
    setEditRequest((previous) => ({ store, count: (previous?.count ?? 0) + 1, open: false }));
  };

  const save = async () => {
    if (!result) return;
    const fen = store.getState().root.fen;
    const readPlacement = result.reading?.placement
      ? result.flipped
        ? flipPlacement(result.reading.placement)
        : result.reading.placement
      : (result.correction?.readPlacement ?? null);
    setNotes(
      await saveCorrection(book.id, { page: result.page, box: result.box, fen, readPlacement }),
    );
    setResult({
      ...result,
      correction: { page: result.page, box: result.box, fen, readPlacement, savedAt: "" },
    });
  };

  const closeBook = () =>
    setTabs((tabs) => tabs.map((tab) => (tab.value === tabId ? { ...tab, book: undefined } : tab)));

  const zoomBy = (step: number) => {
    const index = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, index + step))]);
  };

  const status = result?.correction
    ? { color: "blue", text: t("Books.Result.Corrected") }
    : result?.reading?.status === "accepted"
      ? { color: "green", text: t("Board.ImageReader.Accepted") }
      : result?.reading?.status === "review"
        ? {
            color: "orange",
            text: t("Board.ImageReader.Review", { count: result.reading.doubtful.length }),
          }
        : { color: "red", text: t("Board.ImageReader.NoBoard") };
  const turnText = (() => {
    if (!result || result.correction) return null;
    const side = store.getState().root.fen.split(" ")[1];
    if (result.turnSource === "check")
      return t(side === "b" ? "Books.Result.TurnCheckBlack" : "Books.Result.TurnCheckWhite");
    if (result.turnSource === "mark")
      return t(side === "b" ? "Books.Result.TurnMarkBlack" : "Books.Result.TurnMarkWhite");
    if (result.turnSource === "text")
      return t(side === "b" ? "Books.Result.TurnBlack" : "Books.Result.TurnWhite", {
        text: (result.context.evidence ?? "").slice(0, 40),
      });
    return t("Books.Result.TurnUnknown");
  })();

  return (
    <Stack h="100%" gap={4} ref={sizeRef} style={{ minWidth: 0 }}>
      <Group gap="xs" wrap="nowrap" px={4} pt={4}>
        <Text size="sm" fw={600} truncate style={{ flex: 1, minWidth: 0 }} title={book.path}>
          {book.title}
        </Text>
        {doc && (
          <Group gap={4} wrap="nowrap">
            <NumberInput
              size="xs"
              w={64}
              min={1}
              max={doc.numPages}
              value={currentPage}
              hideControls
              onChange={(value) => {
                const n = Number(value);
                if (n >= 1 && n <= doc.numPages)
                  virtualizer.scrollToIndex(n - 1, { align: "start" });
              }}
            />
            <Text size="xs" c="dimmed">
              / {doc.numPages}
            </Text>
          </Group>
        )}
        <Tooltip label={t("Books.Detect")}>
          <ActionIcon variant="subtle" size="sm" onClick={detectCurrent} disabled={!doc || busy}>
            <IconScan size="1rem" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Books.ZoomOut")}>
          <ActionIcon variant="subtle" size="sm" onClick={() => zoomBy(-1)}>
            <IconZoomOut size="1rem" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Books.ZoomIn")}>
          <ActionIcon variant="subtle" size="sm" onClick={() => zoomBy(1)}>
            <IconZoomIn size="1rem" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Books.Close")}>
          <ActionIcon variant="subtle" size="sm" onClick={closeBook}>
            <IconBookOff size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="xs" c="dimmed" px={4}>
        {detectedInfo ? t("Books.Detected", detectedInfo) : t("Books.Hint")}
      </Text>

      <Box pos="relative" style={{ flex: 1, minHeight: 0 }}>
        {error ? (
          <Alert color="red" m="xs">
            {t("Books.OpenError", { error })}
          </Alert>
        ) : !doc ? (
          <Center h="100%">
            <Loader size="sm" />
          </Center>
        ) : (
          <div ref={scrollRef} style={{ height: "100%", overflow: "auto" }}>
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((item) => (
                <div
                  key={item.key}
                  style={{
                    position: "absolute",
                    top: item.start,
                    left: GAP,
                    width: pageSize ? pageSize.w * scale : "100%",
                    height: pageHeight,
                  }}
                >
                  <PageView
                    doc={doc}
                    number={item.index + 1}
                    scale={scale}
                    highlight={result && result.page === item.index + 1 ? result.box : null}
                    detections={detections.get(item.index + 1)}
                    onDoubleClick={(page, x, y) => void readAt(page, x, y)}
                    onPick={(page, detection) => void pick(page, detection)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {(busy || result || readError) && (
          <Paper
            pos="absolute"
            bottom={8}
            left={8}
            right={8}
            p="xs"
            shadow="md"
            withBorder
            style={{ zIndex: 5 }}
          >
            {busy ? (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="xs">{t("Board.ImageReader.Reading")}</Text>
              </Group>
            ) : readError ? (
              <Text size="xs" c="red">
                {readError}
              </Text>
            ) : (
              result && (
                <Stack gap={4}>
                  <Text size="xs" fw={600} c={status.color}>
                    {status.text}
                  </Text>
                  {turnText && <Text size="xs">{turnText}</Text>}
                  {result.reading && result.reading.problems.length > 0 && (
                    <Text size="xs" c="dimmed">
                      {t("Books.Result.CheckRules")}
                    </Text>
                  )}
                  <Group gap="xs" justify="space-between">
                    <Group gap="xs">
                      {(result.reading?.placement || result.correction) && (
                        <Button
                          size="compact-xs"
                          leftSection={<IconCheck size="0.9rem" />}
                          onClick={usePosition}
                        >
                          {t("Books.Result.Use")}
                        </Button>
                      )}
                      {result.reading?.placement && (
                        <Button
                          size="compact-xs"
                          variant="default"
                          leftSection={<IconRotate size="0.9rem" />}
                          onClick={flip}
                        >
                          {t("Board.ImageReader.Flip")}
                        </Button>
                      )}
                      {(result.reading?.placement || result.correction) && (
                        <Tooltip label={t("Books.Result.SaveHelp")}>
                          <Button
                            size="compact-xs"
                            variant="default"
                            leftSection={<IconDeviceFloppy size="0.9rem" />}
                            onClick={() => void save()}
                          >
                            {t("Books.Result.Save")}
                          </Button>
                        </Tooltip>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t("Books.Result.Timing", { ms: result.ms, page: result.page })}
                    </Text>
                  </Group>
                </Stack>
              )
            )}
          </Paper>
        )}
      </Box>
    </Stack>
  );
}

export default BookReader;
