import type { TFile } from "obsidian";

import type NotionSyncPlugin from "../main";

export function registerCommands(plugin: NotionSyncPlugin): void {
	plugin.addCommand({
		id: "sync-active-note-database",
		name: "Sync active note database",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!isMarkdownFile(file)) {
				return false;
			}

			if (!checking) {
				void plugin.syncFilePath(file.path, true);
			}

			return true;
		},
	});

	plugin.addCommand({
		id: "sync-all-configured-databases",
		name: "Sync all configured databases",
		callback: () => {
			void plugin.syncAllDatabases(true);
		},
	});
}

function isMarkdownFile(file: TFile | null): file is TFile {
	return Boolean(file && file.extension === "md");
}
