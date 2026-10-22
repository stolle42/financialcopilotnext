import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs only the model check, which asks OpenAI with the owner's key, so it stays out of npm test
// and CI (R-32). Vitest resolves `@/` as the app's tests do.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["scripts/check-models.ts"],
  },
});
