// The path of the route that the local server adds for the AI features, the app's one copy of it
// (contracts/ai.md, route). It imports nothing, because Vite bundles its config, which reads it
// too, without the `@/` alias (R-24).
export const AI_PATH = "/api/ai";
