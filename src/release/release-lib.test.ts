import { describe, expect, it } from "vitest";

import {
	getReleaseArchiveName,
	getReleaseAssetNames,
	RELEASE_DIR,
	validateReleaseManifest,
} from "../../scripts/release-lib.mjs";

describe("release-lib", () => {
	it("returns the GitHub release asset list with optional styles", () => {
		expect(getReleaseAssetNames({ hasStyles: true })).toEqual([
			"main.js",
			"manifest.json",
			"styles.css",
		]);
		expect(getReleaseAssetNames({ hasStyles: false })).toEqual([
			"main.js",
			"manifest.json",
		]);
		expect(RELEASE_DIR).toBe("release");
	});

	it("builds a versioned zip archive name for release assets", () => {
		expect(getReleaseArchiveName({
			id: "obsidian-notion-plugin",
			version: "1.0.0",
		})).toBe("obsidian-notion-plugin-1.0.0.zip");
	});

	it("validates manifest release metadata", () => {
		expect(validateReleaseManifest({
			id: "obsidian-notion-plugin",
			version: "1.2.3",
		})).toEqual({
			id: "obsidian-notion-plugin",
			version: "1.2.3",
		});

		expect(() => validateReleaseManifest({ id: "", version: "1.2.3" })).toThrow(
			"manifest.json must include a non-empty id",
		);
		expect(() => validateReleaseManifest({ id: "plugin", version: "" })).toThrow(
			"manifest.json must include a non-empty version",
		);
	});
});
