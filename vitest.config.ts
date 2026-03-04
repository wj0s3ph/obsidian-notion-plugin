import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: new URL("./test-support/obsidian-runtime-stub.ts", import.meta.url).pathname,
		},
	},
	test: {
		coverage: {
			all: true,
			exclude: [
				"main.js",
				"src/**/*.test.ts",
				"src/main.ts",
				"test-support/**",
			],
			provider: "v8",
			thresholds: {
				branches: 70,
				functions: 70,
				lines: 70,
				statements: 70,
			},
		},
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
