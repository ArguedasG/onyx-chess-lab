import {
  Alert,
  Badge,
  Card,
  Code,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { findRepertoirePositionMatches } from "@/utils/positionActions";
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
  const matches = useMemo(
    () => findRepertoirePositionMatches(areas.openings, tree),
    [areas.openings, tree],
  );
  const current = getNodeAtPath(tree.root, tree.position);

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
            <Alert color="blue">
              {t(
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
                        <Badge color={match.kind === "exact" ? "green" : "violet"}>
                          {match.kind === "exact"
                            ? t("PositionActions.Exact", "Exact")
                            : t("PositionActions.Transposition", "Transposition")}
                        </Badge>
                      </Group>
                      <Text size="sm">
                        {match.kind === "exact"
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
