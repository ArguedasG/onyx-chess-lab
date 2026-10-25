import { getDefaultZIndex, Modal as MantineModal, type ModalProps } from "@mantine/core";
import { useEffect, useId, useState } from "react";

/** Modals open right now, in the order they were opened. */
const openModals: string[] = [];

/**
 * Mantine stacks modals in the order they were mounted, not opened, all at the same z-index, so a
 * confirmation opened from inside another modal could appear behind it. Each modal opened here
 * goes one level above the ones already open (staying below dropdowns and notifications).
 */
function StackedModal({ opened, zIndex, ...props }: ModalProps) {
  const id = useId();
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (!opened) return;
    setDepth(openModals.length);
    openModals.push(id);
    return () => {
      const index = openModals.indexOf(id);
      if (index >= 0) openModals.splice(index, 1);
    };
  }, [id, opened]);

  return (
    <MantineModal
      opened={opened}
      zIndex={zIndex ?? (getDefaultZIndex("modal") as number) + depth}
      {...props}
    />
  );
}

export const Modal = Object.assign(StackedModal, {
  Root: MantineModal.Root,
  Overlay: MantineModal.Overlay,
  Content: MantineModal.Content,
  Body: MantineModal.Body,
  Header: MantineModal.Header,
  Title: MantineModal.Title,
  CloseButton: MantineModal.CloseButton,
  Stack: MantineModal.Stack,
});
