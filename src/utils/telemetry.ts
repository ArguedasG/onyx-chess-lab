import { getVersion } from "@tauri-apps/api/app";
import { warn } from "@tauri-apps/plugin-log";
import posthog from "posthog-js";

let initialized = false;

export async function enableTelemetry(): Promise<void> {
    try {
        if (!initialized) {
            posthog.init("phc_kgEBtifs0EgWlrl4ROYEbnsQ1b7BS2W5BKLNyXe7f8z", {
                api_host: "https://app.posthog.com",
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: true,
                disable_surveys: true,
                disable_external_dependency_loading: true,
                advanced_disable_feature_flags: true,
            });
            initialized = true;
        }

        posthog.opt_in_capturing();
        posthog.capture("app_started", { version: await getVersion() });
    } catch (error) {
        warn(`Could not enable telemetry: ${error}`);
    }
}

export function disableTelemetry(): void {
    if (initialized) posthog.opt_out_capturing();
}
