import { FuzzySuggestModal, type App } from "obsidian";

import { getStrings } from "../i18n";
import type { DatabaseSyncSetting } from "../settings";

export function chooseDatabase(
	app: App,
	databases: DatabaseSyncSetting[],
): Promise<DatabaseSyncSetting | null> {
	return new Promise((resolve) => {
		new DatabaseSelectionModal(app, databases, resolve).open();
	});
}

class DatabaseSelectionModal extends FuzzySuggestModal<DatabaseSyncSetting> {
	private resolved = false;

	constructor(
		app: App,
		private readonly databases: DatabaseSyncSetting[],
		private readonly onResolve: (database: DatabaseSyncSetting | null) => void,
	) {
		super(app);
		this.setPlaceholder(getStrings().selectDatabasePlaceholder);
	}

	getItems(): DatabaseSyncSetting[] {
		return this.databases;
	}

	getItemText(item: DatabaseSyncSetting): string {
		return item.name || item.databaseId;
	}

	onChooseItem(item: DatabaseSyncSetting): void {
		this.resolved = true;
		this.onResolve(item);
	}

	onClose(): void {
		super.onClose();
		if (!this.resolved) {
			this.onResolve(null);
		}
	}
}
