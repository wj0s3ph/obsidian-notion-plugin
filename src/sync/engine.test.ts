import { describe, expect, it } from "vitest";

import type { DatabaseSyncSetting } from "../settings";
import { createDefaultDatabaseConfig } from "../settings";
import type {
	LocalDocument,
	LocalDocumentRepository,
	NotionDatabaseSnapshot,
	NotionPage,
	NotionRepository,
} from "./engine";
import { syncDatabaseProfiles } from "./engine";

class InMemoryLocalRepository implements LocalDocumentRepository {
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

	getDocument(path: string): LocalDocument | undefined {
		return this.documents.find((document) => document.path === path);
	}

	getDocuments(folder: string): LocalDocument[] {
		return this.documents.filter((document) => document.path.startsWith(`${folder}/`));
	}
}

class InMemoryNotionRepository implements NotionRepository {
	createdPages: Array<{ databaseId: string; page: NotionPage }> = [];
	updatedPages: Array<{ pageId: string; page: NotionPage }> = [];

	constructor(private readonly databases: Record<string, NotionDatabaseSnapshot>) {}

	async getDatabaseSnapshot(databaseId: string): Promise<NotionDatabaseSnapshot> {
		const database = this.databases[databaseId];
		if (!database) {
			throw new Error(`Unknown database: ${databaseId}`);
		}

		return structuredClone(database);
	}

