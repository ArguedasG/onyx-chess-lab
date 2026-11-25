export type DetectedOs = "windows" | "mac" | "linux" | "mobile" | "unknown";

/**
 * The visitor's operating system, as far as the browser tells. It cannot tell Apple Silicon from
 * Intel Macs reliably (Safari always reports Intel), so the download page offers both.
 */
export function detectOs(): DetectedOs {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
    const ua = navigator.userAgent;
    if (nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua)) return "mobile";
    // iPadOS reports itself as a Mac; touch support gives it away.
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "mobile";
    const platform = (nav.userAgentData?.platform || navigator.platform || "").toLowerCase();
    if (platform.includes("win") || /Windows/.test(ua)) return "windows";
    if (platform.includes("mac") || /Mac OS X/.test(ua)) return "mac";
    if (platform.includes("linux") || /Linux|X11/.test(ua)) return "linux";
    return "unknown";
}
