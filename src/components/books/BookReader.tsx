import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Menu,
  NumberInput,
  Portal,
  SegmentedControl,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback, useElementSize } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconBookOff,
  IconBrain,
  IconChess,
  IconChevronDown,
  IconChevronUp,
  IconDots,
  IconHandStop,
  IconPointer,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { type BoardReading, commands } from "@/bindings";
import ConfirmModal from "@/components/common/ConfirmModal";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { BOOK_DIAGRAM_BAR_ID } from "@/components/tabs/BookStudyColumn";
import { tabsAtom } from "@/state/atoms";
import { diagramDoubtsAtom, diagramEditRequestAtom } from "@/state/diagramReading";
import { INITIAL_FEN } from "chessops/fen";
import { type Line, openLine, plyOfFen } from "@/utils/bookGame";
import { type MoveContext, moveContext, type TextRun } from "@/utils/bookText";
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
  pageImages,
  pdfBox,
  readingOrder,
  regionCanvas,
  textRuns,
} from "./diagram";
import DiagramBar, { type DiagramBarState } from "./DiagramBar";
import { moveAt, type TextWindow, textWindow, tokenBox } from "./bookLine";
import PageView, { type Detection, type MoveMark } from "./PageView";
import { openPdf, type PdfDocument, type PdfPage } from "./pdf";

const GAP = 10;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
/** CSS pixels per PDF point at "100 %" (96 / 72), as PDF viewers count it. */
const ACTUAL_SIZE = 4 / 3;
/** How far "next diagram" looks before giving up. */
const STEP_PAGES = 40;

/** Where the side to move came from. */
type TurnSource = "mark" | "text" | "check" | "manual" | null;

type Result = {
  page: number;
  box: PdfBox;
  context: MoveContext;
  turnSource: TurnSource;
  ms: number;
  reading: BoardReading | null;
  correction: DiagramCorrection | null;
  flipped: boolean;
  /** The editor was opened to fix doubtful squares or an unknown turn. */
  needsReview: boolean;
};

type BookRef = { id: string; path: string; title: string };

type Tool = "select" | "hand";

/** Reader preferences shared by every book. */
const readerPrefsAtom = atomWithStorage<{ tool: Tool; diagrams: boolean }>("bookReaderPrefs-v1", {
  tool: "select",
  diagrams: false,
});

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

const overlap = (a: PdfBox, b: PdfBox) => {
  const inter =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (r: PdfBox) => (r[2] - r[0]) * (r[3] - r[1]);
  return inter > 0.6 * Math.min(area(a), area(b));
};

