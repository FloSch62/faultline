import { defineConfig } from "@playwright/test";

/**
 * FAULTLINE_BASE_URL   test an already running server instead of starting one
 * FAULTLINE_TEST_BUILD serve a production build (`vite preview`) instead of the dev server
 * FAULTLINE_DIST       production output directory to preview (default dist)
 * FAULTLINE_PORT       port for the server Playwright starts
 * FAULTLINE_NO_WATCH   dev server without HMR or file watching, so edits never reload a test page
 * VITE_BASE_PATH       public base path, e.g. /faultline/
 */
const externalURL = process.env.FAULTLINE_BASE_URL;
const production = process.env.FAULTLINE_TEST_BUILD === "true";
const port = Number(process.env.FAULTLINE_PORT) || (production ? 4174 : 5174);
const basePath = process.env.VITE_BASE_PATH || "/";
const baseURL = externalURL || `http://127.0.0.1:${port}${basePath}`;
const dist = process.env.FAULTLINE_DIST;
const devConfig = process.env.FAULTLINE_NO_WATCH === "true" ? " --config tests/vite.nowatch.config.ts" : "";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  // Tests draw a cheap 3D table (see helpers.ts), so several can share the CPU.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 8,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    headless: true,
    launchOptions: { args: ["--no-sandbox", "--enable-unsafe-swiftshader"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: externalURL
    ? undefined
    : {
        command: production
          ? `npx vite preview --host 127.0.0.1 --port ${port} --strictPort${dist ? ` --outDir ${dist}` : ""}`
          : `npx vite --host 127.0.0.1 --port ${port} --strictPort${devConfig}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
