// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// GitHub Pages serves the site from /onyx-chess-lab until a custom domain is connected.
// When that happens, set `site` to the domain and remove `base` (see docs/public-launch-plan.es.md).
const site = "https://arguedasg.github.io";
const base = "/onyx-chess-lab";

/**
 * Remember the language of the last page read, so the language-picking root page (/) sends a
 * returning visitor back to it. Runs on every Starlight page; the landing pages do the same.
 */
const rememberLanguage = `try{localStorage.setItem("onyx-lang",document.documentElement.lang.slice(0,2))}catch(e){}`;

export default defineConfig({
    site,
    base,
    trailingSlash: "always",
    integrations: [
        starlight({
            title: "Onyx Chess Lab",
            description:
                "Free, open-source chess software for Windows, macOS and Linux: databases, engines and analysis, with training and preparation built in.",
            logo: { src: "./src/assets/brand/onyx-logo.png", alt: "Onyx Chess Lab" },
            favicon: "/favicon.png",
            defaultLocale: "en",
            locales: {
                en: { label: "English", lang: "en" },
                es: { label: "Español", lang: "es" },
            },
            social: [
                {
                    icon: "github",
                    label: "GitHub",
                    href: "https://github.com/ArguedasG/onyx-chess-lab",
                },
            ],
            customCss: ["./src/styles/fonts.css", "./src/styles/starlight.css"],
            head: [
                { tag: "script", content: rememberLanguage },
                {
                    tag: "meta",
                    attrs: { property: "og:image", content: `${site}${base}/og-image.png` },
                },
                { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
                {
                    tag: "link",
                    attrs: { rel: "apple-touch-icon", href: `${base}/apple-touch-icon.png` },
                },
            ],
            editLink: {
                baseUrl: "https://github.com/ArguedasG/onyx-chess-lab/edit/main/website/",
            },
            lastUpdated: true,
            sidebar: [
                {
                    label: "Getting started",
                    translations: { es: "Primeros pasos" },
                    items: [
                        { slug: "start/introduction" },
                        { slug: "start/first-steps" },
                    ],
                },
                {
                    label: "Installation",
                    translations: { es: "Instalación" },
                    items: [
                        { slug: "install/windows" },
                        { slug: "install/macos" },
                        { slug: "install/linux" },
                    ],
                },
                {
                    label: "Guides",
                    translations: { es: "Guías" },
                    items: [
                        { slug: "guides/databases" },
                        { slug: "guides/engines" },
                        { slug: "guides/analysis" },
                        { slug: "guides/training" },
                        { slug: "guides/studies" },
                        { slug: "guides/players" },
                        { slug: "guides/books" },
                        { slug: "guides/bots-and-tournaments" },
                        { slug: "guides/model-games" },
                    ],
                },
                {
                    label: "Resources",
                    translations: { es: "Recursos" },
                    items: [{ slug: "resources/free-resources" }],
                },
                {
                    label: "How it is built",
                    translations: { es: "Cómo está hecho" },
                    items: [{ slug: "technical/architecture" }, { slug: "technical/human-bots" }],
                },
                {
                    label: "Project",
                    translations: { es: "Proyecto" },
                    items: [
                        { slug: "project/privacy" },
                        { slug: "project/signing-policy" },
                        { slug: "project/credits" },
                    ],
                },
            ],
        }),
    ],
});
