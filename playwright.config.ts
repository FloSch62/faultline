import { defineConfig } from "@playwright/test";

const externalURL = process.env.FAULTLINE_BASE_URL;
const production = process.env.FAULTLINE_TEST_BUILD === "true";
const basePath = process.env.VITE_BASE_PATH || "/";
const baseURL =
  externalURL || `http://127.0.0.1:${production ? 4174 : 5174}${basePath}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
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
          ? "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort"
          : "npm run dev -- --strictPort",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
