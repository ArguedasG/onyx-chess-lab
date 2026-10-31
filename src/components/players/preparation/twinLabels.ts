import { useTranslation } from "react-i18next";
import { useRhythmLabel } from "@/components/boards/RatedGameSelector";
import type { TwinProfileKey } from "@/utils/preparation/savedTwins";

/** Name of a twin profile: a rhythm, or every game for the general one. */
export function useProfileLabel() {
    const { t } = useTranslation();
    const rhythmLabel = useRhythmLabel();
    return (key: TwinProfileKey) =>
        key === "general" ? t("Preparation.Twin.General", "All rhythms") : rhythmLabel(key);
}
