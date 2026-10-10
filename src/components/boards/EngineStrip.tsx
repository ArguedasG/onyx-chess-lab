import {
  ActionIcon,
  Badge,
  Menu,
  Popover,
  Progress,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconCpu,
  IconEyeOff,
  IconPlus,
  IconSettings,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { parseUci } from "chessops";
import { INITIAL_FEN, makeFen } from "chessops/fen";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { BestMoves } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { arrowColors } from "@/components/panels/analysis/arrowColors";
import EngineSettingsForm, { type Settings } from "@/components/panels/analysis/EngineSettingsForm";
import MaiaWdl from "@/components/panels/analysis/MaiaWdl";
import TablebaseInfo from "@/components/panels/analysis/TablebaseInfo";
import {
  activeTabAtom,
  currentThreatAtom,
  engineMovesFamily,
  engineProgressFamily,
  enginesAtom,
  moveNotationTypeAtom,
  showEngineStripAtom,
  tabEngineSettingsFamily,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybinds";
import { addPieceSymbol } from "@/utils/annotation";
import { getVariationLine } from "@/utils/chess";
import {
  chessopsError,
  getPiecesCount,
  hasCaptures,
  isOp1,
  positionFromFen,
  swapMove,
} from "@/utils/chessops";
import { type Engine, stopEngine } from "@/utils/engines";
import { formatNodes } from "@/utils/format";
import { isMaiaEngine } from "@/utils/humanBots";
import { formatScore } from "@/utils/score";
import classes from "./EngineStrip.module.css";

const engineStripCollapsedAtom = atomWithStorage("engine-strip-collapsed", false);

/** Lines shown per engine before "+N"; more lines would take the board's room. */
const VISIBLE_LINES = 2;

function engineColor(index: number) {
  return arrowColors[index]?.strong ?? "gray";
}

/**
 * Engines under the board. They keep running whatever the right panel shows, so their lines
 * stay visible too. Running engines get a row with their lines; switched-off ones wait as
 * small pills in a single row, so a long engine list does not shrink the board.
 */
function EngineStrip({ wide = false }: { wide?: boolean }) {
  const { t } = useTranslation();
  const activeTab = useAtomValue(activeTabAtom)!;
  const engines = useAtomValue(enginesAtom);
  const loaded = useMemo(() => (engines ?? []).filter((engine) => engine.loaded), [engines]);
  const [storedCollapsed, setCollapsed] = useAtom(engineStripCollapsedAtom);
  const [showStrip, setShowStrip] = useAtom(showEngineStripAtom);
  // The wide version fills the Engines tab, where there is room for everything.
  const collapsed = !wide && storedCollapsed;

  const enabledAtom = useMemo(
    () =>
      atom((get) =>
        loaded.map(
          (engine) =>
            get(
              tabEngineSettingsFamily({
                engineId: engine.id,
                defaultSettings: engine.settings ?? undefined,
                defaultGo: engine.go ?? undefined,
                tab: activeTab,
              }),
            ).enabled,
        ),
      ),
    [loaded, activeTab],
  );
  const enabled = useAtomValue(enabledAtom);
  // With nothing running, the first engine still gets a row so its switch is at hand.
  const shown = loaded.filter(
    (_, index) => enabled[index] || (index === 0 && !enabled.some(Boolean)),
  );
  const waiting = loaded.filter((engine) => !shown.includes(engine));

  const store = useContext(TreeStateContext)!;
  const rootFen = useStore(store, (s) => s.root.fen);
  const currentFen = useStore(store, (s) => s.currentNode().fen);
  const halfMoves = useStore(store, (s) => s.currentNode().halfMoves);
  const moves = useStore(
    store,
    useShallow((s) => getVariationLine(s.root, s.position)),
  );

  const [pos] = positionFromFen(currentFen);
  const showTablebase =
    !!pos &&
    (getPiecesCount(pos) <= 7 || (getPiecesCount(pos) === 8 && (hasCaptures(pos) || isOp1(pos))));

  const chevron = wide ? null : (
    <Tooltip label={collapsed ? t("Panels.Expand", "Expand") : t("Panels.Collapse", "Collapse")}>
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <IconChevronDown size={16} className={classes.chevron} />
      </ActionIcon>
    </Tooltip>
  );

  const hideStrip = wide ? null : (
    <Tooltip label={t("EngineStrip.Hide", "Hide under the board")}>
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        onClick={() => {
          setShowStrip(false);
          notifications.show({
            message: t(
              "EngineStrip.Hidden",
              "Engines are still in Analysis → Engines. Turn the strip back on there or in Settings → Board.",
            ),
          });
        }}
      >
        <IconEyeOff size={15} />
      </ActionIcon>
    </Tooltip>
  );

  return (
    <div
      className={`${classes.strip} ${collapsed ? classes.collapsed : ""} ${wide ? classes.wide : ""}`}
    >
      {loaded.length === 0 ? (
        <div className={classes.header}>
          {chevron}
          <Text size="xs" c="dimmed">
            {t("EngineStrip.NoEngine", "No engine active")}
          </Text>
          <EngineMenu>
            <UnstyledButton className={classes.engineButton}>
              <IconPlus size={14} />
              {t("EngineStrip.ChooseEngine", "Choose engine")}
            </UnstyledButton>
          </EngineMenu>
          <div className={classes.spacer} />
          {hideStrip}
        </div>
      ) : (
        shown.map((engine, row) => (
          <EngineSection
            key={engine.id}
            engine={engine}
            color={engineColor(loaded.indexOf(engine))}
            collapsed={collapsed}
            wide={wide}
            first={row === 0}
            leading={row === 0 ? chevron : null}
            trailing={row === 0 ? hideStrip : null}
            rootFen={rootFen}
            moves={moves}
            halfMoves={halfMoves}
          />
        ))
      )}
      {!collapsed && waiting.length > 0 && (
        <div className={`${classes.header} ${classes.waiting}`}>
          <Text size="xs" c="dimmed">
            {t("EngineStrip.Off", "Off:")}
          </Text>
          {waiting.map((engine) => (
            <WaitingEngine
              key={engine.id}
              engine={engine}
              color={engineColor(loaded.indexOf(engine))}
            />
          ))}
        </div>
      )}
      {!collapsed && showTablebase && pos && <TablebaseInfo fen={currentFen} turn={pos.turn} />}
      {wide && (
        <Switch
          mt="sm"
          ml={6}
          size="xs"
          label={t("EngineStrip.ShowUnderBoard", "Also show under the board in other tabs")}
          checked={showStrip}
          onChange={(event) => setShowStrip(event.currentTarget.checked)}
        />
      )}
    </div>
  );
}

/** A switched-off engine: one click starts it and gives it a full row. */
function WaitingEngine({ engine, color }: { engine: Engine; color: string }) {
  const { t } = useTranslation();
  const activeTab = useAtomValue(activeTabAtom)!;
  const [, setSettings] = useAtom(
    tabEngineSettingsFamily({
      engineId: engine.id,
      defaultSettings: engine.settings ?? undefined,
      defaultGo: engine.go ?? undefined,
      tab: activeTab,
    }),
  );
  return (
    <Tooltip label={t("EngineStrip.Start", "Start analysis")}>
      <UnstyledButton
        className={classes.pill}
        onClick={() => setSettings((prev) => ({ ...prev, enabled: true }))}
      >
        <span className={classes.dot} style={{ background: `var(--mantine-color-${color}-6)` }} />
        {engine.name}
      </UnstyledButton>
    </Tooltip>
  );
}

const EngineSection = memo(function EngineSection({
  engine,
  color,
  collapsed,
  wide,
  first,
  leading,
  trailing,
  rootFen,
  moves,
  halfMoves,
}: {
  engine: Engine;
  color: string;
  collapsed: boolean;
  wide: boolean;
  /** The first row also carries the strip-wide controls (add engine, threat). */
  first: boolean;
  leading: ReactNode;
  trailing: ReactNode;
  rootFen: string;
  moves: string[];
  halfMoves: number;
}) {
  const { t } = useTranslation();
  const activeTab = useAtomValue(activeTabAtom)!;
  const ev = useAtomValue(engineMovesFamily({ engine: engine.id, tab: activeTab }));
  const progress = useAtomValue(engineProgressFamily({ engine: engine.id, tab: activeTab }));
  const [, setEngines] = useAtom(enginesAtom);
  const [settings, setTabSettings] = useAtom(
    tabEngineSettingsFamily({
      engineId: engine.id,
      defaultSettings: engine.settings ?? undefined,
      defaultGo: engine.go ?? undefined,
      tab: activeTab,
    }),
  );
  const [threat, setThreat] = useAtom(currentThreatAtom);
  const keyMap = useAtomValue(keyMapAtom);
  const maia = engine.type === "local" && isMaiaEngine(engine);
  const [showAll, setShowAll] = useState(false);

  // Synced settings follow the engine's global defaults (same rule as the engines page).
  useEffect(() => {
    if (settings.synced) {
      setTabSettings((prev) => ({
        ...prev,
        go: engine.go || prev.go,
        settings: engine.settings || prev.settings,
      }));
    }
  }, [engine.settings, engine.go, settings.synced, setTabSettings]);

  const setSettings = useCallback(
    (change: (prev: Settings) => Settings) => {
      const next = change(settings);
      setTabSettings(next);
      if (next.synced) {
        setEngines(async (prev) =>
          (await prev).map((other) =>
            other.id === engine.id ? { ...other, settings: next.settings, go: next.go } : other,
          ),
        );
      }
    },
    [engine.id, settings, setTabSettings, setEngines],
  );

  const [pos, error] = positionFromFen(rootFen);
  if (pos) {
    for (const uci of moves) {
      const move = parseUci(uci);
      if (!move) break;
      pos.play(move);
    }
  }
  const isGameOver = pos?.isEnd() ?? false;
  const finalFen = useMemo(() => (pos ? makeFen(pos.toSetup()) : null), [pos]);

  const searchKey = threat
    ? `${swapMove(finalFen || INITIAL_FEN)}:`
    : `${rootFen}:${moves.join(",")}`;
  const variations = useDeferredValue(useMemo(() => ev.get(searchKey), [ev, searchKey]));
  const best = variations && variations.length > 0 && !isGameOver ? variations[0] : null;

  const option = (name: string) =>
    settings.settings.find((setting) => setting.name === name)?.value;
  const lines = Number(option("MultiPV") ?? 1);
  const threads = option("Threads");
  const hash = option("Hash");

  const message = error
    ? `${t("EngineStrip.InvalidPosition", "Invalid position")}: ${chessopsError(error)}`
    : isGameOver
      ? t("EngineStrip.GameOver", "Game over")
      : !settings.enabled
        ? null
        : variations && variations.length === 0
          ? t("EngineStrip.NoAnalysis", "No analysis available")
          : !variations
            ? t("Common.Loading")
            : null;

  const visible = showAll || wide ? (variations ?? []) : (variations ?? []).slice(0, VISIBLE_LINES);
  const hidden = (variations?.length ?? 0) - visible.length;

  return (
    <div className={classes.section}>
      <div className={classes.header}>
        {leading}
        <EngineMenu>
          <UnstyledButton className={classes.engineButton}>
            <span
              className={classes.dot}
              style={{ background: `var(--mantine-color-${color}-6)` }}
            />
            {engine.name}
            <IconChevronDown size={12} />
          </UnstyledButton>
        </EngineMenu>

        {collapsed ? (
          <div className={classes.inlineLine}>
            {best && <LineScore line={best} maia={maia} />}
            <span>{best ? best.sanMoves.slice(0, 12).join(" ") : (message ?? "")}</span>
          </div>
        ) : (
          <>
            <Popover width={320} position="top-start" shadow="md" withinPortal>
              <Popover.Target>
                <Tooltip label={t("EngineStrip.Settings", "Engine settings")}>
                  <UnstyledButton className={classes.chips}>
                    <Badge size="xs" variant="light" color="gray" tt="none">
                      {t("EngineStrip.Lines", "{{count}} lines", { count: lines })}
                    </Badge>
                    {engine.type === "local" && threads !== undefined && (
                      <Badge size="xs" variant="light" color="gray" tt="none">
                        {t("EngineStrip.Cores", "{{count}} cores", { count: Number(threads) })}
                      </Badge>
                    )}
                    {engine.type === "local" && hash !== undefined && (
                      <Badge size="xs" variant="light" color="gray" tt="none">
                        {t("EngineStrip.Hash", "{{count}} MB", { count: Number(hash) })}
                      </Badge>
                    )}
                  </UnstyledButton>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown>
                <EngineSettingsForm
                  engine={engine}
                  settings={settings}
                  setSettings={setSettings}
                  color={color}
                  remote={engine.type !== "local"}
                />
              </Popover.Dropdown>
            </Popover>
            {first && (
              <EngineMenu>
                <Tooltip label={t("EngineStrip.AddEngine", "Add another engine")}>
                  <ActionIcon size="sm" variant="subtle" color="gray">
                    <IconPlus size={15} />
                  </ActionIcon>
                </Tooltip>
              </EngineMenu>
            )}
            <div className={classes.spacer} />
          </>
        )}

        {best && settings.enabled && (
          <span className={classes.stats}>
            {t("EngineStrip.Depth", "Depth {{depth}}", { depth: best.depth })}
            {progress < 100 && ` · ${formatNodes(best.nps, 1)}n/s`}
          </span>
        )}
        {first && (
          <Tooltip
            label={`${t("Board.Analysis.ShowThreat", "Check the opponent's threat")} (${keyMap.TOGGLE_THREAT.keys.toUpperCase()})`}
          >
            <ActionIcon
              size="sm"
              variant={threat ? "light" : "subtle"}
              color={threat ? "red" : "gray"}
              onClick={() => setThreat(!threat)}
            >
              <IconTargetArrow size={15} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip
          label={
            settings.enabled
              ? t("EngineStrip.Stop", "Stop analysis")
              : t("EngineStrip.Start", "Start analysis")
          }
        >
          <Switch
            size="xs"
            color={color}
            checked={settings.enabled}
            onChange={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
          />
        </Tooltip>
        {trailing}
      </div>

      {settings.enabled && progress < 100 && !isGameOver && (
        <Progress value={progress} size={2} radius={0} color={color} animated />
      )}

      {!collapsed &&
        (message ? (
          <div className={classes.message}>{message}</div>
        ) : (
          best &&
          finalFen && (
            <div className={classes.lines}>
              {visible.map((line, row) => (
                <EngineLine
                  key={row}
                  line={line}
                  maia={maia}
                  halfMoves={halfMoves}
                  threat={threat}
                  primary={row === 0}
                />
              ))}
              {!wide && (hidden > 0 || showAll) && (variations?.length ?? 0) > VISIBLE_LINES && (
                <UnstyledButton className={classes.more} onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? t("EngineStrip.FewerLines", "Show fewer lines")
                    : t("EngineStrip.MoreLines", "+{{count}} more", { count: hidden })}
                </UnstyledButton>
              )}
            </div>
          )
        ))}
    </div>
  );
});

function LineScore({ line, maia }: { line: BestMoves; maia: boolean }) {
  if (maia) return <MaiaWdl wdl={line.score.wdl} compact />;
  return <span className={classes.score}>{formatScore(line.score.value, 2)}</span>;
}

/** One engine line on a single row; clicking a move plays the line up to it. */
function EngineLine({
  line,
  maia,
  halfMoves,
  threat,
  primary,
}: {
  line: BestMoves;
  maia: boolean;
  halfMoves: number;
  threat: boolean;
  primary: boolean;
}) {
  const store = useContext(TreeStateContext)!;
  const makeMoves = useStore(store, (s) => s.makeMoves);
  const notation = useAtomValue(moveNotationTypeAtom);

  return (
    <div className={`${classes.line} ${primary ? classes.primary : ""}`}>
      <LineScore line={line} maia={maia} />
      <div className={classes.moves} title={line.sanMoves.join(" ")}>
        {line.sanMoves.map((san, index) => {
          const ply = halfMoves + index + 1 + (threat ? 1 : 0);
          const white = ply % 2 === 1;
          const number = Math.ceil(ply / 2);
          return (
            <span key={index}>
              {(index === 0 || white) && (
                <span className={classes.number}>{`${number}${white ? "." : "..."}`}</span>
              )}
              <button
                type="button"
                className={classes.move}
                disabled={threat}
                onClick={() => makeMoves({ payload: line.sanMoves.slice(0, index + 1) })}
              >
                {notation === "symbols" ? addPieceSymbol(san) : san}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Lists every installed engine to switch on or off, plus a way to manage them. */
function EngineMenu({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeTab = useAtomValue(activeTabAtom);
  const [engines, setEngines] = useAtom(enginesAtom);

  return (
    <Menu position="top-start" withinPortal shadow="md" closeOnItemClick={false}>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        {(engines ?? []).map((engine) => (
          <Menu.Item
            key={engine.id}
            leftSection={engine.type === "local" ? <IconCpu size={16} /> : <IconCloud size={16} />}
            rightSection={engine.loaded ? <IconCheck size={14} /> : null}
            onClick={() => {
              if (engine.loaded && engine.type === "local" && activeTab) {
                void stopEngine(engine, activeTab);
              }
              setEngines(async (prev) =>
                (await prev).map((other) =>
                  other.id === engine.id ? { ...other, loaded: !other.loaded } : other,
                ),
              );
            }}
          >
            {engine.name}
          </Menu.Item>
        ))}
        {(engines ?? []).length > 0 && <Menu.Divider />}
        <Menu.Item
          leftSection={<IconSettings size={16} />}
          onClick={() => navigate({ to: "/engines" })}
        >
          {t("EngineStrip.ManageEngines", "Add or remove engines…")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default memo(EngineStrip);
