import { Badge, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";

/** Avatar color of a twin in a tournament: it has no catalogue personality. */
export const TWIN_COLOR = "grape";

/** Marks a saved twin among the entrants of a tournament. */
export function TwinBadge() {
  const { t } = useTranslation();
  return (
    <Tooltip
      label={t(
        "Tournaments.Twin.Desc",
        "The twin of a player card: their repertoire and their way of playing at the rhythm of the tournament. Added by hand (autofill never picks twins); games against it count in the tournament but not for your rating.",
      )}
      multiline
      w={260}
    >
      <Badge size="sm" variant="light" color={TWIN_COLOR}>
        {t("Tournaments.Twin", "Twin")}
      </Badge>
    </Tooltip>
  );
}
