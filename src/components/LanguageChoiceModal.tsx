import { Button, SimpleGrid, Stack, Text } from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  browserStorage,
  confirmLanguageChoice,
  isLanguageChoicePending,
  REFERENCE_LANGUAGES,
} from "@/utils/language";

/**
 * First launch: one click picks and confirms the language. There is no preselected option to
 * accept by mistake (a Windows in English used to leave English selected behind "Continue").
 */
export default function LanguageChoiceModal() {
  const { i18n } = useTranslation();
  const [opened, setOpened] = useState(() => isLanguageChoicePending(browserStorage()));

  const choose = (language: string) => {
    void i18n.changeLanguage(language);
    confirmLanguageChoice(browserStorage());
    setOpened(false);
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      title="Idioma · Language"
      centered
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
    >
      <Stack>
        {/* Both languages at once: the app does not know yet which one the user reads. */}
        <Text size="sm">
          Elige el idioma de Onyx Chess Lab.
          <br />
          Choose the language of Onyx Chess Lab.
        </Text>
        <SimpleGrid cols={2}>
          {REFERENCE_LANGUAGES.map(({ value, label }) => (
            <Button key={value} size="lg" variant="default" onClick={() => choose(value)}>
              {label}
            </Button>
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Puedes cambiarlo en Configuración → Apariencia, donde hay más idiomas.
          <br />
          You can change it in Settings → Appearance, where more languages are available.
        </Text>
      </Stack>
    </Modal>
  );
}
