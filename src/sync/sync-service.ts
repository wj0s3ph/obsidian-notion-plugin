import type { DatabaseSyncSetting, NotionSyncPluginSettings } from "../settings";
import type { LocalDocumentRepository, NotionRepository, SyncSummary } from "./engine";
import { pullRemoteDatabaseFile, syncDatabaseFile } from "./engine";

export interface SyncServiceOptions {
	getSettings: () => NotionSyncPluginSettings;
	localRepository: LocalDocumentRepository;
	notionRepository: NotionRepository;
}

export type SyncFileSkipReason =
	| "document-not-found"
	| "note-not-linked"
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
		return this.run(path, profileId, (profile) => syncDatabaseFile(profile, path, {
			localRepository: this.options.localRepository,
			notionRepository: this.options.notionRepository,
		}));
	}

	async pullFile(path: string, profileId: string): Promise<SyncFileResult> {
		const document = await this.options.localRepository.readDocument(path);
		if (!document) {
			return {
				message: "Active Markdown note could not be read from the vault.",
				reason: "document-not-found",
				status: "skipped",
			};
		}

		return this.run(path, profileId, (profile) => {
			const pageId = document.frontmatter[profile.notionPageIdField];
			if (typeof pageId !== "string" || !pageId.trim()) {
				return Promise.resolve({
					createdLocalDocuments: 0,
					createdRemotePages: 0,
					skipped: 1,
					updatedLocalDocuments: 0,
					updatedRemotePages: 0,
				} satisfies SyncSummary);
			}

			return pullRemoteDatabaseFile(profile, path, {
				localRepository: this.options.localRepository,
				notionRepository: this.options.notionRepository,
			});
		}, {
			skippedMessage: "Link this note to a Notion page before pulling from Notion.",
			skippedReason: "note-not-linked",
		});
	}

	private async run(
		path: string,
		profileId: string,
		execute: (profile: DatabaseSyncSetting) => Promise<SyncSummary>,
		skippedResult: {
			skippedMessage: string;
			skippedReason: SyncFileSkipReason;
		} = {
			skippedMessage: "Active Markdown note could not be read from the vault.",
			skippedReason: "document-not-found",
		},
	): Promise<SyncFileResult> {
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

		const summary = await execute(profile);
		if (summary.skipped > 0 && summary.createdLocalDocuments === 0 && summary.createdRemotePages === 0 && summary.updatedLocalDocuments === 0 && summary.updatedRemotePages === 0) {
			return {
				message: skippedResult.skippedMessage,
				reason: skippedResult.skippedReason,
				status: "skipped",
			};
		}

		return {
			status: "success",
			summary,
		};
	}

	private getConfiguredProfiles(): DatabaseSyncSetting[] {
		const settings = this.options.getSettings();
		return settings.databases.filter((profile) => profile.databaseId.trim());
	}
}
