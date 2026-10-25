import { BaseDirectory, exists, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import type { TextFileSystem } from "./fileBackedStorage";

const appData = { baseDir: BaseDirectory.AppData };

/** App data files, replaced atomically; shared by the stores that left localStorage. */
export const appDataFiles: TextFileSystem = {
    exists: (name) => exists(name, appData),
    read: (name) => readTextFile(name, appData),
    async write(name, contents) {
        const temporary = `${name}.tmp`;
        await writeTextFile(temporary, contents, appData);
        await rename(temporary, name, {
            oldPathBaseDir: BaseDirectory.AppData,
            newPathBaseDir: BaseDirectory.AppData,
        });
    },
    rename: (from, to) =>
        rename(from, to, {
            oldPathBaseDir: BaseDirectory.AppData,
            newPathBaseDir: BaseDirectory.AppData,
        }),
};
