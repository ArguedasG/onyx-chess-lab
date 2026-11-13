import { ActionIcon, List, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconHelpCircle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { type HelpSection, sectionHelp } from "./sectionHelpContent";

export type SectionHelpContent = {
  title: string;
  /** One or two sentences: what the section is for. */
  purpose: string;
  /** What can be done there, one short line each. */
  actions: string[];
  /** The first thing to try. */
  start: string;
};

/**
 * The "?" at the top right of a big section: what it is for, what can be done there and where to
 * start, in a few lines. The content lives in `sectionHelpContent.ts`.
 */
export default function SectionHelp({ section }: { section: HelpSection }) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const content = sectionHelp(section, t);
  return (
    <>
      <Tooltip label={t("SectionHelp.Open", "What can I do here?")}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          aria-label={t("SectionHelp.Open", "What can I do here?")}
          onClick={() => setOpened(true)}
        >
          <IconHelpCircle size={22} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={() => setOpened(false)} title={content.title} size="lg">
        <Stack gap="md">
          <Text>{content.purpose}</Text>
          <div>
            <Title order={5} mb={6}>
              {t("SectionHelp.WhatYouCanDo", "What you can do here")}
            </Title>
            <List spacing={6} size="sm">
              {content.actions.map((action) => (
                <List.Item key={action}>{action}</List.Item>
              ))}
            </List>
          </div>
          <div>
            <Title order={5} mb={6}>
              {t("SectionHelp.WhereToStart", "Where to start")}
            </Title>
            <Text size="sm">{content.start}</Text>
          </div>
        </Stack>
      </Modal>
    </>
  );
}
