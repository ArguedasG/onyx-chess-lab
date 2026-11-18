import {
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Select,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type PositionPlans, type PositionSummary } from "@/bindings";
import { plansPreferencesAtom, plansShapesFamily, plansSideFamily } from "@/state/atoms";
import { formatNumber } from "@/utils/format";
import { planMoveDelta, planShapes, planViewName, typicalPlan, visiblePlanMoves } from "./plans";
import classes from "./PlansPanel.module.css";

const WINDOWS = [3, 4, 6, 8];
const SHARES = [0.1, 0.2, 0.3, 0.5];
const EXPIRED = "Position query expired";
const STOPPED = "Search stopped";

type Request = { key: string; data?: PositionPlans; error?: string };

/** Typical plans of one side after the position: what it plays within its next moves. */
function PlansPanel({
  snapshot,
  owner,
  fen,
  onExpired,
}: {
  snapshot: PositionSummary;
  owner: string;
  fen: string;
  onExpired: () => void;
}) {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useAtom(plansPreferencesAtom);
  const [chosenSide, setSide] = useAtom(plansSideFamily(owner));
  const setShapes = useSetAtom(plansShapesFamily(owner));
  const side = chosenSide ?? (fen.split(" ")[1] === "b" ? "black" : "white");
  const white = side === "white";
  const key = `${snapshot.token}:${side}:${preferences.window}`;
  const [request, setRequest] = useState<Request | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    let retried = false;
    setRequest({ key });
    setHovered(null);
    setExpanded(null);
    const run = async () => {
      // Its own owner: a newer request for the tab supersedes this one in the backend.
      const response = await commands.positionPlans(
        snapshot.token,
        { white, window: preferences.window },
        `plans:${owner}`,
      );
      if (!live) return;
      if (response.status === "ok") {
        setRequest({ key, data: response.data });
      } else if (response.error === EXPIRED) {
        onExpired();
      } else if (response.error === STOPPED && !retried) {
        // Leaving and reopening the view quickly can stop the new request: ask once more.
        retried = true;
        await run();
      } else {
        setRequest({ key, error: response.error });
      }
    };
    run().catch((error) => {
      if (live) setRequest({ key, error: String(error) });
    });
    return () => {
      live = false;
    };
    // `key` covers the token, the side and the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Stops a count nobody will read when the view closes.
  useEffect(
    () => () => {
      void commands.cancelPositionSearch(`plans:${owner}`);
    },
    [owner],
  );

  const plans = request?.key === key ? request.data : undefined;
  const visible = useMemo(
    () => (plans ? visiblePlanMoves(plans, preferences.minShare, preferences.hideCaptures) : []),
    [plans, preferences.minShare, preferences.hideCaptures],
  );
  const plan = useMemo(() => (plans ? typicalPlan(plans, visible) : []), [plans, visible]);

  useEffect(() => {
    setShapes(plans && preferences.showOnBoard ? planShapes(plans, plan, white, hovered) : []);
  }, [plans, plan, white, hovered, preferences.showOnBoard, setShapes]);
  useEffect(() => () => setShapes([]), [setShapes]);

  const controls = (
    <Group gap={6} wrap="wrap" mb={6}>
      <SegmentedControl
        size="xs"
        value={side}
        onChange={(value) => setSide(value as "white" | "black")}
        data={[
          { label: t("Common.White"), value: "white" },
          { label: t("Common.Black"), value: "black" },
        ]}
      />
      <Select
        size="xs"
        w={120}
        allowDeselect={false}
        value={String(preferences.window)}
        onChange={(value) => setPreferences((p) => ({ ...p, window: Number(value) }))}
        data={WINDOWS.map((count) => ({
          value: String(count),
          label: t("Plans.Window", "{{count}} moves", { count }),
        }))}
        aria-label={t("Plans.WindowLabel", "Moves read after the position")}
      />
      <Select
        size="xs"
        w={90}
        allowDeselect={false}
        value={String(preferences.minShare)}
        onChange={(value) => setPreferences((p) => ({ ...p, minShare: Number(value) }))}
        data={SHARES.map((share) => ({
          value: String(share),
          label: `${Math.round(share * 100)} %+`,
        }))}
        aria-label={t("Plans.ShareLabel", "Least share of the games")}
      />
      <Checkbox
        size="xs"
        label={t("Plans.ShowOnBoard", "Show on board")}
        checked={preferences.showOnBoard}
        onChange={(event) => {
          const showOnBoard = event.currentTarget.checked;
          setPreferences((p) => ({ ...p, showOnBoard }));
        }}
      />
      <Checkbox
        size="xs"
        label={t("Plans.HideCaptures", "Hide captures")}
        checked={preferences.hideCaptures}
        onChange={(event) => {
          const hideCaptures = event.currentTarget.checked;
          setPreferences((p) => ({ ...p, hideCaptures }));
        }}
      />
    </Group>
  );

  let body: React.ReactNode;
  if (request?.key === key && request.error) {
    body = (
      <Text size="sm" c="dimmed" p="sm">
        {t("Plans.Failed", "The plans could not be computed.")}
      </Text>
    );
  } else if (!plans) {
    body = (
      <Group justify="center" p="md">
        <Loader size="sm" />
      </Group>
    );
  } else if (visible.length === 0) {
    body = (
      <Text size="sm" c="dimmed" p="sm">
        {t("Plans.Empty", "No move reaches {{share}} % of the games.", {
          share: Math.round(preferences.minShare * 100),
        })}
      </Text>
    );
  } else {
    body = (
      <ScrollArea className={classes.list} offsetScrollbars type="auto">
        {visible.map((i) => {
          const move = plans.moves[i];
          const share = move.games / plans.games;
          const step = plan.indexOf(i);
          const delta = planMoveDelta(move, plans);
          const together = move.together
            .map((games, j) => ({ j, games }))
            .filter(({ j, games }) => j !== i && games > 0)
            .sort((a, b) => b.games - a.games)
            .slice(0, 4)
            .map(
              ({ j, games }) =>
                `${planViewName(plans.moves[j])} (${Math.round((games / move.games) * 100)} %)`,
            );
          return (
            <div key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <UnstyledButton
                className={classes.row}
                data-hovered={hovered === i || undefined}
                onClick={() => setExpanded((current) => (current === i ? null : i))}
                aria-expanded={expanded === i}
              >
                <IconChevronRight
                  size={12}
                  className={classes.chevron}
                  style={{ transform: expanded === i ? "rotate(90deg)" : undefined }}
                />
                <span className={classes.step} data-in-plan={step >= 0 || undefined}>
                  {step >= 0 ? step + 1 : ""}
                </span>
                <Text size="xs" c="dimmed" className={classes.moveNumber}>
                  {Math.round(move.typicalMove)}.
                </Text>
                <Text size="sm" fw={500} className={classes.name}>
                  {planViewName(move)}
                </Text>
                <Text size="xs" c="dimmed" ta="right">
                  {formatNumber(move.games)}
                </Text>
                <div className={classes.bar}>
                  <div className={classes.barFill} style={{ width: `${share * 100}%` }} />
                </div>
                <Text size="xs" ta="right">
                  {Math.round(share * 100)} %
                </Text>
                <Tooltip
                  multiline
                  w={280}
                  disabled={delta == null}
                  label={t(
                    "Plans.DeltaTip",
                    "How these games scored against what the ratings predicted, compared with all games of the position. It is a correlation, not a cause.",
                  )}
                >
                  <Text
                    size="xs"
                    ta="right"
                    c={delta == null || Math.abs(delta) < 2 ? "dimmed" : delta > 0 ? "teal" : "red"}
                  >
                    {delta == null ? "" : `${delta > 0 ? "+" : ""}${Math.round(delta)} %`}
                  </Text>
                </Tooltip>
              </UnstyledButton>
              {expanded === i && (
                <Text size="xs" c="dimmed" className={classes.detail}>
                  {together.length > 0
                    ? t("Plans.Together", "Played with: {{moves}}", { moves: together.join(", ") })
                    : t("Plans.Alone", "Not usually played with the other moves listed.")}
                </Text>
              )}
            </div>
          );
        })}
      </ScrollArea>
    );
  }

  return (
    <div className={classes.panel}>
      {controls}
      {plans && (
        <Text size="xs" c="dimmed" mb={4}>
          {t("Plans.Games", "{{games}} games", { games: formatNumber(plans.games) })}
          {plans.scanned < plans.total &&
            ` · ${t("Plans.Sampled", "even sample of {{scanned}} of {{total}}", {
              scanned: formatNumber(plans.scanned),
              total: formatNumber(plans.total),
            })}`}
          {` · ${t("Plans.Elapsed", "computed in {{seconds}} s", {
            seconds: (plans.elapsedMs / 1000).toFixed(1),
          })}`}
        </Text>
      )}
      {plans?.moves.some((move) => !move.from) && (
        <Text size="xs" c="dimmed" mb={4}>
          {t(
            "Plans.ByDestination",
            "Pawn structure: the pieces stand differently in each game, so a piece move counts by the square it goes to.",
          )}
        </Text>
      )}
      {body}
    </div>
  );
}

export default PlansPanel;