	async createPage(input: {
		databaseId: string;
		markdown: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage> {
		const page: NotionPage = {
			id: `page-${this.createdPages.length + 1}`,
			lastEditedTime: "2026-03-04T10:05:00.000Z",
			markdown: input.markdown,
			properties: {
				[input.titleProperty]: {
					type: "title",
					value: input.title,
				},
				...materializePropertyState(input.properties),
			},
			title: input.title,
		};

		const database = this.databases[input.databaseId];
		if (!database) {
			throw new Error(`Unknown database: ${input.databaseId}`);
		}

		database.pages.push(structuredClone(page));
		this.createdPages.push({ databaseId: input.databaseId, page: structuredClone(page) });
		return page;
	}

	async updatePage(input: {
		markdown: string;
		pageId: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage> {
		const database = Object.values(this.databases).find((entry) =>
			entry.pages.some((page) => page.id === input.pageId),
		);
		if (!database) {
			throw new Error(`Unknown page: ${input.pageId}`);
		}

		const index = database.pages.findIndex((page) => page.id === input.pageId);
		const existingPage = database.pages[index];
		if (!existingPage) {
			throw new Error(`Unknown page index: ${input.pageId}`);
		}

		const page: NotionPage = {
			...existingPage,
			lastEditedTime: "2026-03-04T10:10:00.000Z",
			markdown: input.markdown,
			properties: {
				...existingPage.properties,
				[input.titleProperty]: {
					type: "title",
					value: input.title,
				},
				...materializePropertyState(input.properties),
			},
			title: input.title,
		};

		database.pages[index] = structuredClone(page);
		this.updatedPages.push({ pageId: input.pageId, page: structuredClone(page) });
		return page;
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

function materializePropertyState(
	properties: Record<string, Record<string, unknown>>,
): Record<string, { type: string; value: unknown }> {
	return Object.fromEntries(
		Object.entries(properties).map(([name, property]) => {
			const propertyType = String(property.type);
			const propertyValue = property[propertyType];

			switch (propertyType) {
				case "checkbox":
					return [name, { type: propertyType, value: Boolean(propertyValue) }];
				case "multi_select":
					return [
						name,
						{
							type: propertyType,
							value: Array.isArray(propertyValue)
								? propertyValue.map((option) => String((option as { name: string }).name))
								: [],
						},
					];
				case "status":
				case "select":
					return [name, { type: propertyType, value: (propertyValue as { name: string }).name }];
				case "title":
				case "rich_text":
					return [
						name,
						{
							type: propertyType,
							value: Array.isArray(propertyValue)
								? String((((propertyValue[0] as { text?: { content?: string } })?.text)?.content) ?? "")
								: "",
						},
					];
				default:
					return [name, { type: propertyType, value: propertyValue }];
			}
		}),
	);
}

describe("syncDatabaseProfiles", () => {
	it("skips disabled profiles and profiles without a database id", async () => {
		const local = new InMemoryLocalRepository([]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [],
				schema: {
					Name: "title",
				},
			},
		});

		const summary = await syncDatabaseProfiles([
			createProfile({
				databaseId: "",
			}),
			createProfile({
				databaseId: "db-1",
				enabled: false,
			}),
		], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary).toMatchObject({
			createdLocalDocuments: 0,
			createdRemotePages: 0,
			skipped: 2,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		});
	});

	it("creates a Notion page for an unlinked local note and stores the page id", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Draft",
			frontmatter: { status: "Todo" },
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.createdRemotePages).toBe(1);
		const [createdPage] = notion.createdPages;
		expect(createdPage).toBeDefined();
		expect(createdPage?.databaseId).toBe("db-1");
		expect(createdPage?.page.properties.Status?.value).toBe("Todo");
		expect(local.getDocument("Tasks/launch.md")?.frontmatter.notionPageId).toBe("page-1");
	});

	it("updates a linked Notion page when the local note is newer", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Updated locally",
			frontmatter: {
				notionPageId: "page-1",
				status: "In progress",
			},
			lastEditedTime: "2026-03-04T10:15:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:05:00.000Z",
					markdown: "# Old",
					properties: {
						Name: { type: "title", value: "Launch" },
						Status: { type: "status", value: "Todo" },
					},
					title: "Launch",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.updatedRemotePages).toBe(1);
		const [updatedPage] = notion.updatedPages;
		expect(updatedPage).toBeDefined();
		expect(updatedPage?.page.markdown).toBe("# Updated locally");
		expect(updatedPage?.page.properties.Status?.value).toBe("In progress");
	});

	it("updates a linked Notion page when only mapped properties change", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Launch",
			frontmatter: {
				notionPageId: "page-1",
				status: "In progress",
			},
			lastEditedTime: "2026-03-04T10:15:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:05:00.000Z",
					markdown: "# Launch",
					properties: {
						Name: { type: "title", value: "Launch" },
						Status: { type: "status", value: "Todo" },
					},
					title: "Launch",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.updatedRemotePages).toBe(1);
		expect(notion.updatedPages[0]?.page.properties.Status?.value).toBe("In progress");
	});

	it("pulls newer remote changes into the local note and skips read-only properties", async () => {
		const profile = createProfile({
			propertyMappings: [
				{
					direction: "bidirectional",
					notionProperty: "Status",
					obsidianKey: "status",
				},
				{
					direction: "bidirectional",
					notionProperty: "Created time",
					obsidianKey: "createdAt",
				},
			],
		});
		const local = new InMemoryLocalRepository([{
			content: "# Old",
			frontmatter: {
				notionPageId: "page-1",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:20:00.000Z",
					markdown: "# Remote",
					properties: {
						"Created time": { type: "created_time", value: "2026-03-04T08:00:00.000Z" },
						Name: { type: "title", value: "Launch" },
						Status: { type: "status", value: "Done" },
					},
					title: "Launch",
				}],
				schema: {
					"Created time": "created_time",
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.updatedLocalDocuments).toBe(1);
		expect(local.getDocument("Tasks/launch.md")).toMatchObject({
			content: "# Remote",
			frontmatter: {
				notionPageId: "page-1",
				status: "Done",
			},
		});
		expect(local.getDocument("Tasks/launch.md")?.frontmatter.createdAt).toBeUndefined();
	});

	it("pulls newer remote properties even when the markdown body is unchanged", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Launch",
			frontmatter: {
				notionPageId: "page-1",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:20:00.000Z",
					markdown: "# Launch",
					properties: {
						Name: { type: "title", value: "Launch" },
						Status: { type: "status", value: "Done" },
					},
					title: "Launch",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.updatedLocalDocuments).toBe(1);
		expect(local.getDocument("Tasks/launch.md")?.frontmatter.status).toBe("Done");
	});

	it("creates a replacement remote page when a linked page no longer exists", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Launch",
			frontmatter: {
				notionPageId: "page-missing",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:10:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.createdRemotePages).toBe(1);
		expect(local.getDocument("Tasks/launch.md")?.frontmatter.notionPageId).toBe("page-1");
	});

	it("imports remote-only pages into the matching configured folder across databases", async () => {
		const tasksProfile = createProfile({});
		const notesProfile = createProfile({
			databaseId: "db-2",
			folder: "Notes",
			name: "Notes",
		});
		const local = new InMemoryLocalRepository([]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:20:00.000Z",
					markdown: "# Remote task",
					properties: {
						Name: { type: "title", value: "Remote task" },
						Status: { type: "status", value: "Todo" },
					},
					title: "Remote task",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
			"db-2": {
				databaseId: "db-2",
				pages: [{
					id: "page-2",
					lastEditedTime: "2026-03-04T10:30:00.000Z",
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

		const summary = await syncDatabaseProfiles([tasksProfile, notesProfile], {
			localRepository: local,
			notionRepository: notion,
		});

		const [taskDocument] = local.getDocuments("Tasks");
		const [noteDocument] = local.getDocuments("Notes");

		expect(summary.createdLocalDocuments).toBe(2);
		expect(taskDocument).toBeDefined();
		expect(taskDocument).toMatchObject({
			content: "# Remote task",
			path: "Tasks/Remote task.md",
		});
		expect(noteDocument).toBeDefined();
		expect(noteDocument).toMatchObject({
			content: "# Remote note",
			path: "Notes/Remote note.md",
		});
	});

	it("skips writes when local and remote state already match", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Launch",
			frontmatter: {
				notionPageId: "page-1",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:00:00.000Z",
					markdown: "# Launch",
					properties: {
						Name: { type: "title", value: "Launch" },
						Status: { type: "status", value: "Todo" },
					},
					title: "Launch",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.skipped).toBe(1);
		expect(notion.createdPages).toHaveLength(0);
		expect(notion.updatedPages).toHaveLength(0);
	});

	it("deduplicates imported note paths when multiple remote pages share a title", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Existing",
			frontmatter: {
				notionPageId: "page-existing",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/Remote task.md",
			title: "Remote task",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [
					{
						id: "page-existing",
						lastEditedTime: "2026-03-04T10:00:00.000Z",
						markdown: "# Existing",
						properties: {
							Name: { type: "title", value: "remote-task" },
							Status: { type: "status", value: "Todo" },
						},
						title: "remote-task",
					},
					{
						id: "page-1",
						lastEditedTime: "2026-03-04T10:20:00.000Z",
						markdown: "# Remote task",
						properties: {
							Name: { type: "title", value: "Remote task" },
							Status: { type: "status", value: "Todo" },
						},
						title: "Remote task",
					},
				],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(local.getDocument("Tasks/Remote task-2.md")).toMatchObject({
			content: "# Remote task",
			frontmatter: {
				notionPageId: "page-1",
				status: "Todo",
			},
		});
	});

	it("falls back to an Untitled file name when the remote title has no valid file name characters", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:20:00.000Z",
					markdown: "# Remote task",
					properties: {
						Name: { type: "title", value: "///" },
						Status: { type: "status", value: "Todo" },
					},
					title: "///",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		await syncDatabaseProfiles([profile], {
			localRepository: local,
			notionRepository: notion,
		});

		expect(local.getDocument("Tasks/Untitled.md")).toMatchObject({
			content: "# Remote task",
		});
	});
});