function BookReader({ book, tabId }: { book: BookRef; tabId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useContext(TreeStateContext)!;
  const rootFen = useStore(store, (s) => s.root.fen);
  const setDoubts = useSetAtom(diagramDoubtsAtom);
  const setEditRequest = useSetAtom(diagramEditRequestAtom);
  const setTabs = useSetAtom(tabsAtom);
  const [prefs, setPrefs] = useAtom(readerPrefsAtom);
  const { ref: viewRef, width: viewW, height: viewH } = useElementSize();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [pageSize, setPageSize] = useState<{ w: number; h: number; top: number } | null>(null);
  const [startPage, setStartPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<BookNotes | null>(null);
  // Boards corrected in this book that the reader has learned from (per-book adaptation).
  const [learned, setLearned] = useState(0);
  const learnedRef = useRef(0);
  learnedRef.current = learned;
  const [forgetOpen, setForgetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // A line of the book's text opened on the board («Abrir esta partida»).
  const [line, setLine] = useState<{
    line: Line;
    window: TextWindow;
    page: number;
    ms: number;
  } | null>(null);
  const position = useStore(store, (s) => s.position);
  const runsCache = useRef(new Map<number, TextRun[]>());
  const [readError, setReadError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Map<number, Detection[]>>(new Map());
  const [scanning, setScanning] = useState(false);
  const scannedRef = useRef(new Map<number, Detection[]>());
  const pendingScans = useRef(new Map<number, Promise<Detection[]>>());

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
        setPageSize({ w: x1 - x0, h: y1 - y0, top: y1 });
        setDoc(opened);
        void updateBook(book.id, {
          pages: opened.numPages,
          lastOpenedAt: new Date().toISOString(),
        });
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    void loadBookNotes(book.id).then((n) => !cancelled && setNotes(n));
    void commands
      .bookMemorySize(book.id)
      .then((r) => !cancelled && r.status === "ok" && setLearned(r.data));
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [book.id, book.path]);

  // Geometry. Every page is laid out with the size of the first one, so the visible pages and
  // the scroll position of any page are plain arithmetic.
  const numPages = doc?.numPages ?? 0;
  // Width of the vertical scrollbar (kept with `scrollbar-gutter: stable`), measured once.
  const [gutter, setGutter] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) setGutter(el.offsetWidth - el.clientWidth);
  }, [doc]);
  const innerW = viewW - (gutter ?? 0);
  const fitScale = pageSize && innerW > 0 ? (innerW - 2 * GAP) / pageSize.w : 1;
  const scale = fitScale * zoom;
  const pageW = pageSize ? pageSize.w * scale : 0;
  const pageH = pageSize ? pageSize.h * scale : 800;
  const stride = pageH + GAP;
  const contentW = Math.max(innerW, pageW + 2 * GAP);
  const pageLeft = (contentW - pageW) / 2;
  const firstVisible = Math.max(1, Math.floor(scrollTop / stride) + 1);
  const lastVisible = Math.min(numPages, Math.floor((scrollTop + viewH) / stride) + 1);
  const currentPage = Math.min(
    Math.max(1, numPages),
    Math.floor((scrollTop + Math.min(viewH, pageH) * 0.3) / stride) + 1,
  );

  const geometry = useRef({ scale, stride, pageLeft, zoom, fitScale });
  geometry.current = { scale, stride, pageLeft, zoom, fitScale };

  const scrollToPage = useCallback((page: number, offset = 0) => {
    const el = scrollRef.current;
    if (el) el.scrollTop = (page - 1) * geometry.current.stride + offset;
  }, []);

  // Back to the last reading point once the size of a page is known.
  const restored = useRef(false);
  useEffect(() => {
    if (!doc || !pageSize || viewW === 0 || gutter === null || restored.current) return;
    restored.current = true;
    scrollToPage(startPage);
  }, [doc, pageSize, viewW, gutter, startPage, scrollToPage]);

  const saveLastPage = useDebouncedCallback((page: number) => {
    void updateBook(book.id, { lastPage: page });
  }, 1500);
  useEffect(() => {
    if (doc && restored.current) saveLastPage(currentPage);
  }, [doc, currentPage, saveLastPage]);

  // Zoom keeps the point under the cursor (or the centre) where it was.
  const pendingScroll = useRef<{ top: number; left: number } | null>(null);
  const zoomTo = useCallback(
    (next: number, anchor?: { x: number; y: number }) => {
      const el = scrollRef.current;
      const {
        scale: oldScale,
        stride: oldStride,
        pageLeft: oldLeft,
        fitScale: fit,
      } = geometry.current;
      const zoomValue = clampZoom(next);
      if (zoomValue === geometry.current.zoom) return;
      if (!el || !pageSize) return setZoom(zoomValue);
      const ax = anchor?.x ?? el.clientWidth / 2;
      const ay = anchor?.y ?? el.clientHeight / 2;
      const newScale = fit * zoomValue;
      const ratio = newScale / oldScale;
      const cy = el.scrollTop + ay;
      const index = Math.floor(cy / oldStride);
      const newStride = pageSize.h * newScale + GAP;
      const newPageW = pageSize.w * newScale;
      const newLeft = (Math.max(el.clientWidth, newPageW + 2 * GAP) - newPageW) / 2;
      pendingScroll.current = {
        top: index * newStride + (cy - index * oldStride) * ratio - ay,
        left: newLeft + (el.scrollLeft + ax - oldLeft) * ratio - ax,
      };
      setZoom(zoomValue);
    },
    [pageSize],
  );
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pendingScroll.current) return;
    el.scrollTop = pendingScroll.current.top;
    el.scrollLeft = pendingScroll.current.left;
    pendingScroll.current = null;
  }, [scale]);

  // Ctrl + wheel zooms (a non-passive listener, so the webview does not zoom the whole app).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(geometry.current.zoom * Math.exp(-event.deltaY * 0.0015), {
        x: event.clientX - r.left,
        y: event.clientY - r.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, doc]);

  // Hand tool: drag the page. The pointer is captured only once it moves, so double clicks
  // still reach the page.
  const drag = useRef<{ x: number; y: number; top: number; left: number; moved: boolean } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefs.tool !== "hand" || event.button !== 0) return;
    const el = event.currentTarget;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      top: el.scrollTop,
      left: el.scrollLeft,
      moved: false,
    };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    event.currentTarget.scrollTop = d.top - dy;
    event.currentTarget.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const apply = useCallback(
    (next: Result): Result => {
      const { reading, correction, context, flipped } = next;
      if (correction) {
        store.getState().setFen(correction.fen);
        setDoubts(null);
        return { ...next, needsReview: false };
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
      return { ...next, turnSource, needsReview };
    },
    [store, setDoubts, setEditRequest],
  );

  const recognizeImage = async (page: PdfPage, objId: string, box: PdfBox) =>
    unwrap(
      await commands.recognizeBoardImage(
        await canvasToBase64(imageCanvas(page, objId) ?? (await regionCanvas(page, box))),
      ),
    );

  /** Every board of a page found by the page detector (scans, vector diagrams). */
  const detectBoards = async (page: PdfPage): Promise<Detection[]> => {
    const { canvas, viewport } = await pageCanvas(page);
    const readings = unwrap(await commands.detectBoardImages(await canvasToBase64(canvas)));
    return readings
      .filter((r) => r.grid)
      .map((reading) => ({ reading, box: pdfBox(viewport, reading.grid!) }));
  };

  const remember = useCallback((number: number, found: Detection[]) => {
    scannedRef.current.set(number, found);
    setScanned(new Map(scannedRef.current));
  }, []);

  /**
   * The diagrams of a page, read once and kept: embedded pictures are read one by one; scanned
   * pages go through the page detector; text pages cost nothing.
   */
  const scanPage = useCallback(
    (number: number): Promise<Detection[]> => {
      const cached = scannedRef.current.get(number);
      if (cached) return Promise.resolve(cached);
      const pending = pendingScans.current.get(number);
      if (pending) return pending;
      const work = (async () => {
        if (!doc) return [];
        const page = await doc.getPage(number);
        const { diagrams, scan } = await pageImages(page);
        let found: Detection[] = [];
        if (diagrams.length > 0) {
          for (const image of diagrams) {
            const reading = await recognizeImage(page, image.objId, image.box);
            if (reading.placement) found.push({ box: image.box, reading });
          }
        } else if (scan) {
          found = await detectBoards(page);
        }
        remember(number, found);
        return found;
      })().finally(() => pendingScans.current.delete(number));
      pendingScans.current.set(number, work);
      return work;
    },
    [doc, remember],
  );

  // Diagram mode: the visible pages are scanned in the background, one at a time.
  useEffect(() => {
    if (!prefs.diagrams || !doc || numPages === 0) return;
    let cancelled = false;
    const todo: number[] = [];
    for (let n = firstVisible; n <= lastVisible; n++) if (!scannedRef.current.has(n)) todo.push(n);
    setScanning(todo.length > 0);
    void (async () => {
      for (const n of todo) {
        if (cancelled) return;
        try {
          await scanPage(n);
        } catch {
          remember(n, []);
        }
      }
      if (!cancelled) setScanning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefs.diagrams, doc, numPages, firstVisible, lastVisible, scanPage, remember]);

  const marks = useMemo(() => {
    const out = new Map<number, Detection[]>();
    for (const [number, found] of scanned)
      out.set(
        number,
        found.map((d) => ({ ...d, corrected: !!notes && !!findCorrection(notes, number, d.box) })),
      );
    return out;
  }, [scanned, notes]);

  /** A reading adjusted with what was learned in this book (as it is when nothing was). */
  const adaptReading = useCallback(
    async (reading: BoardReading | null): Promise<BoardReading | null> => {
      if (!reading?.id || learnedRef.current === 0) return reading;
      const adapted = await commands.adaptBoardReading(reading.id, book.id);
      return adapted.status === "ok" && adapted.data ? adapted.data : reading;
    },
    [book.id],
  );

  const finish = useCallback(
    async (page: PdfPage, box: PdfBox, reading: BoardReading | null, started: number) => {
      const correction = notes ? findCorrection(notes, page.pageNumber, box) : null;
      if (!correction) reading = await adaptReading(reading);
      setLine(null);
      const context = moveContext(await textRuns(page), box);
      setResult(
        apply({
          page: page.pageNumber,
          box,
          context,
          turnSource: null,
          ms: Math.round(performance.now() - started),
          reading: correction ? null : reading,
          correction,
          flipped: false,
          needsReview: false,
        }),
      );
    },
    [notes, apply, adaptReading],
  );

  const run = useCallback(
    async (message: string, work: () => Promise<void>) => {
      if (busy) return;
      setBusy(message);
      setReadError(null);
      try {
        await work();
      } catch (e) {
        setReadError(String((e as Error)?.message ?? e));
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  const readAt = (page: PdfPage, x: number, y: number) =>
    run(t("Board.ImageReader.Reading"), async () => {
      const started = performance.now();
      const known = scannedRef.current.get(page.pageNumber)?.find((d) => contains(d.box, x, y));
      if (known) return finish(page, known.box, known.reading, started);
      const images = await diagramImages(page);
      const image = images.find((im) => contains(im.box, x, y));
      if (image) {
        // An embedded diagram: its own pixels, already decoded for the page.
        const saved = notes ? findCorrection(notes, page.pageNumber, image.box) : null;
        const reading = saved ? null : await recognizeImage(page, image.objId, image.box);
        return finish(page, image.box, reading, started);
      }
      // A scan or a vector diagram: every board of the page, then the one under the click.
      const found = await detectBoards(page);
      if (images.length === 0) remember(page.pageNumber, found);
      const hit = found.find((d) => contains(d.box, x, y));
      if (!hit) {
        setResult(null);
        setReadError(t("Board.ImageReader.NoBoard"));
        return;
      }
      await finish(page, hit.box, hit.reading, started);
    });

  const pageRuns = async (n: number): Promise<TextRun[]> => {
    const cached = runsCache.current.get(n);
    if (cached || !doc) return cached ?? [];
    const runs = await textRuns(await doc.getPage(n));
    runsCache.current.set(n, runs);
    return runs;
  };

  /**
   * Where a line of the text may start, most likely first: the diagrams above the move on its
   * page (nearest first), the board as it is, the diagrams of the page before, and the initial
   * position. The first one from which the line is legal wins.
   */
  const lineStarts = async (n: number, y: number): Promise<string[]> => {
    const out: string[] = [];
    const push = (fen: string | null) => fen && !out.includes(fen) && out.push(fen);
    const fenOf = async (p: number, d: Detection): Promise<string | null> => {
      const correction = notes ? findCorrection(notes, p, d.box) : null;
      if (correction) return correction.fen;
      const reading = await adaptReading(d.reading);
      if (!reading?.placement) return null;
      const context = moveContext(await pageRuns(p), d.box);
      if (!context.turn || !context.fullmove) return null;
      return legalTurn(diagramFen(reading.placement, context.turn, context.fullmove)).fen;
    };
    const bottomUp = (a: Detection, b: Detection) => a.box[1] - b.box[1];
    const here = (await scanPage(n)).filter((d) => d.box[1] >= y - 2).sort(bottomUp);
    for (const d of here) push(await fenOf(n, d));
    push(store.getState().root.fen);
    if (n > 1)
      for (const d of [...(await scanPage(n - 1))].sort(bottomUp)) push(await fenOf(n - 1, d));
    push(INITIAL_FEN);
    return out;
  };

  /**
   * A double click on the text: when it is on a move, the line of the book up to that move goes
   * to the board (the rest of the line after it too). A move that cannot be played is marked on
   * the page and the board stays on the one before; anything else does nothing.
   */
  const openMoveAt = async (page: PdfPage, x: number, y: number) => {
    if (!doc || busy) return;
    const started = performance.now();
    const n = page.pageNumber;
    const numbers = [n - 1, n, n + 1].filter((p) => p >= 1 && p <= doc.numPages);
    const w = textWindow(
      await Promise.all(numbers.map(async (p) => ({ page: p, runs: await pageRuns(p) }))),
    );
    const at = moveAt(w, n, x, y);
    if (at === null) return;
    window.getSelection()?.removeAllRanges();
    await run(t("Books.Line.Opening"), async () => {
      const opened = openLine(w.tokens, at, await lineStarts(n, y));
      if (!opened) {
        setReadError(t("Books.Line.NotFound"));
        return;
      }
      const s = store.getState();
      s.setFen(opened.fen);
      if (opened.moves.length > 0)
        s.makeMoves({ payload: opened.moves.map((m) => m.san), mainline: true });
      const upTo = opened.clicked >= 0 ? opened.clicked : opened.moves.length - 1;
      s.goToMove(Array(upTo + 1).fill(0));
      setResult(null);
      setDoubts(null);
      setEditRequest((previous) => ({ store, count: (previous?.count ?? 0) + 1, open: false }));
      setLine({ line: opened, window: w, page: n, ms: Math.round(performance.now() - started) });
    });
  };

  /** The marks of the line on the pages: the board's move, and the move that failed. */
  const lineMarks = useMemo(() => {
    const out = new Map<number, MoveMark[]>();
    if (!line) return out;
    const add = (token: number, failed: boolean) => {
      const at = tokenBox(line.window, token);
      if (at) out.set(at.page, [...(out.get(at.page) ?? []), { box: at.box, failed }]);
    };
    const sameRoot =
      rootFen.split(" ").slice(0, 4).join(" ") === line.line.fen.split(" ").slice(0, 4).join(" ");
    const index = sameRoot && position.every((p) => p === 0) ? position.length - 1 : -1;
    if (index >= 0 && index < line.line.moves.length) add(line.line.moves[index].token, false);
    if (line.line.failure) add(line.line.failure.token, true);
    return out;
  }, [line, rootFen, position]);

  const pick = (page: PdfPage, detection: Detection) =>
    run(t("Board.ImageReader.Reading"), () =>
      finish(page, detection.box, detection.reading, performance.now()),
    );

  /** Scrolls the reader so a diagram is in view, a little below the top. */
  const reveal = useCallback(
    (page: number, box: PdfBox) => {
      const el = scrollRef.current;
      if (!el || !pageSize) return;
      const { scale: s, pageLeft: left } = geometry.current;
      scrollToPage(page, Math.max(0, (pageSize.top - box[3]) * s - 48));
      const centre = left + ((box[0] + box[2]) / 2) * s;
      el.scrollLeft = Math.max(0, centre - el.clientWidth / 2);
    },
    [pageSize, scrollToPage],
  );

  /** The next (or previous) diagram in reading order, from the last one read or this page. */
  const step = (direction: 1 | -1) =>
    run(t("Books.Searching"), async () => {
      if (!doc) return;
      const from = result ?? null;
      const startAt = from?.page ?? currentPage;
      for (let k = 0; k < STEP_PAGES; k++) {
        const number = startAt + k * direction;
        if (number < 1 || number > doc.numPages) break;
        const found = await scanPage(number);
        let candidates = readingOrder(found);
        if (from && number === from.page) {
          const self = { box: from.box, self: true } as const;
          const ordered = readingOrder([
            ...candidates.filter((d) => !overlap(d.box, from.box)),
            self,
          ]);
          const at = ordered.indexOf(self);
          candidates = (
            direction > 0 ? ordered.slice(at + 1) : ordered.slice(0, at).reverse()
          ) as Detection[];
        } else if (direction < 0) {
          candidates = candidates.reverse();
        }
        const next = candidates[0];
        if (next) {
          const page = await doc.getPage(number);
          reveal(number, next.box);
          await finish(page, next.box, next.reading, performance.now());
          return;
        }
      }
      setReadError(t("Books.NoMoreDiagrams", { pages: STEP_PAGES }));
    });

  const flip = () => {
    if (!result?.reading) return;
    setResult(apply({ ...result, flipped: !result.flipped }));
  };

  /**
   * Learns from the position on the board for the diagram just read: the user checked it, so its
   * squares teach the reader how this book draws its pieces.
   */
  const learn = async (r: Result) => {
    const reading = r.reading;
    if (!reading?.id || !reading.placement) return;
    const placement = store.getState().root.fen.split(" ")[0];
    // The picture shows the board from Black's side when exactly one of the reader's guess and
    // the user's flip says so.
    const imageFlipped = reading.flipped !== r.flipped;
    const key = `${r.page}:${r.box.map((v) => Math.round(v)).join(",")}`;
    const res = await commands.learnBoardReading(reading.id, book.id, key, placement, imageFlipped);
    if (res.status === "ok" && res.data !== null) setLearned(res.data);
  };

  const forget = async () => {
    setForgetOpen(false);
    const res = await commands.forgetBookMemory(book.id);
    if (res.status === "ok") setLearned(0);
  };

  const usePosition = () => {
    if (result?.needsReview) void learn(result);
    setDoubts(null);
    setEditRequest((previous) => ({ store, count: (previous?.count ?? 0) + 1, open: false }));
    if (result) setResult({ ...result, needsReview: false });
  };

  /** Changes one field of the position's FEN (side to move, move number), keeping the rest. */
  const editFen = (field: 1 | 5, value: string) => {
    const parts = store.getState().root.fen.split(" ");
    if (parts.length < 6) return;
    parts[field] = value;
    if (field === 1) parts[3] = "-";
    store.getState().setFen(parts.join(" "));
    if (field === 1 && result) setResult({ ...result, turnSource: "manual" });
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
    await learn(result);
    setResult({
      ...result,
      correction: { page: result.page, box: result.box, fen, readPlacement, savedAt: "" },
    });
  };

  const closeBook = () =>
    setTabs((tabs) => tabs.map((tab) => (tab.value === tabId ? { ...tab, book: undefined } : tab)));

  const fenParts = rootFen.split(" ");
  const turn = fenParts[1] === "b" ? "b" : "w";
  const fullmove = Number(fenParts[5]) || 1;

  const barState: DiagramBarState | null = result
    ? {
        page: result.page,
        ms: result.ms,
        status: result.correction
          ? { color: "blue", text: t("Books.Result.Corrected") }
          : result.reading?.status === "accepted"
            ? { color: "green", text: t("Board.ImageReader.Accepted") }
            : result.reading?.status === "review"
              ? {
                  color: "orange",
                  text: t("Board.ImageReader.Review", { count: result.reading.doubtful.length }),
                }
              : { color: "red", text: t("Board.ImageReader.NoBoard") },
        learnedNote:
          !result.correction && result.reading && result.reading.adapted > 0
            ? t("Books.Bar.Learned", { count: result.reading.adapted })
            : null,
        turnNote: result.correction
          ? null
          : result.turnSource === "manual"
            ? t("Books.Bar.FromYou")
            : result.turnSource === "check"
              ? t("Books.Bar.FromCheck")
              : result.turnSource === "mark"
                ? t("Books.Bar.FromMark")
                : result.turnSource === "text"
                  ? t("Books.Bar.FromText", { text: (result.context.evidence ?? "").slice(0, 40) })
                  : t("Books.Bar.Unknown"),
        problems: !!result.reading && result.reading.problems.length > 0,
        canFlip: !!result.reading?.placement,
        canSave: !!result.reading?.placement || !!result.correction,
        needsReview: result.needsReview,
      }
    : null;

  const lineBar: DiagramBarState | null = line
    ? (() => {
        const { line: l, window: w } = line;
        const fromPly = plyOfFen(l.fen) ?? 0;
        const label = (i: number) => {
          const ply = fromPly + i;
          return `${Math.floor(ply / 2) + 1}${ply % 2 ? "…" : "."}${l.moves[i].san}`;
        };
        const failed = l.failure
          ? w.text.slice(w.tokens[l.failure.token].start, w.tokens[l.failure.token].end)
          : "";
        const notes = [
          l.clicked >= 0 && l.failure ? t("Books.Line.EndsAt", { move: failed }) : null,
          l.moves.some((m) => m.fuzzy) ? t("Books.Line.Fuzzy") : null,
        ].filter(Boolean);
        return {
          page: line.page,
          ms: line.ms,
          status:
            l.clicked >= 0
              ? {
                  color: "green",
                  text: t("Books.Line.Opened", { move: label(l.clicked), count: l.moves.length }),
                }
              : { color: "orange", text: t("Books.Line.Stopped", { move: failed }) },
          learnedNote: null,
          turnNote: notes.length > 0 ? notes.join(" · ") : null,
          problems: false,
          canFlip: false,
          canSave: false,
          needsReview: false,
          compact: true,
        };
      })()
    : null;

  /** The page and box of the move the board is on (or the clicked one), to scroll to it. */
  const lineAnchor = () => {
    if (!line) return null;
    for (const [page, marks] of lineMarks) {
      const mark = marks.find((m) => !m.failed) ?? marks[0];
      if (mark) return { page, box: mark.box };
    }
    return null;
  };

  const zoomPercent = Math.round((scale / ACTUAL_SIZE) * 100);
  const fitPageZoom =
    pageSize && viewH > 0 ? Math.min(1, (viewH - 2 * GAP) / (pageSize.h * fitScale)) : 1;

  return (
    <Box h="100%" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Group gap={6} wrap="nowrap" px={4} py={4}>
        <Tooltip label={t("Books.Back")}>
          <ActionIcon variant="subtle" color="gray" onClick={() => void navigate({ to: "/books" })}>
            <IconArrowLeft size="1.1rem" />
          </ActionIcon>
        </Tooltip>
        <Text size="sm" fw={600} truncate style={{ flex: 1, minWidth: 0 }} title={book.path}>
          {book.title}
        </Text>
        <Tooltip label={t("Books.DiagramsHelp")} multiline w={280}>
          <Button
            size="compact-sm"
            variant={prefs.diagrams ? "light" : "subtle"}
            color={prefs.diagrams ? undefined : "gray"}
            leftSection={
              prefs.diagrams && scanning ? <Loader size={12} /> : <IconChess size="1rem" />
            }
            onClick={() => setPrefs({ ...prefs, diagrams: !prefs.diagrams })}
          >
            {t("Books.Diagrams")}
          </Button>
        </Tooltip>
        <Group gap={0} wrap="nowrap">
          <Tooltip label={t("Books.PrevDiagram")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!doc || !!busy}
              onClick={() => void step(-1)}
            >
              <IconChevronUp size="1.1rem" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Books.NextDiagram")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!doc || !!busy}
              onClick={() => void step(1)}
            >
              <IconChevronDown size="1.1rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Divider orientation="vertical" />
        <SegmentedControl
          size="xs"
          value={prefs.tool}
          onChange={(value) => setPrefs({ ...prefs, tool: value as Tool })}
          data={[
            {
              value: "select",
              label: (
                <Tooltip label={t("Books.ToolSelect")}>
                  <Center>
                    <IconPointer size="0.95rem" />
                  </Center>
                </Tooltip>
              ),
            },
            {
              value: "hand",
              label: (
                <Tooltip label={t("Books.ToolHand")}>
                  <Center>
                    <IconHandStop size="0.95rem" />
                  </Center>
                </Tooltip>
              ),
            },
          ]}
        />
        <Divider orientation="vertical" />
        {doc && (
          <Group gap={4} wrap="nowrap">
            <NumberInput
              size="xs"
              w={56}
              min={1}
              max={doc.numPages}
              value={currentPage}
              hideControls
              aria-label={t("Books.Page")}
              onChange={(value) => {
                const n = Number(value);
                if (Number.isInteger(n) && n >= 1 && n <= doc.numPages) scrollToPage(n);
              }}
            />
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              / {doc.numPages}
            </Text>
          </Group>
        )}
        <Group gap={0} wrap="nowrap">
          <Tooltip label={t("Books.ZoomOut")}>
            <ActionIcon variant="subtle" color="gray" onClick={() => zoomTo(zoom / 1.2)}>
              <IconZoomOut size="1rem" />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Tooltip label={t("Books.ZoomHelp")}>
                <Button size="compact-xs" variant="subtle" color="gray" w={52} px={0}>
                  {zoomPercent}%
                </Button>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => zoomTo(1)}>{t("Books.FitWidth")}</Menu.Item>
              <Menu.Item onClick={() => zoomTo(fitPageZoom)}>{t("Books.FitPage")}</Menu.Item>
              <Menu.Item onClick={() => zoomTo(ACTUAL_SIZE / fitScale)}>100%</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Tooltip label={t("Books.ZoomIn")}>
            <ActionIcon variant="subtle" color="gray" onClick={() => zoomTo(zoom * 1.2)}>
              <IconZoomIn size="1rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={t("Books.More")}>
              <IconDots size="1rem" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconBookOff size="1rem" />} onClick={closeBook}>
              {t("Books.Close")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconBrain size="1rem" />}
              disabled={learned === 0}
              onClick={() => setForgetOpen(true)}
            >
              {t("Books.Forget", { count: learned })}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <ConfirmModal
          title={t("Books.Forget.Title")}
          description={t("Books.Forget.Message", { count: learned })}
          opened={forgetOpen}
          onClose={() => setForgetOpen(false)}
          onConfirm={() => void forget()}
          confirmLabel={t("Books.Forget.Confirm")}
        />
      </Group>

      <Box ref={viewRef} pos="relative" style={{ flex: 1, minHeight: 0 }}>
        {error ? (
          <Alert color="red" m="xs">
            {t("Books.OpenError", { error })}
          </Alert>
        ) : !doc ? (
          <Center h="100%">
            <Loader size="sm" />
          </Center>
        ) : (
          <div
            ref={scrollRef}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: "absolute",
              inset: 0,
              overflow: "auto",
              scrollbarGutter: "stable",
              background: "var(--mantine-color-default-hover)",
              cursor: prefs.tool === "hand" ? (dragging ? "grabbing" : "grab") : undefined,
              userSelect: prefs.tool === "hand" ? "none" : undefined,
            }}
          >
            <div style={{ position: "relative", width: contentW, height: numPages * stride + GAP }}>
              {Array.from(
                { length: Math.max(0, Math.min(numPages, lastVisible + 1) - firstVisible + 2) },
                (_, i) => firstVisible - 1 + i,
              )
                .filter((n) => n >= 1 && n <= numPages)
                .map((n) => (
                  <div
                    key={n}
                    style={{
                      position: "absolute",
                      top: (n - 1) * stride + GAP,
                      left: pageLeft,
                      width: pageW,
                      height: pageH,
                    }}
                  >
                    <PageView
                      doc={doc}
                      number={n}
                      scale={scale}
                      selectable={prefs.tool === "select"}
                      highlight={result && result.page === n ? result.box : null}
                      detections={prefs.diagrams ? marks.get(n) : undefined}
                      moveMarks={lineMarks.get(n)}
                      onDoubleClick={(page, x, y, onText) =>
                        void (onText ? openMoveAt(page, x, y) : readAt(page, x, y))
                      }
                      onPick={(page, detection) => void pick(page, detection)}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </Box>

      <Portal target={`#${BOOK_DIAGRAM_BAR_ID}`}>
        {busy || readError || lineBar || barState ? (
          <DiagramBar
            busy={busy}
            error={readError}
            state={lineBar ?? barState}
            turn={turn}
            fullmove={fullmove}
            onTurn={(value) => editFen(1, value)}
            onFullmove={(value) => editFen(5, String(value))}
            onUse={usePosition}
            onFlip={flip}
            onSave={() => void save()}
            onGoTo={() => {
              const at = lineAnchor();
              if (at) reveal(at.page, at.box);
              else if (result) reveal(result.page, result.box);
            }}
            onDismiss={() => {
              setReadError(null);
              setResult(null);
              setLine(null);
            }}
          />
        ) : (
          <Text size="xs" c="dimmed" px={4} pb={4}>
            {t("Books.Hint")}
          </Text>
        )}
      </Portal>
    </Box>
  );
}

export default BookReader;
