import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { IconExternalLink } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import {
  findRepertoirePositionMatches,
  pawnStructureKey,
  START_PAWNS_KEY,
} from "@/utils/positionActions";
import { getNodeAtPath, type TreeState } from "@/utils/treeReducer";
import PositionEndgameForm from "./PositionEndgameForm";
import PositionTacticsForm from "./PositionTacticsForm";

type Section = "repertoires" | "tactics" | "endgames";

export default function PositionActionsModal({
  tree,
  sourceLabel,
  onClose,
}: {
  tree: TreeState;
  sourceLabel: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const areas = useAtomValue(trainingAreasAtom);
  const [section, setSection] = useState<Section>("repertoires");
  const [mode, setMode] = useState<"position" | "pawns">("position");
  const matches = useMemo(
    () => findRepertoirePositionMatches(areas.openings, tree, mode),
    [areas.openings, tree, mode],
  );
  const current = getNodeAtPath(tree.root, tree.position);
  const startPawns = pawnStructureKey(current.fen) === START_PAWNS_KEY;

  return (
    <Modal
      opened
      onClose={onClose}
      title={t("PositionActions.Title", "Current position")}
      size="xl"
    >
      <Stack>
        <Code block>{current.fen}</Code>
        <SegmentedControl
          value={section}
          onChange={(value) => setSection(value as Section)}
          data={[
            {
              value: "repertoires",
              label: t("PositionActions.Repertoires", "Repertoires"),
            },
            { value: "tactics", label: t("Training.Tactics", "Tactics") },
            { value: "endgames", label: t("Training.Endgames", "Endgames") },
          ]}
        />

        {section === "repertoires" && (
          <>
            <SegmentedControl
              w="fit-content"
              size="xs"
              value={mode}
              onChange={(value) => setMode(value as "position" | "pawns")}
              data={[
                { value: "position", label: t("PositionActions.ModePosition", "Position") },
                { value: "pawns", label: t("PositionActions.ModePawns", "Pawn structure") },
              ]}
            />
            <Alert color="blue">
              {mode === "pawns"
                ? t(
                    "PositionActions.PawnsExplanation",
                    "Lines of your repertoires where the pawns stand exactly as on the board, wherever the other pieces are: the first moment of each line where it happens.",
                  )
                : t(
                    "PositionActions.MatchExplanation",
                    "An exact match uses the same move order from the same initial position. A transposition reaches the same legal position through a different route.",
                  )}
            </Alert>
            <ScrollArea.Autosize mah={480} offsetScrollbars>
              <Stack>
                {matches.map((match) => (
                  <Card key={`${match.lineId}:${match.ply}`} withBorder>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <div>
                          <Text fw={600}>{match.repertoireName}</Text>
                          <Text size="sm" c="dimmed">
                            {match.variantName} · {match.lineName}
                          </Text>
                        </div>
                        <Badge
                          color={
                            match.kind === "exact"
                              ? "green"
                              : match.kind === "pawns"
                                ? "teal"
                                : "violet"
                          }
                        >
                          {match.kind === "exact"
                            ? t("PositionActions.Exact", "Exact")
                            : match.kind === "pawns"
                              ? t("PositionActions.SamePawns", "Same pawns")
                              : t("PositionActions.Transposition", "Transposition")}
                        </Badge>
                      </Group>
                      <Text size="sm">
                        {match.kind === "pawns"
                          ? t(
                              "PositionActions.PawnsDetail",
                              "The pawns stand as on the board after {{count}} plies; the other pieces may be elsewhere.",
                              { count: match.ply },
                            )
                          : match.kind === "exact"
                            ? t(
                                "PositionActions.ExactDetail",
                                "The repertoire follows the same route to this position after {{count}} plies.",
                                { count: match.ply },
                              )
                            : t(
                                "PositionActions.TranspositionDetail",
                                "The board position is identical, but the repertoire reaches it with another move order after {{count}} plies.",
                                { count: match.ply },
                              )}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t("PositionActions.Route", "Route")}: {match.routeSan.join(" ") || "—"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t("PositionActions.Continuation", "Continuation")}:{" "}
                        {match.continuationSan.join(" ") || "—"}
                      </Text>
                      <Group justify="flex-end">
                        <Link
                          to="/training/openings/$repertoireId/$variantId"
                          params={{ repertoireId: match.repertoireId, variantId: match.variantId }}
                          hash={`line-${match.lineId}`}
                          onClick={onClose}
                          style={{ textDecoration: "none" }}
                        >
                          <Button
                            component="span"
                            size="xs"
                            variant="light"
                            rightSection={<IconExternalLink size={14} />}
                          >
                            {t("PositionActions.ViewRepertoireLine", "View line in repertoire")}
                          </Button>
                        </Link>
                      </Group>
                    </Stack>
                  </Card>
                ))}
                {matches.length === 0 && (
                  <Alert color="gray">
                    {Object.keys(areas.openings.repertoires).length === 0
                      ? t(
                          "PositionActions.NoRepertoires",
                          "There are no local opening repertoires to search.",
                        )
                      : mode === "pawns" && startPawns
                        ? t(
                            "PositionActions.StartPawns",
                            "All the pawns are still at home: play some moves to search their structure.",
                          )
                        : mode === "pawns"
                          ? t(
                              "PositionActions.NoPawnMatches",
                              "This pawn structure was not found in the trainable lines of your local repertoires.",
                            )
                          : t(
                              "PositionActions.NoMatches",
                              "This position was not found in the trainable lines of your local repertoires.",
                            )}
                  </Alert>
                )}
              </Stack>
            </ScrollArea.Autosize>
          </>
        )}
        {section === "tactics" && (
          <PositionTacticsForm tree={tree} sourceLabel={sourceLabel} onCreated={onClose} />
        )}
        {section === "endgames" && (
          <PositionEndgameForm tree={tree} sourceLabel={sourceLabel} onCreated={onClose} />
        )}
      </Stack>
    </Modal>
  );
}
