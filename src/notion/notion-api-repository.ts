import { Client } from "@notionhq/client";

import type { NotionDatabaseSnapshot, NotionPage, NotionRepository } from "../sync/engine";

export interface NotionClientLike {
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
		const dataSource = await client.dataSources.retrieve({
			data_source_id: databaseId,
		});
		const pages = await this.queryDatabasePages(client, databaseId);

		return {
			databaseId,
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
			parent: {
				data_source_id: input.databaseId,
				type: "data_source_id",
			},
			properties: input.properties,
		});
		const pageId = extractPageId(createdPage);

		await this.replaceMarkdown(client, pageId, input.markdown);
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
			page_id: input.pageId,
			properties: input.properties,
		});
		await this.replaceMarkdown(client, input.pageId, input.markdown);
		return this.hydratePage(client, updatedPage);
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

	private replaceMarkdown(
		client: NotionClientLike,
		pageId: string,
		markdown: string,
	): Promise<unknown> {
		if (!client.pages.updateMarkdown) {
			throw new Error("Notion client does not support markdown updates");
		}

		return client.pages.updateMarkdown({
			page_id: pageId,
			replace_content_range: {
				allow_deleting_content: true,
				content: markdown,
				content_range: "all",
			},
			type: "replace_content_range",
		});
	}
}

export function createNotionClientFactory(getToken: () => string): () => NotionClientLike {
	return () => new Client({
		auth: getToken().trim(),
	}) as NotionClientLike;
}

function assertPageLike(value: unknown): PageLike {
	if (!isPageLike(value)) {
		throw new Error("Expected a Notion page response");
	}

	return value;
}

function extractPageId(value: unknown): string {
	return assertPageLike(value).id;
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
			if (typeof item !== "object" || item === null) {
				return "";
			}

			if ("plain_text" in item && typeof item.plain_text === "string") {
				return item.plain_text;
			}

			if (
				"text" in item
				&& typeof item.text === "object"
				&& item.text !== null
				&& "content" in item.text
				&& typeof item.text.content === "string"
			) {
				return item.text.content;
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
				? ("start" in record.date && typeof record.date.start === "string"
					? record.date.start
					: null)
				: null;
		case "email":
		case "phone_number":
		case "url":
			return type in record && typeof record[type] === "string" ? record[type] : null;
		case "multi_select":
			return "multi_select" in record && Array.isArray(record.multi_select)
				? record.multi_select
					.map((option) =>
						typeof option === "object" && option !== null && "name" in option
							? option.name
							: null,
					)
					.filter((option): option is string => typeof option === "string")
				: [];
		case "number":
			return "number" in record && typeof record.number === "number" ? record.number : null;
		case "rich_text":
			return "rich_text" in record ? extractRichText(record.rich_text) : "";
		case "select":
		case "status":
			return type in record
				&& typeof record[type] === "object"
				&& record[type] !== null
				&& "name" in (record[type] as Record<string, unknown>)
				&& typeof (record[type] as Record<string, unknown>).name === "string"
				? (record[type] as Record<string, unknown>).name
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

interface PageLike {
	id: string;
	last_edited_time: string;
	object: "page";
	properties: Record<string, unknown>;
}
