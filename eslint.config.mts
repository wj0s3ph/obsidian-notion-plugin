import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		files: [
			"src/**/*.{ts,js,mts,mjs,cts,cjs}",
			"vitest.config.ts",
			"eslint.config.mts",
		],
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mts",
						"vitest.config.ts",
					]
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	...obsidianmd.configs.recommended,
	globalIgnores([
		"**/*.json",
		"node_modules",
		"dist",
		"coverage",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"test-support",
	]),
);
