/**
 * The latest Onyx release, resolved when the site is built. The Pages workflow rebuilds the site
 * whenever a release is published, so the download buttons always point at the current files.
 * If GitHub cannot be reached during the build, the page falls back to the releases page and a
 * small script asks the GitHub API from the visitor's browser instead.
 */

export const REPO = "ArguedasG/onyx-chess-lab";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export type PlatformId = "windows" | "macArm" | "macIntel" | "appImage" | "deb";

export type Asset = {
    name: string;
    url: string;
    size: number;
    sha256: string | null;
};

export type Release = {
    version: string;
    tag: string;
    url: string;
    publishedAt: string;
    assets: Partial<Record<PlatformId, Asset>>;
};

/** How each installer is recognised by its file name. Kept in sync with the client fallback. */
export const ASSET_PATTERNS: Record<PlatformId, string> = {
    windows: "_x64-setup\\.exe$",
    macArm: "_aarch64\\.dmg$",
    macIntel: "_x64\\.dmg$",
    appImage: "_amd64\\.AppImage$",
    deb: "_amd64\\.deb$",
};

type GitHubAsset = {
    name: string;
    browser_download_url: string;
    size: number;
    digest?: string | null;
};

type GitHubRelease = {
    tag_name: string;
    html_url: string;
    published_at: string;
    draft: boolean;
    prerelease: boolean;
    assets: GitHubAsset[];
};

export function parseRelease(data: GitHubRelease): Release | null {
    if (!data || data.draft || data.prerelease || !Array.isArray(data.assets)) return null;
    const assets: Release["assets"] = {};
    for (const [id, pattern] of Object.entries(ASSET_PATTERNS) as [PlatformId, string][]) {
        const re = new RegExp(pattern);
        const found = data.assets.find((asset) => re.test(asset.name));
        if (!found) continue;
        assets[id] = {
            name: found.name,
            url: found.browser_download_url,
            size: found.size,
            sha256: found.digest?.startsWith("sha256:") ? found.digest.slice(7) : null,
        };
    }
    return {
        version: data.tag_name.replace(/^v/, ""),
        tag: data.tag_name,
        url: data.html_url,
        publishedAt: data.published_at,
        assets,
    };
}

let cached: Promise<Release | null> | undefined;

export function getLatestRelease(): Promise<Release | null> {
    cached ??= fetchLatestRelease();
    return cached;
}

async function fetchLatestRelease(): Promise<Release | null> {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "onyx-chess-lab-website",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        try {
            const response = await fetch(LATEST_RELEASE_API, { headers });
            if (!response.ok) continue;
            const release = parseRelease((await response.json()) as GitHubRelease);
            if (release) return release;
        } catch {
            // Retry; GitHub's API occasionally answers with an error page.
        }
    }
    console.warn("[release] Could not resolve the latest release; using the client fallback.");
    return null;
}

export function formatSize(bytes: number) {
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}
