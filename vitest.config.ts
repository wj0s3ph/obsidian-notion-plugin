import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			all: true,
			exclude: [
				"main.js",
				"src/**/*.test.ts",
				"src/main.ts",
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
