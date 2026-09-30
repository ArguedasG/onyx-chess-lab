import { Button, Modal, SegmentedControl, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  browserStorage,
  confirmLanguageChoice,
  isLanguageChoicePending,
  REFERENCE_LANGUAGES,
} from "@/utils/language";

export default function LanguageChoiceModal() {
  const { t, i18n } = useTranslation();
  const [opened, setOpened] = useState(() => isLanguageChoicePending(browserStorage()));
  const current = REFERENCE_LANGUAGES.some(({ value }) => value === i18n.language)
    ? i18n.language
    : "en-US";

  const confirm = () => {
    // Persist the visible choice even if i18next resolved it from the system without caching it.
    void i18n.changeLanguage(current);
    confirmLanguageChoice(browserStorage());
    setOpened(false);
  };

  return (
    <Modal
      opened={opened}
      onClose={confirm}
      title={t("LanguageChoice.Title")}
      centered
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
    >
      <Stack>
        <Text size="sm">{t("LanguageChoice.Description")}</Text>
        <SegmentedControl
          fullWidth
          size="md"
          value={current}
          data={REFERENCE_LANGUAGES.map(({ value, label }) => ({ value, label }))}
          onChange={(value) => void i18n.changeLanguage(value)}
        />
        <Text size="xs" c="dimmed">
          {t("LanguageChoice.SettingsHint")}
        </Text>
        <Button onClick={confirm}>{t("LanguageChoice.Continue")}</Button>
      </Stack>
    </Modal>
  );
}
