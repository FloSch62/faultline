import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// A dev server for long browser runs: no HMR and no file watching, so concurrent
// edits never reload a page in the middle of a test or a scripted expedition.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  base: process.env.VITE_BASE_PATH || "/",
  server: { hmr: false, watch: { ignored: ["**/*"] } },
});
