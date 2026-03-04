import type { DatabaseSyncSetting, NotionSyncPluginSettings } from "../settings";
import type { LocalDocumentRepository, NotionRepository, SyncSummary } from "./engine";
import { syncDatabaseFile } from "./engine";

export interface SyncServiceOptions {
	getSettings: () => NotionSyncPluginSettings;
	localRepository: LocalDocumentRepository;
	notionRepository: NotionRepository;
}

export type SyncFileSkipReason =
	| "document-not-found"
	| "profile-not-found"
	| "token-missing";

export type SyncFileResult =
	| {
		status: "success";
		summary: SyncSummary;
	}
	| {
		message: string;
		reason: SyncFileSkipReason;
		status: "skipped";
	};

export class SyncService {
	constructor(private readonly options: SyncServiceOptions) {}

	async syncFile(path: string, profileId: string): Promise<SyncFileResult> {
		if (!this.options.getSettings().notionToken.trim()) {
			return {
				message: "Configure a Notion integration token in plugin settings first.",
				reason: "token-missing",
				status: "skipped",
			};
		}

		const profile = this.getConfiguredProfiles().find((entry) => entry.id === profileId);
		if (!profile) {
			return {
				message: "Selected Notion database profile is not available.",
				reason: "profile-not-found",
				status: "skipped",
			};
		}

		const document = await this.options.localRepository.readDocument(path);
		if (!document) {
			return {
				message: "Active Markdown note could not be read from the vault.",
				reason: "document-not-found",
				status: "skipped",
			};
		}

		return {
			status: "success",
			summary: await syncDatabaseFile(profile, path, {
				localRepository: this.options.localRepository,
				notionRepository: this.options.notionRepository,
			}),
		};
	}

	private getConfiguredProfiles(): DatabaseSyncSetting[] {
		const settings = this.options.getSettings();
		return settings.databases.filter((profile) => profile.databaseId.trim());
	}
}
