import { defineConfig } from "i18next-cli";

import config from "./i18next.config";

// Reference catalogs stay complete; the remaining locales intentionally rely on fallback values.
export default defineConfig({
    ...config,
    locales: ["en-US", "es-ES"],
    extract: {
        ...config.extract,
        disablePlurals: true,
        removeUnusedKeys: false,
        sort: false,
    },
});
