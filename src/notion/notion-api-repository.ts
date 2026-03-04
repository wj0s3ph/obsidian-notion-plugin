import { Client } from "@notionhq/client";

import type { NotionDatabaseSnapshot, NotionPage, NotionRepository } from "../sync/engine";

export interface NotionClientLike {
	databases?: {
		retrieve: (input: Record<string, unknown>) => Promise<{
			data_sources?: Array<{ id?: string }>;
		}>;
	};
	dataSources: {
		query: (input: Record<string, unknown>) => Promise<{
			has_more?: boolean;
			next_cursor?: string | null;
			results: unknown[];
		}>;
		retrieve: (input: Record<string, unknown>) => Promise<{
			properties?: Record<string, { type?: string }>;
		}>;
	};
	pages: {
		create?: (input: Record<string, unknown>) => Promise<unknown>;
		retrieveMarkdown: (input: Record<string, unknown>) => Promise<{
			markdown: string;
		}>;
		update?: (input: Record<string, unknown>) => Promise<unknown>;
		updateMarkdown?: (input: Record<string, unknown>) => Promise<unknown>;
	};
}

export class NotionApiRepository implements NotionRepository {
	constructor(private readonly createClient: () => NotionClientLike) {}

	async getDatabaseSnapshot(databaseId: string): Promise<NotionDatabaseSnapshot> {
		const client = this.createClient();
		const { dataSource, dataSourceId } = await this.resolveDataSource(client, databaseId);
		const pages = await this.queryDatabasePages(client, dataSourceId);

		return {
			databaseId: dataSourceId,
			pages,
			schema: Object.fromEntries(
				Object.entries(dataSource.properties ?? {}).map(([name, property]) => [
					name,
					property.type ?? "unknown",
				]),
			),
		};
	}

