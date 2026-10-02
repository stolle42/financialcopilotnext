import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset URLs let the build load from any path or from local files (R-20).
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Browsers keep data per origin, so a silently moved port would open the app empty (R-20).
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Domain and store tests run in Node; the browser is Playwright's job (R-17).
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
