import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Einzeldatei-Build nach dist-single/.
 * Ergebnis ist eine einzige index.html mit inline eingebettetem JS und CSS,
 * die per Doppelklick von der Festplatte läuft – ohne Server, ohne Netz.
 */
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist-single",
    emptyOutDir: true,
    target: "es2022",
  },
});