	async createPage(input: {
		databaseId: string;
		markdown: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage> {
		const client = this.createClient();
		if (!client.pages.create || !client.pages.updateMarkdown) {
			throw new Error("Notion client does not support page creation");
		}

		const createdPage = await client.pages.create({
			markdown: input.markdown,
			parent: {
				data_source_id: input.databaseId,
				type: "data_source_id",
			},
			properties: input.properties,
		});
		return this.hydratePage(client, createdPage);
	}

	async updatePage(input: {
		markdown: string;
		pageId: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage> {
		const client = this.createClient();
		if (!client.pages.update || !client.pages.updateMarkdown) {
			throw new Error("Notion client does not support page updates");
		}

		const updatedPage = await client.pages.update({
			erase_content: true,
			page_id: input.pageId,
			properties: input.properties,
		});
		await this.insertMarkdown(client, input.pageId, input.markdown);
		return this.hydratePage(client, updatedPage);
	}

	private async resolveDataSource(
		client: NotionClientLike,
		databaseId: string,
	): Promise<{
		dataSource: {
			properties?: Record<string, { type?: string }>;
		};
		dataSourceId: string;
	}> {
		try {
			return {
				dataSource: await client.dataSources.retrieve({
					data_source_id: databaseId,
				}),
				dataSourceId: databaseId,
			};
		} catch (error) {
			if (!isNotionObjectNotFoundError(error) || !client.databases?.retrieve) {
				throw error;
			}
		}

		const database = await client.databases.retrieve({
			database_id: databaseId,
		});
		const dataSourceId = extractFirstDataSourceId(database);

		return {
			dataSource: await client.dataSources.retrieve({
				data_source_id: dataSourceId,
			}),
			dataSourceId,
		};
	}

	private async hydratePage(client: NotionClientLike, page: unknown): Promise<NotionPage> {
		const pageObject = assertPageLike(page);
		const markdown = await client.pages.retrieveMarkdown({
			page_id: pageObject.id,
		});

		return {
			id: pageObject.id,
			lastEditedTime: pageObject.last_edited_time,
			markdown: markdown.markdown,
			properties: normalizeProperties(pageObject.properties),
			title: extractPageTitle(pageObject.properties),
		};
	}

	private async queryDatabasePages(
		client: NotionClientLike,
		databaseId: string,
	): Promise<NotionPage[]> {
		const pages: NotionPage[] = [];
		let nextCursor: string | null | undefined;

		do {
			const response = await client.dataSources.query({
				data_source_id: databaseId,
				result_type: "page",
				start_cursor: nextCursor,
			});

			for (const result of response.results) {
				if (!isPageLike(result)) {
					continue;
				}

				pages.push(await this.hydratePage(client, result));
			}

			nextCursor = response.has_more ? response.next_cursor ?? null : null;
		} while (nextCursor);

		return pages;
	}

	private insertMarkdown(
		client: NotionClientLike,
		pageId: string,
		markdown: string,
	): Promise<unknown> {
		if (!client.pages.updateMarkdown) {
			throw new Error("Notion client does not support markdown updates");
		}

		return client.pages.updateMarkdown({
			insert_content: {
				content: markdown,
			},
			page_id: pageId,
			type: "insert_content",
		});
	}
}

export function createNotionClientFactory(getToken: () => string): () => NotionClientLike {
	return () => new Client({
		auth: getToken().trim(),
		fetch: getBoundFetch(),
	}) as NotionClientLike;
}

function getBoundFetch(): typeof fetch | undefined {
	if (typeof globalThis.fetch !== "function") {
		return undefined;
	}

	return globalThis.fetch.bind(globalThis);
}

function assertPageLike(value: unknown): PageLike {
	if (!isPageLike(value)) {
		throw new Error("Expected a Notion page response");
	}

	return value;
}

function extractFirstDataSourceId(value: unknown): string {
	if (
		typeof value === "object"
		&& value !== null
		&& "data_sources" in value
		&& Array.isArray(value.data_sources)
	) {
		const dataSources = value.data_sources as unknown[];
		const dataSource = dataSources[0];
		const dataSourceId = getNonEmptyId(dataSource);
		if (dataSourceId) {
			return dataSourceId;
		}
	}

	throw new Error("Database is not backed by a Notion data source");
}

function extractPageTitle(properties: Record<string, unknown>): string {
	const titleProperty = Object.values(properties).find((property) =>
		typeof property === "object"
		&& property !== null
		&& "type" in property
		&& property.type === "title",
	);
	if (!titleProperty || typeof titleProperty !== "object" || titleProperty === null) {
		return "Untitled";
	}

	return extractRichText(
		"title" in titleProperty ? titleProperty.title : undefined,
	) || "Untitled";
}

function extractRichText(value: unknown): string {
	if (!Array.isArray(value)) {
		return "";
	}

	return value
		.map((item) => {
			if (!isRecord(item)) {
				return "";
			}

			const plainText = getStringProperty(item, "plain_text");
			if (plainText !== undefined) {
				return plainText;
			}

			const text = getRecordProperty(item, "text");
			const content = text ? getStringProperty(text, "content") : undefined;
			if (content !== undefined) {
				return content;
			}

			return "";
		})
		.join("");
}

function isPageLike(value: unknown): value is PageLike {
	return (
		typeof value === "object"
		&& value !== null
		&& "id" in value
		&& typeof value.id === "string"
		&& "last_edited_time" in value
		&& typeof value.last_edited_time === "string"
		&& "properties" in value
		&& typeof value.properties === "object"
		&& value.properties !== null
		&& "object" in value
		&& value.object === "page"
	);
}

function isNotionObjectNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object"
		&& error !== null
		&& "code" in error
		&& error.code === "object_not_found"
	);
}

function getNonEmptyId(value: unknown): string | null {
	return (
		typeof value === "object"
		&& value !== null
		&& "id" in value
		&& typeof value.id === "string"
		&& value.id.trim()
	)
		? value.id
		: null;
}

function normalizeProperties(
	properties: Record<string, unknown>,
): Record<string, { type: string; value: unknown }> {
	return Object.fromEntries(
		Object.entries(properties).map(([name, property]) => {
			const propertyType = getPropertyType(property);
			return [
				name,
				{
					type: propertyType,
					value: normalizePropertyValue(propertyType, property),
				},
			];
		}),
	);
}

function normalizePropertyValue(type: string, property: unknown): unknown {
	if (typeof property !== "object" || property === null) {
		return null;
	}

	const record = property as Record<string, unknown>;

	switch (type) {
		case "checkbox":
			return "checkbox" in record ? Boolean(record.checkbox) : false;
		case "created_time":
		case "last_edited_time":
			return type in record && typeof record[type] === "string" ? record[type] : null;
		case "date":
			return "date" in record && typeof record.date === "object" && record.date !== null
				? normalizeDatePropertyValue(record.date)
				: null;
		case "email":
		case "phone_number":
		case "url":
			return type in record && typeof record[type] === "string" ? record[type] : null;
		case "multi_select":
			return "multi_select" in record && Array.isArray(record.multi_select)
				? record.multi_select
					.map((option) => getStringProperty(option, "name") ?? null)
					.filter((option): option is string => typeof option === "string")
				: [];
		case "number":
			return "number" in record && typeof record.number === "number" ? record.number : null;
		case "rich_text":
			return "rich_text" in record ? extractRichText(record.rich_text) : "";
		case "select":
		case "status":
			return type in record
				? getStringProperty(record[type], "name") ?? null
				: null;
		case "title":
			return "title" in record ? extractRichText(record.title) : "";
		default:
			return type in record ? record[type] : null;
	}
}

function getPropertyType(property: unknown): string {
	return typeof property === "object" && property !== null && "type" in property && typeof property.type === "string"
		? property.type
		: "unknown";
}

function normalizeDatePropertyValue(value: unknown): string | { start: string; end?: string } | null {
	if (typeof value !== "object" || value === null || !("start" in value) || typeof value.start !== "string") {
		return null;
	}

	const end = "end" in value && typeof value.end === "string" ? value.end : undefined;
	return end ? { end, start: value.start } : value.start;
}

function getRecordProperty(value: unknown, key: string): Record<string, unknown> | undefined {
	if (!isRecord(value) || !(key in value)) {
		return undefined;
	}

	const propertyValue = value[key];
	return isRecord(propertyValue) ? propertyValue : undefined;
}

function getStringProperty(value: unknown, key: string): string | undefined {
	if (!isRecord(value) || !(key in value)) {
		return undefined;
	}

	const propertyValue = value[key];
	return typeof propertyValue === "string" ? propertyValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

interface PageLike {
	id: string;
	last_edited_time: string;
	object: "page";
	properties: Record<string, unknown>;
}
