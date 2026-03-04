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
import { pullRemoteDatabaseFile, syncDatabaseFile } from "./engine";

class InMemoryLocalRepository implements LocalDocumentRepository {
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

	getDocument(path: string): LocalDocument | undefined {
		return this.documents.find((document) => document.path === path);
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

describe("syncDatabaseFile", () => {
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

		const summary = await syncDatabaseFile(profile, "Tasks/launch.md", {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary).toEqual({
			createdLocalDocuments: 0,
			createdRemotePages: 1,
			skipped: 0,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		});
		const [createdPage] = notion.createdPages;
		expect(createdPage?.databaseId).toBe("db-1");
		expect(createdPage?.page.properties.Status?.value).toBe("Todo");
		expect(local.getDocument("Tasks/launch.md")?.frontmatter.notionPageId).toBe("page-1");
	});

	it("updates the current note from Notion when the remote page is newer", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Old local",
			frontmatter: {
				notionPageId: "page-1",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:05:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:10:00.000Z",
					markdown: "# Remote update",
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

		const summary = await syncDatabaseFile(profile, "Tasks/launch.md", {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary.updatedLocalDocuments).toBe(1);
		expect(local.getDocument("Tasks/launch.md")).toMatchObject({
			content: "# Remote update",
			frontmatter: {
				notionPageId: "page-1",
				status: "Done",
			},
		});
	});

	it("writes configured Notion-to-Obsidian properties back to local frontmatter after creating a page", async () => {
		const profile = createProfile({
			propertyMappings: [
				{
					direction: "notion-to-obsidian",
					notionProperty: "Slug",
					obsidianKey: "slug",
				},
				{
					direction: "bidirectional",
					notionProperty: "Status",
					obsidianKey: "status",
				},
			],
		});
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
					Slug: "rich_text",
					Status: "status",
				},
			},
		});
		notion.createPage = async (input) => ({
			id: "page-1",
			lastEditedTime: "2026-03-04T10:05:00.000Z",
			markdown: input.markdown,
			properties: {
				Name: { type: "title", value: input.title },
				Slug: { type: "rich_text", value: "launch" },
				Status: { type: "status", value: "Todo" },
			},
			title: input.title,
		});

		await syncDatabaseFile(profile, "Tasks/launch.md", {
			localRepository: local,
			notionRepository: notion,
		});

		expect(local.getDocument("Tasks/launch.md")).toMatchObject({
			frontmatter: {
				notionPageId: "page-1",
				slug: "launch",
				status: "Todo",
			},
		});
	});

	it("writes configured Notion-to-Obsidian properties back to local frontmatter after pushing updates", async () => {
		const profile = createProfile({
			propertyMappings: [
				{
					direction: "notion-to-obsidian",
					notionProperty: "Slug",
					obsidianKey: "slug",
				},
				{
					direction: "bidirectional",
					notionProperty: "Status",
					obsidianKey: "status",
				},
			],
		});
		const local = new InMemoryLocalRepository([{
			content: "# Local update",
			frontmatter: {
				notionPageId: "page-1",
				status: "In progress",
			},
			lastEditedTime: "2026-03-04T10:20:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:10:00.000Z",
					markdown: "# Remote old",
					properties: {
						Name: { type: "title", value: "Launch" },
						Slug: { type: "rich_text", value: "launch" },
						Status: { type: "status", value: "Todo" },
					},
					title: "Launch",
				}],
				schema: {
					Name: "title",
					Slug: "rich_text",
					Status: "status",
				},
			},
		});
		notion.updatePage = async (input) => ({
			id: input.pageId,
			lastEditedTime: "2026-03-04T10:25:00.000Z",
			markdown: input.markdown,
			properties: {
				Name: { type: "title", value: input.title },
				Slug: { type: "rich_text", value: "launch-updated" },
				Status: { type: "status", value: "In progress" },
			},
			title: input.title,
		});

		await syncDatabaseFile(profile, "Tasks/launch.md", {
			localRepository: local,
			notionRepository: notion,
		});

		expect(local.getDocument("Tasks/launch.md")).toMatchObject({
			content: "# Local update",
			frontmatter: {
				notionPageId: "page-1",
				slug: "launch-updated",
				status: "In progress",
			},
		});
	});

	it("skips syncing when the note or database id is unavailable", async () => {
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

		await expect(syncDatabaseFile(createProfile({ databaseId: "" }), "Tasks/launch.md", {
			localRepository: local,
			notionRepository: notion,
		})).resolves.toEqual({
			createdLocalDocuments: 0,
			createdRemotePages: 0,
			skipped: 1,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		});
		await expect(syncDatabaseFile(createProfile({}), "Tasks/missing.md", {
			localRepository: local,
			notionRepository: notion,
		})).resolves.toEqual({
			createdLocalDocuments: 0,
			createdRemotePages: 0,
			skipped: 1,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		});
	});

	it("pulls the linked remote page into the local note on demand", async () => {
		const profile = createProfile({});
		const local = new InMemoryLocalRepository([{
			content: "# Local draft",
			frontmatter: {
				notionPageId: "page-1",
				status: "Todo",
			},
			lastEditedTime: "2026-03-04T10:20:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		}]);
		const notion = new InMemoryNotionRepository({
			"db-1": {
				databaseId: "db-1",
				pages: [{
					id: "page-1",
					lastEditedTime: "2026-03-04T10:10:00.000Z",
					markdown: "# Remote source",
					properties: {
						Name: { type: "title", value: "Launch" },
						Status: { type: "status", value: "Published" },
					},
					title: "Launch",
				}],
				schema: {
					Name: "title",
					Status: "status",
				},
			},
		});

		const summary = await pullRemoteDatabaseFile(profile, "Tasks/launch.md", {
			localRepository: local,
			notionRepository: notion,
		});

		expect(summary).toEqual({
			createdLocalDocuments: 0,
			createdRemotePages: 0,
			skipped: 0,
			updatedLocalDocuments: 1,
			updatedRemotePages: 0,
		});
		expect(local.getDocument("Tasks/launch.md")).toMatchObject({
			content: "# Remote source",
			frontmatter: {
				notionPageId: "page-1",
				status: "Published",
			},
		});
	});
});
