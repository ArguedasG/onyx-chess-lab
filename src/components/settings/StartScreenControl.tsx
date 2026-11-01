import { Button, SegmentedControl } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { RESET } from "jotai/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type StartScreen, startScreenAtom } from "@/state/atoms";
import { seenHintsAtom } from "@/state/hints";

/** What the app opens on: the home screen or an analysis board. Also on the home screen. */
export function StartScreenControl({ size = "sm" }: { size?: "xs" | "sm" }) {
  const { t } = useTranslation();
  const [screen, setScreen] = useAtom(startScreenAtom);
  return (
    <SegmentedControl
      size={size}
      value={screen}
      onChange={(value) => setScreen(value as StartScreen)}
      data={[
        { value: "home", label: t("Settings.StartScreen.Home", "Home") },
        { value: "board", label: t("Settings.StartScreen.Board", "Analysis board") },
      ]}
    />
  );
}

/** Shows the first-time hints again. */
export function ResetHintsButton() {
  const { t } = useTranslation();
  const [seen, setSeen] = useAtom(seenHintsAtom);
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="default"
      size="xs"
      leftSection={<IconBulb size={14} />}
      disabled={seen.length === 0 && !done}
      onClick={() => {
        setSeen(RESET);
        setDone(true);
      }}
    >
      {done
        ? t("Settings.Hints.Done", "They will show again")
        : t("Settings.Hints.Reset", "Show again")}
    </Button>
  );
}
