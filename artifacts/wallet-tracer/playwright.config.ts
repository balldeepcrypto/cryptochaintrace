import { defineConfig, devices } from "@playwright/test";

// Dedicated local server: never reuse a signed-in developer's browser/profile
// or depend on the API, Supabase, real wallet histories, or workspace secrets.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: "../../generated-artifacts/cluster-webkit",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4179",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "webkit-ipad",
    use: { ...devices["iPad Pro 11"], browserName: "webkit", viewport: { width: 820, height: 1180 } },
  }],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4179",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    env: {
      PORT: "4179",
      BASE_PATH: "/",
      // Public dummy SDK configuration; all non-local requests are blocked.
      VITE_SUPABASE_URL: "https://fixture.invalid",
      VITE_SUPABASE_ANON_KEY: "fixture-anon-key",
    },
  },
});
