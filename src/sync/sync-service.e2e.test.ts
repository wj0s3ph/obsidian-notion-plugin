import { describe, expect, it } from "vitest";

import type { DatabaseSyncSetting, NotionSyncPluginSettings } from "../settings";
import { createDefaultDatabaseConfig, normalizeSettings } from "../settings";
import type {
	LocalDocument,
	LocalDocumentRepository,
	NotionDatabaseSnapshot,
	NotionPage,
	NotionRepository,
} from "./engine";
import { SyncService } from "./sync-service";

class MemoryLocalRepository implements LocalDocumentRepository {
	constructor(private readonly documents: LocalDocument[]) {}

	async listDocuments(folder: string): Promise<LocalDocument[]> {
		return this.documents
			.filter((document) => document.path.startsWith(`${folder}/`))
			.map((document) => structuredClone(document));
	}

	async upsertDocument(document: LocalDocument): Promise<void> {
		const index = this.documents.findIndex((entry) => entry.path === document.path);
		if (index === -1) {
			this.documents.push(structuredClone(document));
			return;
		}

		this.documents[index] = structuredClone(document);
	}

	read(path: string): LocalDocument | undefined {
		return this.documents.find((document) => document.path === path);
	}
}

class MemoryNotionRepository implements NotionRepository {
	constructor(private readonly snapshots: Record<string, NotionDatabaseSnapshot>) {}

	async getDatabaseSnapshot(databaseId: string): Promise<NotionDatabaseSnapshot> {
		const snapshot = this.snapshots[databaseId];
		if (!snapshot) {
			throw new Error(`Missing database ${databaseId}`);
		}

		return structuredClone(snapshot);
	}

	async createPage(input: {
		databaseId: string;
		markdown: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage> {
		const snapshot = this.snapshots[input.databaseId];
		if (!snapshot) {
			throw new Error(`Missing database ${input.databaseId}`);
		}

		const page: NotionPage = {
			id: `page-${snapshot.pages.length + 1}`,
			lastEditedTime: "2026-03-04T10:05:00.000Z",
			markdown: input.markdown,
			properties: {
				[input.titleProperty]: { type: "title", value: input.title },
			},
			title: input.title,
		};

		snapshot.pages.push(structuredClone(page));
		return page;
	}

	async updatePage(input: {
		markdown: string;
		pageId: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage> {
		const snapshot = Object.values(this.snapshots).find((entry) =>
			entry.pages.some((page) => page.id === input.pageId),
		);
		if (!snapshot) {
			throw new Error(`Missing page ${input.pageId}`);
		}

		const index = snapshot.pages.findIndex((page) => page.id === input.pageId);
		const existingPage = snapshot.pages[index];
		if (!existingPage) {
			throw new Error(`Missing page index ${input.pageId}`);
		}

		const updatedPage: NotionPage = {
			...existingPage,
			lastEditedTime: "2026-03-04T10:15:00.000Z",
			markdown: input.markdown,
		};

		snapshot.pages[index] = structuredClone(updatedPage);
		return updatedPage;
	}

	updateRemotePage(databaseId: string, pageId: string, markdown: string, lastEditedTime: string): void {
		const snapshot = this.snapshots[databaseId];
		if (!snapshot) {
			throw new Error(`Missing database ${databaseId}`);
		}

		const index = snapshot.pages.findIndex((page) => page.id === pageId);
		const existingPage = snapshot.pages[index];
		if (!existingPage) {
			throw new Error(`Missing page ${pageId}`);
		}

		snapshot.pages[index] = {
			...existingPage,
			lastEditedTime,
			markdown,
		};
	}
}

function createProfile(
	values: Partial<DatabaseSyncSetting>,
): DatabaseSyncSetting {
	return {
		...createDefaultDatabaseConfig("Tasks"),
		databaseId: "db-1",
		enabled: true,
		folder: "Tasks",
		propertyMappings: [{
			direction: "bidirectional",
			notionProperty: "Status",
			obsidianKey: "status",
		}],
		...values,
	};
}

function createSettings(profiles: DatabaseSyncSetting[]): NotionSyncPluginSettings {
	return normalizeSettings({
		databases: profiles,
		notionToken: "secret_test",
		syncOnStartup: true,
	});
}

describe("SyncService", () => {
	it("runs full and incremental sync flows across configured databases", async () => {
		const localRepository = new MemoryLocalRepository([{
			content: "# Local launch",
			frontmatter: { status: "Todo" },
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notionRepository = new MemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
			"db-2": {
				databaseId: "db-2",
				pages: [{
					id: "page-remote",
					lastEditedTime: "2026-03-04T10:10:00.000Z",
					markdown: "# Remote note",
					properties: {
						Name: { type: "title", value: "Remote note" },
						Status: { type: "status", value: "Draft" },
					},
					title: "Remote note",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});
		let now = Date.parse("2026-03-04T10:20:00.000Z");
		const service = new SyncService({
			getSettings: () => createSettings([
				createProfile({ syncIntervalSeconds: 60 }),
				createProfile({
					databaseId: "db-2",
					folder: "Notes",
					name: "Notes",
					syncIntervalSeconds: 120,
				}),
			]),
			localRepository,
			notionRepository,
			now: () => now,
		});

		const fullSummary = await service.syncAll();

		expect(fullSummary.createdRemotePages).toBe(1);
		expect(fullSummary.createdLocalDocuments).toBe(1);
		expect(localRepository.read("Tasks/launch.md")?.frontmatter.notionPageId).toBe("page-1");
		expect(localRepository.read("Notes/Remote note.md")?.content).toBe("# Remote note");

		notionRepository.updateRemotePage(
			"db-1",
			"page-1",
			"# Remote launch",
			"2026-03-04T10:30:00.000Z",
		);
		now = Date.parse("2026-03-04T10:31:30.000Z");

		const pollSummary = await service.syncDueProfiles();

		expect(pollSummary.updatedLocalDocuments).toBe(1);
		expect(localRepository.read("Tasks/launch.md")?.content).toBe("# Remote launch");

		const unmatchedSummary = await service.syncFile("Inbox/random.md");
		expect(unmatchedSummary).toBeNull();
	});

	it("skips work when the integration token is missing or polls are not due", async () => {
		const localRepository = new MemoryLocalRepository([]);
		const notionRepository = new MemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [],
				schema: {
					Name: "title",
				},
			},
		});
		let now = Date.parse("2026-03-04T10:20:00.000Z");
		const service = new SyncService({
			getSettings: () => createSettings([
				createProfile({
					syncIntervalSeconds: 120,
				}),
			]),
			localRepository,
			notionRepository,
			now: () => now,
		});
		const withoutToken = new SyncService({
			getSettings: () => ({
				...createSettings([createProfile({})]),
				notionToken: "",
			}),
			localRepository,
			notionRepository,
			now: () => now,
		});

		expect(await withoutToken.syncAll()).toEqual({
			createdLocalDocuments: 0,
			createdRemotePages: 0,
			skipped: 0,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		});
		expect(await withoutToken.syncFile("Tasks/launch.md")).toBeNull();

		await service.syncAll();
		now = Date.parse("2026-03-04T10:21:00.000Z");

		expect(await service.syncDueProfiles()).toEqual({
			createdLocalDocuments: 0,
			createdRemotePages: 0,
			skipped: 0,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		});
	});
});
