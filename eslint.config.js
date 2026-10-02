import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const clockMessage = "The domain never reads the clock: take today's date as an argument (R-05).";

export default defineConfig([
  globalIgnores([
    "dist/",
    "coverage/",
    "test-results/",
    "playwright-report/",
    "blob-report/",
    "tmp/",
  ]),
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
  {
    // Only src/ holds React code; Playwright's fixture `use()` would read as React's `use` hook.
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Business rules stay pure: no browser globals and no clock (constitution V, R-16).
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "location",
        "indexedDB",
        "localStorage",
        "sessionStorage",
        "fetch",
        "XMLHttpRequest",
        "crypto",
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: clockMessage,
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: clockMessage,
        },
      ],
    },
  },
]);
