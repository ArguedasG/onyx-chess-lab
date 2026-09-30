import { describe, expect, it } from "vitest";
import {
    confirmLanguageChoice,
    isLanguageChoicePending,
    LANGUAGE_CACHE_KEY,
    LANGUAGE_CHOICE_KEY,
    prepareLanguageChoice,
    resolveSystemLanguage,
} from "./language";

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
    };
}

describe("system language detection", () => {
    it("maps any Spanish or English region to the reference catalogs", () => {
        expect(resolveSystemLanguage(["es-CR"])).toBe("es-ES");
        expect(resolveSystemLanguage(["es-419"])).toBe("es-ES");
        expect(resolveSystemLanguage(["en-GB"])).toBe("en-US");
        expect(resolveSystemLanguage(["EN"])).toBe("en-US");
    });

    it("uses the first supported preference and defaults to English otherwise", () => {
        expect(resolveSystemLanguage(["de-DE", "es-MX", "en-US"])).toBe("es-ES");
        expect(resolveSystemLanguage(["ja-JP"])).toBe("en-US");
        expect(resolveSystemLanguage([])).toBe("en-US");
    });
});

describe("first-launch language choice", () => {
    it("asks on a new installation until the user confirms", () => {
        const storage = memoryStorage();
        expect(prepareLanguageChoice(storage)).toBe(true);

        // i18next caches its detected language before the user answers; the prompt must survive a restart.
        storage.setItem(LANGUAGE_CACHE_KEY, "en-US");
        expect(prepareLanguageChoice(storage)).toBe(true);
        expect(isLanguageChoicePending(storage)).toBe(true);

        confirmLanguageChoice(storage);
        expect(prepareLanguageChoice(storage)).toBe(false);
        expect(isLanguageChoicePending(storage)).toBe(false);
    });

    it("never asks existing installations that already have a language", () => {
        const storage = memoryStorage({ [LANGUAGE_CACHE_KEY]: "es-ES" });
        expect(prepareLanguageChoice(storage)).toBe(false);
        expect(storage.values.get(LANGUAGE_CHOICE_KEY)).toBe("confirmed");
        expect(storage.values.get(LANGUAGE_CACHE_KEY)).toBe("es-ES");
    });

    it("does not block startup when storage is unavailable", () => {
        const failing = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
        };
        expect(prepareLanguageChoice(failing)).toBe(false);
        expect(prepareLanguageChoice(undefined)).toBe(false);
        expect(() => confirmLanguageChoice(failing)).not.toThrow();
    });
});
