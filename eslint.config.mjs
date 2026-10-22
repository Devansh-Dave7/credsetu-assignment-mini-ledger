import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.expo/**",
      "**/coverage/**",
      ".local/**",
      "artifacts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        fetch: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        __DEV__: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
);
