import { Notice, Plugin, type TFile } from "obsidian";

import { registerCommands } from "./commands";
import { getStrings } from "./i18n";
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
	private notionRepository: NotionApiRepository | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.notionRepository = this.createNotionRepository();
		this.syncService = this.createSyncService();
		const strings = getStrings();

		registerCommands(this);
		this.addRibbonIcon("refresh-cw", strings.ribbonSyncActiveNoteDatabase, () => {
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

	async fetchDatabaseProperties(profileId: string): Promise<string[]> {
		const strings = getStrings();
		if (!this.settings.notionToken.trim()) {
			throw new Error(strings.configureTokenFirst);
		}

		const profile = this.settings.databases.find((entry) => entry.id === profileId);
		if (!profile) {
			throw new Error(strings.selectedProfileUnavailable);
		}

		if (!profile.databaseId.trim()) {
			throw new Error(strings.enterDatabaseIdBeforeFetchingProperties);
		}

		const schema = await (this.notionRepository ?? this.createNotionRepository())
			.getDatabaseSchema(profile.databaseId);
		const notionProperties = Object.keys(schema).sort((left, right) => left.localeCompare(right));
		profile.notionProperties = notionProperties;
		await this.saveSettings();
		return notionProperties;
	}

	async syncActiveFile(notify: boolean): Promise<SyncSummary | null> {
		return this.runActiveFileAction(
			notify,
			"sync",
			(path, databaseId) => this.syncService?.syncFile(path, databaseId),
		);
	}

	async pullActiveFileFromNotion(notify: boolean): Promise<SyncSummary | null> {
		return this.runActiveFileAction(
			notify,
			"pull",
			(path, databaseId) => this.syncService?.pullFile(path, databaseId),
		);
	}

	private async runActiveFileAction(
		notify: boolean,
		action: "pull" | "sync",
		execute: (path: string, databaseId: string) => Promise<{ status: "success"; summary: SyncSummary; } | { status: "skipped"; message: string; reason: string; } | undefined> | undefined,
	): Promise<SyncSummary | null> {
		const strings = getStrings();
		if (!this.ensureTokenConfigured(notify) || !this.syncService) {
			return null;
		}

		const file = this.app.workspace.getActiveFile();
		if (!this.isMarkdownFile(file)) {
			if (notify) {
				new Notice(strings.openMarkdownNote);
			}
			return null;
		}

		const databases = this.getConfiguredDatabases();
		if (databases.length === 0) {
			if (notify) {
				new Notice(strings.noConfiguredDatabases);
			}
			return null;
		}

		try {
			const database = await this.selectDatabase(databases);
			if (!database) {
				return null;
			}

			const progressNotice = notify
				? new Notice(
					action === "pull"
						? strings.pullingInProgress(database.name || strings.selectedDatabaseFallback)
						: strings.syncingInProgress(database.name || strings.selectedDatabaseFallback),
					0,
				)
				: null;

			try {
				const result = await execute(file.path, database.id);
				if (!result) {
					return null;
				}
				if (result.status !== "success") {
					if (notify) {
						new Notice(result.message);
					}
					return null;
				}

				if (notify) {
					new Notice(this.formatSummary(
						action === "pull"
							? strings.pullSummary(database.name || strings.selectedDatabaseFallback)
							: strings.syncSummary(database.name || strings.selectedDatabaseFallback),
						result.summary,
					));
				}
				return result.summary;
			} finally {
				progressNotice?.hide();
			}
		} catch (error) {
			this.handleSyncError(
				error,
				action === "pull"
					? strings.failedToPull(file.path, this.describeDatabaseSelection(databases))
					: strings.failedToSync(file.path, this.describeDatabaseSelection(databases)),
				notify,
			);
			return null;
		}
	}

	protected createSyncService(): SyncService {
		return new SyncService({
			getSettings: () => this.settings,
			localRepository: new VaultDocumentRepository(this.app.vault),
			notionRepository: this.notionRepository ?? this.createNotionRepository(),
		});
	}

	protected createNotionRepository(): NotionApiRepository {
		return new NotionApiRepository(
			createNotionClientFactory(() => this.settings.notionToken),
		);
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
		const strings = getStrings();
		if (this.settings.notionToken.trim()) {
			return true;
		}

		if (notify) {
			new Notice(strings.configureTokenFirst);
		}
		return false;
	}

	private formatSummary(prefix: string, summary: SyncSummary): string {
		return getStrings().summary(
			prefix,
			summary.createdRemotePages,
			summary.createdLocalDocuments,
			summary.updatedRemotePages,
			summary.updatedLocalDocuments,
		);
	}

	private handleSyncError(error: unknown, message: string, notify: boolean): void {
		console.error(message, error);
		if (notify) {
			new Notice(this.describeSyncError(message, error));
		}
	}

	private describeDatabaseSelection(databases: DatabaseSyncSetting[]): string {
		const strings = getStrings();
		if (databases.length === 1) {
			const database = databases[0];
			return database?.name || database?.databaseId || strings.selectedDatabaseFallback;
		}

		return strings.selectedDatabaseFallback;
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
