import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
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
