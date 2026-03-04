import { Notice, Plugin, type TFile } from "obsidian";

import { registerCommands } from "./commands";
import { createNotionClientFactory, NotionApiRepository } from "./notion/notion-api-repository";
import { VaultDocumentRepository } from "./obsidian/vault-document-repository";
import {
	coercePersistedSettings,
	DEFAULT_SETTINGS,
	type DatabaseSyncSetting,
	type NotionSyncPluginSettings,
	normalizeSettings,
} from "./settings";
import { type SyncSummary } from "./sync/engine";
import { SyncService } from "./sync/sync-service";
import { chooseDatabase } from "./ui/database-selection-modal";
import { NotionSyncSettingTab } from "./ui/settings-tab";

export default class NotionSyncPlugin extends Plugin {
	settings: NotionSyncPluginSettings = DEFAULT_SETTINGS;

	private syncService: SyncService | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.syncService = this.createSyncService();

		registerCommands(this);
		this.addRibbonIcon("refresh-cw", "Sync active note database", () => {
			void this.syncActiveFile(true);
		});
		this.addSettingTab(new NotionSyncSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const persistedSettings: unknown = await this.loadData();
		this.settings = normalizeSettings(coercePersistedSettings(persistedSettings));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async syncActiveFile(notify: boolean): Promise<SyncSummary | null> {
		if (!this.ensureTokenConfigured(notify) || !this.syncService) {
			return null;
		}

		const file = this.app.workspace.getActiveFile();
		if (!this.isMarkdownFile(file)) {
			if (notify) {
				new Notice("Open a Markdown note to sync.");
			}
			return null;
		}

		const databases = this.getConfiguredDatabases();
		if (databases.length === 0) {
			if (notify) {
				new Notice("Add at least one Notion database in plugin settings first.");
			}
			return null;
		}

		try {
			const database = await this.selectDatabase(databases);
			if (!database) {
				return null;
			}

			const result = await this.syncService.syncFile(file.path, database.id);
			if (result.status !== "success") {
				if (notify) {
					new Notice(result.message);
				}
				return null;
			}

			if (notify) {
				new Notice(this.formatSummary(`Synced ${database.name || "database"}`, result.summary));
			}
			return result.summary;
		} catch (error) {
			this.handleSyncError(
				error,
				`Failed to sync ${file.path} with ${this.describeDatabaseSelection(databases)}`,
				notify,
			);
			return null;
		}
	}

	protected createSyncService(): SyncService {
		return new SyncService({
			getSettings: () => this.settings,
			localRepository: new VaultDocumentRepository(this.app.vault),
			notionRepository: new NotionApiRepository(
				createNotionClientFactory(() => this.settings.notionToken),
			),
		});
	}

	protected chooseDatabase(databases: DatabaseSyncSetting[]): Promise<DatabaseSyncSetting | null> {
		return chooseDatabase(this.app, databases);
	}

	private async selectDatabase(
		databases: DatabaseSyncSetting[],
	): Promise<DatabaseSyncSetting | null> {
		if (databases.length === 1) {
			return databases[0] ?? null;
		}

		return this.chooseDatabase(databases);
	}

	private ensureTokenConfigured(notify: boolean): boolean {
		if (this.settings.notionToken.trim()) {
			return true;
		}

		if (notify) {
			new Notice("Configure a Notion integration token in plugin settings first.");
		}
		return false;
	}

	private formatSummary(prefix: string, summary: SyncSummary): string {
		return `${prefix}: +${summary.createdRemotePages} remote, +${summary.createdLocalDocuments} local, `
			+ `~${summary.updatedRemotePages} remote, ~${summary.updatedLocalDocuments} local.`;
	}

	private handleSyncError(error: unknown, message: string, notify: boolean): void {
		console.error(message, error);
		if (notify) {
			new Notice(this.describeSyncError(message, error));
		}
	}

	private describeDatabaseSelection(databases: DatabaseSyncSetting[]): string {
		if (databases.length === 1) {
			const database = databases[0];
			return database?.name || database?.databaseId || "selected database";
		}

		return "selected database";
	}

	private describeSyncError(message: string, error: unknown): string {
		if (error instanceof Error && error.message.trim()) {
			return `${message}: ${error.message}`;
		}

		return message;
	}

	private getConfiguredDatabases(): DatabaseSyncSetting[] {
		return this.settings.databases.filter((database) => database.databaseId.trim());
	}

	private isMarkdownFile(file: TFile | null): file is TFile {
		return Boolean(file && file.extension === "md");
	}
}
