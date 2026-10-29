import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

// This suite proves UI behavior against intercepted requests, not durability/RLS.
export default defineConfig({
    ...config,
    testDir: "./tests/local",
    projects: [{ name: "local", testDir: "./tests/local", use: { ...devices["Desktop Chrome"] } }],
    use: { ...config.use, baseURL: "http://127.0.0.1:4173" },
    webServer: {
        command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            VITE_SUPABASE_URL: "https://people-test.supabase.co",
            VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test",
        },
    },
});
