import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const typedFiles = ["frontend/src/**/*.{ts,tsx}", "vite.config.ts"];

export default tseslint.config(
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            ".venv/**",
            ".git/**",
            ".fontconfig-cache/**",
            ".mplconfig/**",
            "tsconfig.tsbuildinfo",
        ],
    },
    {
        files: ["eslint.config.mjs"],
        ...js.configs.recommended,
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    ...tseslint.configs.strictTypeChecked.map((config) => ({
        ...config,
        files: typedFiles,
    })),
    ...tseslint.configs.stylisticTypeChecked.map((config) => ({
        ...config,
        files: typedFiles,
    })),
    {
        files: typedFiles,
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.eslint.json",
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.browser,
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "@typescript-eslint/consistent-type-definitions": ["error", "type"],
            "@typescript-eslint/no-confusing-void-expression": "off",
            "@typescript-eslint/no-misused-promises": [
                "error",
                {
                    checksVoidReturn: {
                        attributes: false,
                    },
                },
            ],
        },
    },
    {
        files: ["vite.config.ts"],
        rules: {
            "@typescript-eslint/no-unsafe-call": "off",
        },
    },
);
