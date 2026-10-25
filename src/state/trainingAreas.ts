import { notifications } from "@mantine/notifications";
import { warn } from "@tauri-apps/plugin-log";
import i18n from "i18next";
import { atomWithStorage } from "jotai/utils";
import { appDataFiles } from "./appDataFiles";
import { createFileBackedStorage } from "./fileBackedStorage";
import { createZodStorage } from "./utils";
import {
    createEmptyTrainingAreas,
    persistedTrainingAreasSchema,
    type TrainingAreasState,
} from "@/utils/trainingAreas";

export const TRAINING_AREAS_KEY = "training-areas-v1";

let lastErrorNotice = 0;

/**
 * Training data used to live in localStorage, whose ~5 MB quota a single large course could fill.
 * It now lives in a JSON file in the app data folder, written atomically and debounced.
 */
export const trainingAreasStorage = createFileBackedStorage({
    fs: appDataFiles,
    legacy: typeof localStorage === "undefined" ? undefined : localStorage,
    onError(key, error) {
        warn(`Training storage error for ${key}: ${String(error)}`);
        if (Date.now() - lastErrorNotice < 30_000) return;
        lastErrorNotice = Date.now();
        notifications.show({
            color: "red",
            title: i18n.t("TrainingStorage.ErrorTitle", "Training progress could not be saved"),
            message: String(error),
        });
    },
});

export function preloadTrainingAreas(): Promise<void> {
    return trainingAreasStorage.preload(TRAINING_AREAS_KEY);
}

export const trainingAreasAtom = atomWithStorage<TrainingAreasState>(
    TRAINING_AREAS_KEY,
    createEmptyTrainingAreas(),
    createZodStorage(persistedTrainingAreasSchema, trainingAreasStorage),
);
