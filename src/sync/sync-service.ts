import type { DatabaseSyncSetting, NotionSyncPluginSettings } from "../settings";
import type { LocalDocumentRepository, NotionRepository, SyncSummary } from "./engine";
import { syncDatabaseFile } from "./engine";

export interface SyncServiceOptions {
	getSettings: () => NotionSyncPluginSettings;
	localRepository: LocalDocumentRepository;
	notionRepository: NotionRepository;
}

export class SyncService {
	constructor(private readonly options: SyncServiceOptions) {}

	async syncFile(path: string, profileId: string): Promise<SyncSummary | null> {
		const profile = this.getConfiguredProfiles().find((entry) => entry.id === profileId);
		if (!profile) {
			return null;
		}

		const document = await this.options.localRepository.readDocument(path);
		if (!document) {
			return null;
		}

		return syncDatabaseFile(profile, path, {
			localRepository: this.options.localRepository,
			notionRepository: this.options.notionRepository,
		});
	}

	private getConfiguredProfiles(): DatabaseSyncSetting[] {
		const settings = this.options.getSettings();
		if (!settings.notionToken.trim()) {
			return [];
		}

		return settings.databases.filter((profile) => profile.databaseId.trim());
	}
}
