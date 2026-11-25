/**
 * Shared text of the hand-built pages (navigation, footer, download). The landing page text is
 * in landing.ts. The documentation lives in
 * src/content/docs/<lang>/ and is translated page by page.
 */

export const LANGS = ["es", "en"] as const;
export type Lang = (typeof LANGS)[number];

export function otherLang(lang: Lang): Lang {
    return lang === "es" ? "en" : "es";
}

type Item = { title: string; text: string };

export type Dictionary = {
    meta: { title: string; description: string; downloadTitle: string; downloadDescription: string };
    nav: {
        features: string;
        docs: string;
        technical: string;
        download: string;
        menu: string;
        switchTo: string;
        switchToShort: string;
    };
    footer: {
        tagline: string;
        product: string;
        docs: string;
        project: string;
        links: Record<
            | "download"
            | "releases"
            | "features"
            | "introduction"
            | "firstSteps"
            | "install"
            | "resources"
            | "technical"
            | "privacy"
            | "signing"
            | "credits"
            | "source"
            | "issues",
            string
        >;
        license: string;
        fork: string;
    };
    download: {
        title: string;
        lead: string;
        leadUnknown: string;
        recommended: string;
        allPlatforms: string;
        mobile: string;
        unknown: string;
        button: string;
        guide: string;
        checksum: string;
        olderVersions: string;
        fallback: string;
        platforms: Record<
            "windows" | "macArm" | "macIntel" | "appImage" | "deb",
            { name: string; detail: string }
        >;
        notesTitle: string;
        notes: Item[];
        next: { title: string; text: string; link: string };
    };
};

