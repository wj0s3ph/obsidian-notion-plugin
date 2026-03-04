import { Notice, Plugin, TFile } from "obsidian";

import { registerCommands } from "./commands";
import { createNotionClientFactory, NotionApiRepository } from "./notion/notion-api-repository";
import { VaultDocumentRepository } from "./obsidian/vault-document-repository";
import {
	coercePersistedSettings,
	DEFAULT_SETTINGS,
	type NotionSyncPluginSettings,
	normalizeSettings,
} from "./settings";
import { type SyncSummary } from "./sync/engine";
import { SyncService } from "./sync/sync-service";
import { NotionSyncSettingTab } from "./ui/settings-tab";

export default class NotionSyncPlugin extends Plugin {
	settings: NotionSyncPluginSettings = DEFAULT_SETTINGS;

	private readonly pendingFileSyncs = new Map<string, number>();

	private syncService: SyncService | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.syncService = new SyncService({
			getSettings: () => this.settings,
			localRepository: new VaultDocumentRepository(this.app.vault),
			notionRepository: new NotionApiRepository(
				createNotionClientFactory(() => this.settings.notionToken),
			),
		});

		registerCommands(this);
		this.addSettingTab(new NotionSyncSettingTab(this.app, this));
		this.registerEvent(this.app.vault.on("create", (file) => {
			if (file instanceof TFile) {
				this.handleVaultChange(file);
			}
		}));
		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (file instanceof TFile) {
				this.handleVaultChange(file);
			}
		}));
		this.registerInterval(window.setInterval(() => {
			void this.syncDueProfiles();
		}, 30_000));

		if (this.settings.syncOnStartup) {
			void this.syncAllDatabases(false);
		}
	}

	async loadSettings(): Promise<void> {
		const persistedSettings: unknown = await this.loadData();
		this.settings = normalizeSettings(coercePersistedSettings(persistedSettings));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onunload(): void {
		for (const timeout of this.pendingFileSyncs.values()) {
			window.clearTimeout(timeout);
		}

		this.pendingFileSyncs.clear();
	}

	async syncAllDatabases(notify: boolean): Promise<SyncSummary | null> {
		if (!this.ensureTokenConfigured(notify) || !this.syncService) {
			return null;
		}

		try {
			const summary = await this.syncService.syncAll();
			if (notify) {
				new Notice(this.formatSummary("Synced databases", summary));
			}
			return summary;
		} catch (error) {
			this.handleSyncError(error, "Failed to sync all databases", notify);
			return null;
		}
	}

	async syncFilePath(path: string, notify: boolean): Promise<SyncSummary | null> {
		if (!this.ensureTokenConfigured(notify) || !this.syncService) {
			return null;
		}

		try {
			const summary = await this.syncService.syncFile(path);
			if (!summary) {
				if (notify) {
					new Notice("No matching sync profile for the active note.");
				}
				return null;
			}

			if (notify) {
				new Notice(this.formatSummary("Synced note profile", summary));
			}
			return summary;
		} catch (error) {
			this.handleSyncError(error, `Failed to sync ${path}`, notify);
			return null;
		}
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
			new Notice(message);
		}
	}

	private handleVaultChange(file: TFile): void {
		if (file.extension !== "md") {
			return;
		}

		const existingTimeout = this.pendingFileSyncs.get(file.path);
		if (existingTimeout !== undefined) {
			window.clearTimeout(existingTimeout);
		}

		const timeout = window.setTimeout(() => {
			this.pendingFileSyncs.delete(file.path);
			void this.syncFilePath(file.path, false);
		}, 1000);

		this.pendingFileSyncs.set(file.path, timeout);
	}

	private async syncDueProfiles(): Promise<void> {
		if (!this.ensureTokenConfigured(false) || !this.syncService) {
			return;
		}

		try {
			await this.syncService.syncDueProfiles();
		} catch (error) {
			this.handleSyncError(error, "Background sync failed", false);
		}
	}
}
