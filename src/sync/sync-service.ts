import type { DatabaseSyncSetting, NotionSyncPluginSettings } from "../settings";
import type { LocalDocumentRepository, NotionRepository, SyncSummary } from "./engine";
import { syncDatabaseProfiles } from "./engine";

export interface SyncServiceOptions {
	getSettings: () => NotionSyncPluginSettings;
	localRepository: LocalDocumentRepository;
	notionRepository: NotionRepository;
	now?: () => number;
}

export class SyncService {
	private readonly getCurrentTime: () => number;

	private readonly lastSyncedAtByProfileId = new Map<string, number>();

	constructor(private readonly options: SyncServiceOptions) {
		this.getCurrentTime = options.now ?? Date.now;
	}

	async syncAll(): Promise<SyncSummary> {
		const profiles = this.getEnabledProfiles();
		const summary = await this.syncProfiles(profiles);
		this.markProfilesSynced(profiles);
		return summary;
	}

	async syncDueProfiles(): Promise<SyncSummary> {
		const now = this.getCurrentTime();
		const profiles = this.getEnabledProfiles().filter((profile) => {
			const lastSyncedAt = this.lastSyncedAtByProfileId.get(profile.id);
			if (lastSyncedAt === undefined) {
				return true;
			}

			return now - lastSyncedAt >= profile.syncIntervalSeconds * 1000;
		});

		const summary = await this.syncProfiles(profiles);
		this.markProfilesSynced(profiles, now);
		return summary;
	}

	async syncFile(path: string): Promise<SyncSummary | null> {
		const profiles = this.getEnabledProfiles().filter((profile) => matchesProfileFolder(profile, path));
		if (profiles.length === 0) {
			return null;
		}

		const summary = await this.syncProfiles(profiles);
		this.markProfilesSynced(profiles);
		return summary;
	}

	private getEnabledProfiles(): DatabaseSyncSetting[] {
		const settings = this.options.getSettings();
		if (!settings.notionToken.trim()) {
			return [];
		}

		return settings.databases.filter((profile) => profile.enabled);
	}

	private markProfilesSynced(profiles: DatabaseSyncSetting[], timestamp = this.getCurrentTime()): void {
		for (const profile of profiles) {
			this.lastSyncedAtByProfileId.set(profile.id, timestamp);
		}
	}

	private syncProfiles(profiles: DatabaseSyncSetting[]): Promise<SyncSummary> {
		return syncDatabaseProfiles(profiles, {
			localRepository: this.options.localRepository,
			notionRepository: this.options.notionRepository,
		});
	}
}

function matchesProfileFolder(profile: DatabaseSyncSetting, path: string): boolean {
	if (!profile.folder) {
		return false;
	}

	return path === profile.folder || path.startsWith(`${profile.folder}/`);
}
