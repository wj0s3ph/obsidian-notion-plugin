export const RELEASE_DIR = "release";

/**
 * @param {{ hasStyles: boolean }} options
 * @returns {string[]}
 */
export function getReleaseAssetNames({ hasStyles }) {
	return [
		"main.js",
		"manifest.json",
		...(hasStyles ? ["styles.css"] : []),
	];
}

/**
 * @param {{ id: string; version: string }} manifest
 * @returns {string}
 */
export function getReleaseArchiveName(manifest) {
	return `${manifest.id}-${manifest.version}.zip`;
}

/**
 * @param {unknown} manifest
 * @returns {{ id: string; version: string }}
 */
export function validateReleaseManifest(manifest) {
	if (!manifest || typeof manifest !== "object") {
		throw new Error("manifest.json must be a JSON object");
	}

	if (typeof manifest.id !== "string" || !manifest.id.trim()) {
		throw new Error("manifest.json must include a non-empty id");
	}

	if (typeof manifest.version !== "string" || !manifest.version.trim()) {
		throw new Error("manifest.json must include a non-empty version");
	}

	return manifest;
}