export const ui: Record<Lang, Dictionary> = {
    es: {
        meta: {
            title: "Onyx Chess Lab — Tu laboratorio de ajedrez",
            description:
                "Software de ajedrez libre y gratuito para Windows, macOS y Linux: bases de datos, motores y análisis, con el entrenamiento y la preparación integrados.",
            downloadTitle: "Descargar Onyx Chess Lab",
            downloadDescription:
                "Descarga Onyx Chess Lab para Windows, macOS (Apple Silicon e Intel) o Linux. Gratis y de código abierto.",
        },
        nav: {
            features: "Funciones",
            docs: "Documentación",
            technical: "Cómo está hecho",
            download: "Descargar",
            menu: "Menú",
            switchTo: "Read in English",
            switchToShort: "EN",
        },
        footer: {
            tagline: "Software de ajedrez libre para estudiar, entrenar y prepararte.",
            product: "Producto",
            docs: "Documentación",
            project: "Proyecto",
            links: {
                download: "Descargar",
                releases: "Notas de versión",
                features: "Funciones",
                introduction: "Qué es Onyx",
                firstSteps: "Primeros pasos",
                install: "Instalación",
                resources: "Recursos gratuitos",
                technical: "Cómo está hecho",
                privacy: "Privacidad",
                signing: "Política de firma",
                credits: "Créditos y licencias",
                source: "Código fuente",
                issues: "Reportar un problema",
            },
            license: "Publicado bajo la licencia GPLv3.",
            fork: "Basado en",
        },
        download: {
            title: "Descargar Onyx Chess Lab",
            lead: "Versión {version}, publicada el {date}. Gratis y de código abierto.",
            leadUnknown: "Gratis y de código abierto, para Windows, macOS y Linux.",
            recommended: "Recomendado para tu sistema",
            allPlatforms: "Todas las plataformas",
            mobile: "Onyx es una aplicación de escritorio. Abre esta página en tu computadora para descargarla.",
            unknown: "Elige tu sistema en la lista.",
            button: "Descargar",
            guide: "Guía de instalación",
            checksum: "SHA-256",
            olderVersions: "Versiones anteriores y notas de cada versión",
            fallback: "Ver la última versión en GitHub",
            platforms: {
                windows: { name: "Windows", detail: "Windows 10 y 11, 64 bits · instalador" },
                macArm: { name: "macOS · Apple Silicon", detail: "Mac con M1 o posterior · .dmg" },
                macIntel: { name: "macOS · Intel", detail: "Mac con procesador Intel · .dmg" },
                appImage: { name: "Linux · AppImage", detail: "x64, cualquier distribución · recomendado" },
                deb: { name: "Linux · .deb", detail: "x64, Debian, Ubuntu y derivadas" },
            },
            notesTitle: "Antes de instalar",
            notes: [
                {
                    title: "Windows",
                    text: "El instalador aún no está firmado con un certificado de Windows, así que SmartScreen puede avisar la primera vez. La guía explica cómo continuar. Las actualizaciones dentro de la app sí van firmadas.",
                },
                {
                    title: "macOS",
                    text: "La app no está firmada por Apple. La primera vez hay que quitar la cuarentena con un comando de Terminal; la guía lo explica paso a paso.",
                },
                {
                    title: "¿Qué Mac tengo?",
                    text: "Menú Apple → Acerca de esta Mac. Si dice «Chip Apple M…», descarga Apple Silicon; si dice «Procesador Intel», descarga Intel.",
                },
            ],
            next: {
                title: "Después de instalar",
                text: "Al abrir Onyx, la guía de primeros pasos instala los motores, te ayuda a añadir una base de partidas y a descargar puzzles.",
                link: "Leer la guía de primeros pasos",
            },
        },
    },
    en: {
        meta: {
            title: "Onyx Chess Lab — Your chess lab",
            description:
                "Free, open-source chess software for Windows, macOS and Linux: databases, engines and analysis, with training and preparation built in.",
            downloadTitle: "Download Onyx Chess Lab",
            downloadDescription:
                "Download Onyx Chess Lab for Windows, macOS (Apple Silicon and Intel) or Linux. Free and open source.",
        },
        nav: {
            features: "Features",
            docs: "Documentation",
            technical: "How it is built",
            download: "Download",
            menu: "Menu",
            switchTo: "Leer en español",
            switchToShort: "ES",
        },
        footer: {
            tagline: "Free chess software to study, train and prepare.",
            product: "Product",
            docs: "Documentation",
            project: "Project",
            links: {
                download: "Download",
                releases: "Release notes",
                features: "Features",
                introduction: "What is Onyx",
                firstSteps: "First steps",
                install: "Installation",
                resources: "Free resources",
                technical: "How it is built",
                privacy: "Privacy",
                signing: "Signing policy",
                credits: "Credits and licences",
                source: "Source code",
                issues: "Report an issue",
            },
            license: "Released under the GPLv3 license.",
            fork: "Based on",
        },
        download: {
            title: "Download Onyx Chess Lab",
            lead: "Version {version}, released {date}. Free and open source.",
            leadUnknown: "Free and open source, for Windows, macOS and Linux.",
            recommended: "Recommended for your system",
            allPlatforms: "All platforms",
            mobile: "Onyx is a desktop application. Open this page on your computer to download it.",
            unknown: "Choose your system from the list.",
            button: "Download",
            guide: "Installation guide",
            checksum: "SHA-256",
            olderVersions: "Older versions and the notes for each release",
            fallback: "See the latest release on GitHub",
            platforms: {
                windows: { name: "Windows", detail: "Windows 10 and 11, 64-bit · installer" },
                macArm: { name: "macOS · Apple Silicon", detail: "Macs with M1 or later · .dmg" },
                macIntel: { name: "macOS · Intel", detail: "Macs with an Intel processor · .dmg" },
                appImage: { name: "Linux · AppImage", detail: "x64, any distribution · recommended" },
                deb: { name: "Linux · .deb", detail: "x64, Debian, Ubuntu and derivatives" },
            },
            notesTitle: "Before you install",
            notes: [
                {
                    title: "Windows",
                    text: "The installer is not yet signed with a Windows certificate, so SmartScreen may warn you the first time. The guide shows how to continue. In-app updates are signed.",
                },
                {
                    title: "macOS",
                    text: "The app is not signed by Apple. The first time, remove the quarantine flag with one Terminal command; the guide walks you through it.",
                },
                {
                    title: "Which Mac do I have?",
                    text: "Apple menu → About This Mac. If it says “Chip Apple M…”, download Apple Silicon; if it says “Processor Intel”, download Intel.",
                },
            ],
            next: {
                title: "After installing",
                text: "When Onyx opens, the first-steps guide installs the engines and helps you add a games database and download puzzles.",
                link: "Read the first-steps guide",
            },
        },
    },
};

/** Prefix a site path with the base path (`/onyx-chess-lab`). */
export function url(path: string) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}/${path.replace(/^\//, "")}`;
}
