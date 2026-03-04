import { describe, expect, it } from "vitest";

import { NotionApiRepository } from "./notion-api-repository";

describe("NotionApiRepository", () => {
	it("hydrates a database snapshot with schema, markdown and normalized properties", async () => {
		const repository = new NotionApiRepository(() => ({
			dataSources: {
				query: async (input) => ({
					has_more: input.start_cursor !== "cursor-1",
					next_cursor: input.start_cursor ? null : "cursor-1",
					results: input.start_cursor ? [{
						id: "page-2",
						last_edited_time: "2026-03-04T10:05:00.000Z",
						object: "page",
						properties: {
							Created: {
								created_time: "2026-03-04T08:00:00.000Z",
								type: "created_time",
							},
							Name: {
								title: [{ plain_text: "Second" }],
								type: "title",
							},
							Tags: {
								multi_select: [{ name: "alpha" }, { name: "beta" }],
								type: "multi_select",
							},
						},
					}] : [
						{
							object: "data_source",
						},
						{
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
						},
					],
				}),
				retrieve: async () => ({
					properties: {
						Created: { type: "created_time" },
						Name: { type: "title" },
						Status: { type: "status" },
						Tags: { type: "multi_select" },
					},
				}),
			},
			pages: {
				retrieveMarkdown: async (input) => ({
					markdown: input.page_id === "page-2" ? "# Second" : "# Launch",
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
			}, {
				id: "page-2",
				lastEditedTime: "2026-03-04T10:05:00.000Z",
				markdown: "# Second",
				properties: {
					Created: {
						type: "created_time",
						value: "2026-03-04T08:00:00.000Z",
					},
					Name: {
						type: "title",
						value: "Second",
					},
					Tags: {
						type: "multi_select",
						value: ["alpha", "beta"],
					},
				},
				title: "Second",
			}],
			schema: {
				Created: "created_time",
				Name: "title",
				Status: "status",
				Tags: "multi_select",
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

	it("throws when the client does not expose write methods", async () => {
		const repository = new NotionApiRepository(() => ({
			dataSources: {
				query: async () => ({ has_more: false, next_cursor: null, results: [] }),
				retrieve: async () => ({ properties: {} }),
			},
			pages: {
				retrieveMarkdown: async () => ({ markdown: "" }),
			},
		}));

		await expect(repository.createPage({
			databaseId: "db-1",
			markdown: "# Launch",
			properties: {},
			title: "Launch",
			titleProperty: "Name",
		})).rejects.toThrow("Notion client does not support page creation");
		await expect(repository.updatePage({
			markdown: "# Launch",
			pageId: "page-1",
			properties: {},
			title: "Launch",
			titleProperty: "Name",
		})).rejects.toThrow("Notion client does not support page updates");
	});

	it("normalizes additional property types and falls back to Untitled when no title exists", async () => {
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
							Check: {
								checkbox: true,
								type: "checkbox",
							},
							Choice: {
								select: { name: "Feature" },
								type: "select",
							},
							Date: {
								date: { start: "2026-03-04" },
								type: "date",
							},
							Notes: {
								rich_text: [{ text: { content: "Hello" } }],
								type: "rich_text",
							},
							Phone: {
								phone_number: "123",
								type: "phone_number",
							},
							Score: {
								number: 42,
								type: "number",
							},
							Unknown: {
								type: "mystery",
								mystery: "raw",
							},
						},
					}],
				}),
				retrieve: async () => ({
					properties: {
						Check: { type: "checkbox" },
						Choice: { type: "select" },
						Date: { type: "date" },
						Notes: { type: "rich_text" },
						Phone: { type: "phone_number" },
						Score: { type: "number" },
						Unknown: { type: "mystery" },
					},
				}),
			},
			pages: {
				retrieveMarkdown: async () => ({
					markdown: "# Untitled",
				}),
			},
		}));

		const snapshot = await repository.getDatabaseSnapshot("db-1");

		expect(snapshot.pages[0]).toEqual({
			id: "page-1",
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			markdown: "# Untitled",
			properties: {
				Check: {
					type: "checkbox",
					value: true,
				},
				Choice: {
					type: "select",
					value: "Feature",
				},
				Date: {
					type: "date",
					value: "2026-03-04",
				},
				Notes: {
					type: "rich_text",
					value: "Hello",
				},
				Phone: {
					type: "phone_number",
					value: "123",
				},
				Score: {
					type: "number",
					value: 42,
				},
				Unknown: {
					type: "mystery",
					value: "raw",
				},
			},
			title: "Untitled",
		});
	});

	it("preserves Notion date ranges instead of flattening them to a single start date", async () => {
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
							Date: {
								date: {
									end: "2026-03-05",
									start: "2026-03-04",
								},
								type: "date",
							},
							Name: {
								title: [{ plain_text: "Launch" }],
								type: "title",
							},
						},
					}],
				}),
				retrieve: async () => ({
					properties: {
						Date: { type: "date" },
						Name: { type: "title" },
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

		expect(snapshot.pages[0]?.properties.Date).toEqual({
			type: "date",
			value: {
				end: "2026-03-05",
				start: "2026-03-04",
			},
		});
	});
});
