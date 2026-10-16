import { atom } from "jotai";
import type { HumanBotOpeningRepertoireConfig } from "@/utils/humanBots";

/**
 * Books of the twin bots opened this session (I-43), by twin id. They can hold thousands of lines,
 * so they stay in memory instead of the persisted player settings; a twin chosen in an earlier
 * session is opened again from its player card.
 */
export const twinBooksAtom = atom<Record<string, HumanBotOpeningRepertoireConfig>>({});
