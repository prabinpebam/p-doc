import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The renderer: React and TipTap in a sandboxed page with no Node.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../out/renderer", emptyOutDir: true, target: "chrome140", sourcemap: true, chunkSizeWarningLimit: 4000 },
});
