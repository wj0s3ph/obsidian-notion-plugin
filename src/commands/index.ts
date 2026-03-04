import type { TFile } from "obsidian";

import { getStrings } from "../i18n";
import type NotionSyncPlugin from "../main";

export function registerCommands(plugin: NotionSyncPlugin): void {
	const strings = getStrings();

	plugin.addCommand({
		id: "sync-active-note-database",
		name: strings.commandSyncActiveNoteDatabase,
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!isMarkdownFile(file)) {
				return false;
			}

			if (!checking) {
				void plugin.syncActiveFile(true);
			}

			return true;
		},
	});

	plugin.addCommand({
		id: "pull-active-note-from-notion",
		name: strings.commandPullActiveNoteFromNotion,
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!isMarkdownFile(file)) {
				return false;
			}

			if (!checking) {
				void plugin.pullActiveFileFromNotion(true);
			}

			return true;
		},
	});
}

function isMarkdownFile(file: TFile | null): file is TFile {
	return Boolean(file && file.extension === "md");
}
