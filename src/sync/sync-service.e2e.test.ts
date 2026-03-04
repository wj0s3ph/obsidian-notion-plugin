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

	async readDocument(path: string): Promise<LocalDocument | null> {
		const document = this.documents.find((entry) => entry.path === path);
		return document ? structuredClone(document) : null;
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
	});
}

describe("SyncService", () => {
	it("syncs only the selected database for the requested file", async () => {
		const localRepository = new MemoryLocalRepository([
			{
				content: "# Local launch",
				frontmatter: { status: "Todo" },
				lastEditedTime: "2026-03-04T10:00:00.000Z",
				path: "Tasks/launch.md",
				title: "Launch",
			},
			{
				content: "# Local note",
				frontmatter: { status: "Draft" },
				lastEditedTime: "2026-03-04T10:00:00.000Z",
				path: "Notes/remote.md",
				title: "Remote",
			},
		]);
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
						Name: { type: "title", value: "Remote" },
						Status: { type: "status", value: "Published" },
					},
					title: "Remote",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});
		const service = new SyncService({
			getSettings: () => createSettings([
				createProfile({ id: "tasks", name: "Tasks" }),
				createProfile({ databaseId: "db-2", id: "notes", name: "Notes" }),
			]),
			localRepository,
			notionRepository,
		});

		const createdSummary = await service.syncFile("Tasks/launch.md", "tasks");

		expect(createdSummary).toEqual({
			status: "success",
			summary: {
				createdLocalDocuments: 0,
				createdRemotePages: 1,
				skipped: 0,
				updatedLocalDocuments: 0,
				updatedRemotePages: 0,
			},
		});
		expect(localRepository.read("Tasks/launch.md")?.frontmatter.notionPageId).toBe("page-1");
		expect(localRepository.read("Notes/remote.md")?.content).toBe("# Local note");

		localRepository.read("Notes/remote.md")!.frontmatter.notionPageId = "page-remote";
		notionRepository.updateRemotePage(
			"db-2",
			"page-remote",
			"# Remote revision",
			"2026-03-04T10:20:00.000Z",
		);

		const pulledSummary = await service.syncFile("Notes/remote.md", "notes");

		expect(pulledSummary).toEqual({
			status: "success",
			summary: {
				createdLocalDocuments: 0,
				createdRemotePages: 0,
				skipped: 0,
				updatedLocalDocuments: 1,
				updatedRemotePages: 0,
			},
		});
		expect(localRepository.read("Notes/remote.md")?.content).toBe("# Remote revision");
		expect(localRepository.read("Tasks/launch.md")?.content).toBe("# Local launch");
	});

	it("returns null when the token, database, or file is unavailable", async () => {
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
		const service = new SyncService({
			getSettings: () => createSettings([
				createProfile({
					id: "tasks",
				}),
			]),
			localRepository,
			notionRepository,
		});
		const withoutToken = new SyncService({
			getSettings: () => ({
				...createSettings([createProfile({ id: "tasks" })]),
				notionToken: "",
			}),
			localRepository,
			notionRepository,
		});

		await expect(service.syncFile("Tasks/missing.md", "tasks")).resolves.toEqual({
			message: "Active Markdown note could not be read from the vault.",
			reason: "document-not-found",
			status: "skipped",
		});
		await expect(service.syncFile("Tasks/launch.md", "missing")).resolves.toEqual({
			message: "Selected Notion database profile is not available.",
			reason: "profile-not-found",
			status: "skipped",
		});
		await expect(withoutToken.syncFile("Tasks/launch.md", "tasks")).resolves.toEqual({
			message: "Configure a Notion integration token in plugin settings first.",
			reason: "token-missing",
			status: "skipped",
		});
	});

	it("pulls the selected remote page into the requested file", async () => {
		const localRepository = new MemoryLocalRepository([{
			content: "# Local note",
			frontmatter: {
				notionPageId: "page-remote",
				status: "Draft",
			},
			lastEditedTime: "2026-03-04T10:30:00.000Z",
			path: "Notes/remote.md",
			title: "Remote",
		}]);
		const notionRepository = new MemoryNotionRepository({
			"db-2": {
				databaseId: "db-2",
				pages: [{
					id: "page-remote",
					lastEditedTime: "2026-03-04T10:10:00.000Z",
					markdown: "# Remote source",
					properties: {
						Name: { type: "title", value: "Remote" },
						Status: { type: "status", value: "Published" },
					},
					title: "Remote",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});
		const service = new SyncService({
			getSettings: () => createSettings([
				createProfile({ databaseId: "db-2", id: "notes", name: "Notes" }),
			]),
			localRepository,
			notionRepository,
		});

		const result = await service.pullFile("Notes/remote.md", "notes");

		expect(result).toEqual({
			status: "success",
			summary: {
				createdLocalDocuments: 0,
				createdRemotePages: 0,
				skipped: 0,
				updatedLocalDocuments: 1,
				updatedRemotePages: 0,
			},
		});
		expect(localRepository.read("Notes/remote.md")).toMatchObject({
			content: "# Remote source",
			frontmatter: {
				notionPageId: "page-remote",
				status: "Published",
			},
		});
	});
});
