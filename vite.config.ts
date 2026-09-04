import { defineConfig } from "vite";

/**
 * Normaler Build nach dist/ – für GitHub Pages.
 * base: "./" erzeugt relative Asset-Pfade, damit die App auch in einem
 * Unterverzeichnis (username.github.io/bauapp/) lädt.
 */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
