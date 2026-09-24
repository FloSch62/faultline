import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// A dev server for long browser runs: no HMR and no file watching, so concurrent
// edits never reload a page in the middle of a test or a scripted expedition.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  base: process.env.VITE_BASE_PATH || "/",
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { hmr: false, watch: { ignored: ["**/*"] } },
});
