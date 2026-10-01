import { describe, expect, it, vi } from "vitest";
import { createFileBackedStorage, type TextFileSystem } from "./fileBackedStorage";

function memoryFs(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial));
    const fs: TextFileSystem & { files: Map<string, string> } = {
        files,
        exists: async (name) => files.has(name),
        read: async (name) => {
            const value = files.get(name);
            if (value === undefined) throw new Error(`missing ${name}`);
            return value;
        },
        write: vi.fn(async (name: string, contents: string) => {
            files.set(name, contents);
        }),
        rename: async (from, to) => {
            const value = files.get(from);
            if (value === undefined) throw new Error(`missing ${from}`);
            files.delete(from);
            files.set(to, value);
        },
    };
    return fs;
}

function memoryLegacy(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => void values.delete(key),
    };
}

describe("createFileBackedStorage", () => {
    it("serves the preloaded file and refuses keys that were not preloaded", async () => {
        const storage = createFileBackedStorage({ fs: memoryFs({ "k.json": "saved" }) });
        await storage.preload("k");
        expect(storage.getItem("k")).toBe("saved");
        expect(() => storage.getItem("other")).toThrow(/not preloaded/);
    });

    it("migrates the legacy localStorage value into a file and keeps a backup", async () => {
        const fs = memoryFs();
        const legacy = memoryLegacy({ k: '{"big":true}' });
        const storage = createFileBackedStorage({ fs, legacy });
        await storage.preload("k");

        expect(storage.getItem("k")).toBe('{"big":true}');
        expect(fs.files.get("k.json")).toBe('{"big":true}');
        expect(fs.files.get("k.localstorage-backup.json")).toBe('{"big":true}');
        expect(legacy.values.has("k")).toBe(false);
    });

    it("keeps the legacy value when the migration cannot be written", async () => {
        const fs = memoryFs();
        fs.write = vi.fn(async () => {
            throw new Error("disk full");
        });
        const legacy = memoryLegacy({ k: "old" });
        const onError = vi.fn();
        const storage = createFileBackedStorage({ fs, legacy, onError });
        await storage.preload("k");

        expect(storage.getItem("k")).toBe("old");
        expect(legacy.values.get("k")).toBe("old");
        expect(onError).toHaveBeenCalled();
    });

    it("debounces writes and only persists the latest value", async () => {
        const fs = memoryFs();
        const storage = createFileBackedStorage({ fs, debounceMs: 60_000 });
        await storage.preload("k");
        storage.setItem("k", "one");
        storage.setItem("k", "two");
        expect(fs.write).not.toHaveBeenCalled();
        expect(storage.getItem("k")).toBe("two");

        await storage.flush();
        expect(fs.write).toHaveBeenCalledTimes(1);
        expect(fs.files.get("k.json")).toBe("two");
    });

    it("never overwrites a file it could not read", async () => {
        const fs = memoryFs({ "k.json": "precious" });
        fs.read = async () => {
            throw new Error("locked");
        };
        const storage = createFileBackedStorage({ fs });
        await storage.preload("k");

        expect(() => storage.setItem("k", "defaults")).toThrow(/read-only/);
        await storage.flush();
        expect(fs.files.get("k.json")).toBe("precious");
    });

    it("retries a failed write on the next flush", async () => {
        const fs = memoryFs();
        let fail = true;
        const files = fs.files;
        fs.write = vi.fn(async (name: string, contents: string) => {
            if (fail) throw new Error("busy");
            files.set(name, contents);
        });
        const storage = createFileBackedStorage({ fs, debounceMs: 60_000 });
        await storage.preload("k");
        storage.setItem("k", "value");
        await storage.flush();
        expect(files.has("k.json")).toBe(false);

        fail = false;
        await storage.flush();
        expect(files.get("k.json")).toBe("value");
    });

    it("archives instead of deleting", async () => {
        const fs = memoryFs({ "k.json": "saved" });
        const storage = createFileBackedStorage({ fs });
        await storage.preload("k");
        await storage.archive("k", "cleared-1");

        expect(fs.files.has("k.json")).toBe(false);
        expect(fs.files.get("k.cleared-1.json")).toBe("saved");
        expect(storage.getItem("k")).toBeNull();
    });
});
