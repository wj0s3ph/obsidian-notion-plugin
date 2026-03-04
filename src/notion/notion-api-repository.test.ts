import { describe, expect, it } from "vitest";

import { NotionApiRepository } from "./notion-api-repository";

describe("NotionApiRepository", () => {
	it("hydrates a database snapshot with schema, markdown and normalized properties", async () => {
		const repository = new NotionApiRepository(() => ({
			dataSources: {
				query: async () => ({
					has_more: false,
					next_cursor: null,
					results: [{
						id: "page-1",
						last_edited_time: "2026-03-04T10:00:00.000Z",
						object: "page",
						properties: {
							Name: {
								title: [{ plain_text: "Launch" }],
								type: "title",
							},
							Status: {
								status: { name: "Todo" },
								type: "status",
							},
						},
					}],
				}),
				retrieve: async () => ({
					properties: {
						Name: { type: "title" },
						Status: { type: "status" },
					},
				}),
			},
			pages: {
				retrieveMarkdown: async () => ({
					markdown: "# Launch",
				}),
			},
		}));

		const snapshot = await repository.getDatabaseSnapshot("db-1");

		expect(snapshot).toEqual({
			databaseId: "db-1",
			pages: [{
				id: "page-1",
				lastEditedTime: "2026-03-04T10:00:00.000Z",
				markdown: "# Launch",
				properties: {
					Name: {
						type: "title",
						value: "Launch",
					},
					Status: {
						type: "status",
						value: "Todo",
					},
				},
				title: "Launch",
			}],
			schema: {
				Name: "title",
				Status: "status",
			},
		});
	});

	it("creates and updates page content through the markdown endpoints", async () => {
		const createCalls: unknown[] = [];
		const updateCalls: unknown[] = [];
		const markdownCalls: unknown[] = [];
		const repository = new NotionApiRepository(() => ({
			dataSources: {
				query: async () => ({ has_more: false, next_cursor: null, results: [] }),
				retrieve: async () => ({ properties: {} }),
			},
			pages: {
				create: async (input: unknown) => {
					createCalls.push(input);
					return {
						id: "page-1",
						last_edited_time: "2026-03-04T10:00:00.000Z",
						object: "page",
						properties: {
							Name: {
								title: [{ plain_text: "Launch" }],
								type: "title",
							},
						},
					};
				},
				retrieveMarkdown: async () => ({
					markdown: "# Launch",
				}),
				update: async (input: unknown) => {
					updateCalls.push(input);
					return {
						id: "page-1",
						last_edited_time: "2026-03-04T10:05:00.000Z",
						object: "page",
						properties: {
							Name: {
								title: [{ plain_text: "Launch" }],
								type: "title",
							},
						},
					};
				},
				updateMarkdown: async (input: unknown) => {
					markdownCalls.push(input);
					return {
						markdown: "# Launch",
					};
				},
			},
		}));

		await repository.createPage({
			databaseId: "db-1",
			markdown: "# Launch",
			properties: {
				Name: {
					title: [{ text: { content: "Launch" }, type: "text" }],
					type: "title",
				},
			},
			title: "Launch",
			titleProperty: "Name",
		});
		await repository.updatePage({
			markdown: "# Updated",
			pageId: "page-1",
			properties: {
				Name: {
					title: [{ text: { content: "Launch" }, type: "text" }],
					type: "title",
				},
			},
			title: "Launch",
			titleProperty: "Name",
		});

		expect(createCalls).toEqual([{
			parent: {
				data_source_id: "db-1",
				type: "data_source_id",
			},
			properties: {
				Name: {
					title: [{ text: { content: "Launch" }, type: "text" }],
					type: "title",
				},
			},
		}]);
		expect(updateCalls).toEqual([{
			page_id: "page-1",
			properties: {
				Name: {
					title: [{ text: { content: "Launch" }, type: "text" }],
					type: "title",
				},
			},
		}]);
		expect(markdownCalls).toEqual([
			{
				page_id: "page-1",
				replace_content_range: {
					allow_deleting_content: true,
					content: "# Launch",
					content_range: "all",
				},
				type: "replace_content_range",
			},
			{
				page_id: "page-1",
				replace_content_range: {
					allow_deleting_content: true,
					content: "# Updated",
					content_range: "all",
				},
				type: "replace_content_range",
			},
		]);
	});
});
