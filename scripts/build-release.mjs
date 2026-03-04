import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
	getReleaseArchiveName,
	getReleaseAssetNames,
	RELEASE_DIR,
	validateReleaseManifest,
} from "./release-lib.mjs";

const rootDir = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const manifestPath = path.join(rootDir, "manifest.json");
const manifest = validateReleaseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));

execFileSync(npmCommand, ["run", "build"], {
	cwd: rootDir,
	stdio: "inherit",
});

const releaseDir = path.join(rootDir, RELEASE_DIR);
rmSync(releaseDir, { force: true, recursive: true });
mkdirSync(releaseDir, { recursive: true });

const assetNames = getReleaseAssetNames({
	hasStyles: existsSync(path.join(rootDir, "styles.css")),
});

for (const assetName of assetNames) {
	const sourcePath = path.join(rootDir, assetName);
	if (!existsSync(sourcePath)) {
		throw new Error(`Missing release asset: ${assetName}`);
	}

	copyFileSync(sourcePath, path.join(releaseDir, assetName));
}

const archiveName = getReleaseArchiveName(manifest);
createReleaseArchive({
	archiveName,
	assetNames,
	releaseDir,
});

console.log(`Prepared GitHub release assets for ${manifest.id}@${manifest.version} in ${RELEASE_DIR}/`);

/**
 * @param {{ archiveName: string; assetNames: string[]; releaseDir: string }} options
 * @returns {void}
 */
function createReleaseArchive({ archiveName, assetNames, releaseDir }) {
	if (process.platform === "win32") {
		const quotedAssets = assetNames.map((assetName) => `'${assetName}'`).join(", ");
		const command = `Compress-Archive -Path ${quotedAssets} -DestinationPath '${archiveName}' -Force`;
		execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", command], {
			cwd: releaseDir,
			stdio: "inherit",
		});
		return;
	}

	execFileSync("zip", ["-q", archiveName, ...assetNames], {
		cwd: releaseDir,
		stdio: "inherit",
	});
}
