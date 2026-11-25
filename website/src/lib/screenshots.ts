import type { ImageMetadata } from "astro";

const files = import.meta.glob<{ default: ImageMetadata }>(
    "../assets/screenshots/*.{png,jpg,jpeg,webp}",
);

/** The screenshot named `name` in src/assets/screenshots, if it has been added. */
export async function findScreenshot(name: string): Promise<ImageMetadata | null> {
    for (const [path, load] of Object.entries(files)) {
        const file = path.split("/").pop() ?? "";
        if (file.replace(/\.[^.]+$/, "") === name) return (await load()).default;
    }
    return null;
}

/** Whether a section should keep room for its screenshot (always in development). */
export async function hasScreenshot(name: string) {
    return import.meta.env.DEV || (await findScreenshot(name)) !== null;
}
