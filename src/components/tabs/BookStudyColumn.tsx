import { ActionIcon, Button, Text, Tooltip } from "@mantine/core";
import {
  IconArrowUp,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { atomWithStorage } from "jotai/utils";
import { useAtom } from "jotai";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "../common/TreeStateContext";
import { panelHeaderId, panelZoneId } from "./RightColumn";
import columnClasses from "./RightColumn.module.css";
import classes from "./BookStudyColumn.module.css";

/** Portal target of the diagram bar, filled by the book reader (phase 9.4). */
export const BOOK_DIAGRAM_BAR_ID = "book-diagram-bar";
/** Portal target of the board's tools, beside the board. */
export const BOOK_RAIL_ID = "book-rail";

const GAP = 8;
const MIN_BOARD = 240;
/** Width the notation needs to sit beside the board instead of under it. */
const SIDE_NOTATION = 300;
/** What stays visible under the board (a header) so it is clear the column goes on. */
const HINT = 34;
const DEFAULT_NOTATION_HEIGHT = 340;
const MIN_NOTATION_HEIGHT = 140;

type Prefs = { notation: boolean; notationHeight: number };

const prefsAtom = atomWithStorage<Prefs>("bookStudyColumn-v1", {
  notation: true,
  notationHeight: DEFAULT_NOTATION_HEIGHT,
});

type Layout = { width: number | null; wide: boolean; boardHeight: number; viewHeight: number };

/**
 * Beside a book the board, its notation and the tools share one column that scrolls like a page.
 * On top, the bar of the last diagram read and the largest board that fits the visible height,
 * with its tools in a rail at its side and the move buttons and engine lines under it. The
 * notation goes beside the board when there is room for it and under it otherwise; it can be
 * hidden. Further down, the tool tabs (analysis, database, info) at the column's full height.
 */
export default function BookStudyColumn() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useAtom(prefsAtom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>({
    width: null,
    wide: false,
    boardHeight: 0,
    viewHeight: 0,
  });
  const [boardOut, setBoardOut] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // The board is sized here, not by itself: as wide as the column allows and no taller than
  // what is visible. Bars, move buttons, engine lines and the eval bar are measured, not assumed.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const bar = barRef.current;
    const board = boardRef.current;
    const rail = railRef.current;
    if (!scroll || !bar || !board || !rail) return;
    const fit = () => {
      const roomW = scroll.clientWidth - rail.offsetWidth - GAP;
      const roomH = scroll.clientHeight - bar.offsetHeight - GAP - HINT;
      const wrap = board.querySelector<HTMLElement>(".cg-wrap");
      const chrome = wrap ? board.offsetHeight - wrap.offsetHeight : 0;
      const side = wrap ? board.offsetWidth - wrap.offsetWidth : 0;
      const byHeight = roomH - chrome + side;
      const width = Math.max(MIN_BOARD, Math.floor(Math.min(byHeight, roomW)));
      const wide = roomW - width - GAP >= SIDE_NOTATION;
      const next = {
        width,
        wide,
        boardHeight: board.offsetHeight,
        viewHeight: scroll.clientHeight,
      };
      setLayout((previous) =>
        previous.width === next.width &&
        previous.wide === next.wide &&
        previous.boardHeight === next.boardHeight &&
        previous.viewHeight === next.viewHeight
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(fit);
    for (const element of [scroll, bar, board, rail]) observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, []);

  // Once the board has mostly scrolled away, a thin bar keeps the move buttons at hand.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const stage = stageRef.current;
    if (!scroll || !stage) return;
    const check = () => {
      const visible = stage.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top;
      setBoardOut(visible < stage.offsetHeight * 0.35);
    };
    scroll.addEventListener("scroll", check, { passive: true });
    check();
    return () => scroll.removeEventListener("scroll", check);
  }, []);

  const maxNotation = Math.max(MIN_NOTATION_HEIGHT, layout.viewHeight - 60);
  const clampNotation = (height: number) =>
    Number.isFinite(height)
      ? Math.round(Math.min(maxNotation, Math.max(MIN_NOTATION_HEIGHT, height)))
      : DEFAULT_NOTATION_HEIGHT;
  const notationHeight = clampNotation(dragHeight ?? prefs.notationHeight);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = notationHeight;
    let latest = startHeight;
    const move = (moveEvent: PointerEvent) => {
      latest = clampNotation(startHeight + moveEvent.clientY - startY);
      setDragHeight(latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragHeight(null);
      setPrefs((current) => ({ ...current, notationHeight: latest }));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  const notationOpen = prefs.notation;
  const toolsHeight = Math.max(240, layout.viewHeight - HINT - GAP);

  return (
    <div ref={scrollRef} className={classes.scroll}>
      <div className={classes.miniBarAnchor}>
        {boardOut && (
          <MiniBar onBack={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
        )}
      </div>
      <div ref={barRef} id={BOOK_DIAGRAM_BAR_ID} />
      <div ref={stageRef} className={classes.stage} data-wide={layout.wide || undefined}>
        <div ref={boardRef} className={classes.board} style={{ width: layout.width ?? "100%" }}>
          <div id="left" />
        </div>
        <div ref={railRef} id={BOOK_RAIL_ID} className={classes.rail} />
        <div
          className={`${columnClasses.zone} ${classes.notes} ${notationOpen ? "" : columnClasses.collapsed}`}
          style={layout.wide && notationOpen ? { height: layout.boardHeight } : undefined}
        >
          <div className={columnClasses.header}>
            <Tooltip
              label={notationOpen ? t("Panels.Collapse", "Collapse") : t("Panels.Expand", "Expand")}
            >
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-expanded={notationOpen}
                onClick={() => setPrefs((current) => ({ ...current, notation: !current.notation }))}
              >
                <IconChevronDown size={16} className={columnClasses.chevron} />
              </ActionIcon>
            </Tooltip>
            <div
              id={panelHeaderId("notation")}
              className={columnClasses.headerSlot}
              onClickCapture={() =>
                !notationOpen && setPrefs((current) => ({ ...current, notation: true }))
              }
            />
          </div>
          <div
            id={panelZoneId("notation")}
            className={columnClasses.body}
            style={layout.wide ? undefined : { height: notationHeight, flex: "none" }}
          />
          {notationOpen && !layout.wide && (
            <div
              className={columnClasses.handle}
              data-dragging={dragHeight !== null || undefined}
              onPointerDown={startResize}
              onDoubleClick={() =>
                setPrefs((current) => ({ ...current, notationHeight: DEFAULT_NOTATION_HEIGHT }))
              }
              role="separator"
              aria-orientation="horizontal"
            />
          )}
        </div>
      </div>
      <div className={columnClasses.zone}>
        <div className={columnClasses.header}>
          <div id={panelHeaderId("tools")} className={columnClasses.headerSlot} />
        </div>
        <div
          id={panelZoneId("tools")}
          className={columnClasses.body}
          style={{ height: toolsHeight, flex: "none" }}
        />
      </div>
    </div>
  );
}

/** Move buttons and the current move, shown while the board is scrolled out of view. */
function MiniBar({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const next = useStore(store, (s) => s.goToNext);
  const previous = useStore(store, (s) => s.goToPrevious);
  const node = useStore(store, (s) => s.currentNode());
  const label = node.san
    ? `${Math.ceil(node.halfMoves / 2)}${node.halfMoves % 2 === 1 ? "." : "…"}${node.san}`
    : "—";

  return (
    <div className={classes.miniBar}>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={previous}
        aria-label={t("Board.Controls.Previous", "Previous move")}
      >
        <IconChevronLeft size={18} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={next}
        aria-label={t("Board.Controls.Next", "Next move")}
      >
        <IconChevronRight size={18} />
      </ActionIcon>
      <Text fz="sm" fw={600} style={{ flex: 1, minWidth: 0 }} truncate>
        {label}
      </Text>
      <Button
        size="compact-sm"
        variant="subtle"
        rightSection={<IconArrowUp size={14} />}
        onClick={onBack}
      >
        {t("Books.Study.BackToBoard", "Board")}
      </Button>
    </div>
  );
}
