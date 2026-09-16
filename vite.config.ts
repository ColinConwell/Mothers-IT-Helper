import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    middlewareMode: true,
    watch: {
      ignored: ["**/context/**", "**/playwright-report/**", "**/test-results/**", "**/data/**"],
    },
  },
  appType: "custom",
});
