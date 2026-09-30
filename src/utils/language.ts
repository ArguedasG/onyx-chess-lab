import type { CustomDetector } from "i18next-browser-languagedetector";

/** localStorage key where i18next-browser-languagedetector caches the active language. */
export const LANGUAGE_CACHE_KEY = "i18nextLng";
/** Tracks whether the user already confirmed a language on first launch. */
export const LANGUAGE_CHOICE_KEY = "language-choice";

export const SYSTEM_LANGUAGE_DETECTOR = "onyxSystemLanguage";

/** Languages with complete reference catalogs, offered on first launch. */
export const REFERENCE_LANGUAGES = [
    { value: "es-ES", label: "Español" },
    { value: "en-US", label: "English" },
] as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Maps the operating system languages to a complete reference catalog. Other catalogs are partial
 * and fall back to Spanish for Onyx texts, so they remain an explicit choice in Settings.
 */
export function resolveSystemLanguage(languages: readonly string[]): string {
    for (const language of languages) {
        const code = language.toLowerCase().split(/[-_]/)[0];
        if (code === "es") return "es-ES";
        if (code === "en") return "en-US";
    }
    return "en-US";
}

export const systemLanguageDetector: CustomDetector = {
    name: SYSTEM_LANGUAGE_DETECTOR,
    lookup() {
        if (typeof navigator === "undefined") return undefined;
        const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
        return resolveSystemLanguage(languages.filter(Boolean));
    },
};

/**
 * Runs before i18next caches a language. Installations that already had a cached language keep it
 * and never see the first-launch prompt; a new installation stays pending until the user confirms.
 */
export function prepareLanguageChoice(storage: StorageLike | undefined): boolean {
    try {
        if (!storage) return false;
        const choice = storage.getItem(LANGUAGE_CHOICE_KEY);
        if (choice === "confirmed") return false;
        if (choice === "pending") return true;
        if (storage.getItem(LANGUAGE_CACHE_KEY) !== null) {
            storage.setItem(LANGUAGE_CHOICE_KEY, "confirmed");
            return false;
        }
        storage.setItem(LANGUAGE_CHOICE_KEY, "pending");
        return true;
    } catch {
        return false;
    }
}

export function isLanguageChoicePending(storage: StorageLike | undefined): boolean {
    try {
        return storage?.getItem(LANGUAGE_CHOICE_KEY) === "pending";
    } catch {
        return false;
    }
}

export function confirmLanguageChoice(storage: StorageLike | undefined): void {
    try {
        storage?.setItem(LANGUAGE_CHOICE_KEY, "confirmed");
    } catch {
        // The prompt will simply appear again on the next launch.
    }
}

export function browserStorage(): Storage | undefined {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}
