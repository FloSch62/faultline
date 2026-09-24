import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        playground: fileURLToPath(new URL("./dev/index.html", import.meta.url)),
      },
    },
  },
  plugins: [
    {
      name: "distribution-licenses",
      generateBundle() {
        for (const [source, filename] of [
          ["LICENSE", "LICENSE.txt"],
          ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.txt"],
          ["node_modules/three/LICENSE", "licenses/three-LICENSE.txt"],
        ]) {
          this.emitFile({
            type: "asset",
            fileName: filename,
            source: readFileSync(new URL(source, import.meta.url), "utf8"),
          });
        }
      },
    },
  ],
});
