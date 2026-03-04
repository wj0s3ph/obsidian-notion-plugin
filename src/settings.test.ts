import { describe, expect, it } from "vitest";

import {
	DEFAULT_SETTINGS,
	coercePersistedSettings,
	createDefaultDatabaseConfig,
	normalizeSettings,
} from "./settings";

describe("createDefaultDatabaseConfig", () => {
	it("creates an isolated multi-database profile with sensible defaults", () => {
		const profile = createDefaultDatabaseConfig("Projects");

		expect(profile.name).toBe("Projects");
		expect(profile.databaseId).toBe("");
		expect(profile.notionPageIdField).toBe("notionPageId");
		expect(profile.notionProperties).toEqual([]);
		expect(profile.propertyMappings).toEqual([]);
		expect(profile.id).toMatch(/^database-/);
	});
});

describe("normalizeSettings", () => {
	it("fills nested defaults for missing plugin and profile fields", () => {
		const normalized = normalizeSettings({
			notionToken: "secret_123",
			databases: [
				{
					name: "Tasks",
					databaseId: "db-1",
				},
			],
		});

		const [database] = normalized.databases;

		expect(database).toBeDefined();
		expect(normalized.notionToken).toBe("secret_123");
		expect(normalized.databases).toHaveLength(1);
		expect(database).toMatchObject({
			name: "Tasks",
			databaseId: "db-1",
			notionProperties: [],
			propertyMappings: [],
		});
	});

	it("preserves cached Notion property names for dropdown-backed mapping controls", () => {
		const normalized = normalizeSettings({
			databases: [
				{
					databaseId: "db-1",
					name: "Tasks",
					notionProperties: ["Name", "Published", "Slug"],
				},
			],
		});

		expect(normalized.databases[0]?.notionProperties).toEqual(["Name", "Published", "Slug"]);
	});

	it("keeps notionPageIdField pinned to the preset default", () => {
		const normalized = normalizeSettings({
			databases: [{
				databaseId: "db-1",
				name: "Tasks",
				notionPageIdField: "customPageId",
			}],
		});

		expect(normalized.databases[0]?.notionPageIdField).toBe("notionPageId");
	});

	it("drops incomplete property mappings and defaults the direction to bidirectional", () => {
		const normalized = normalizeSettings({
			databases: [
				{
					name: "Contacts",
					databaseId: "db-2",
					propertyMappings: [
						{
							obsidianKey: "status",
							notionProperty: "Status",
						},
						{
							obsidianKey: "",
							notionProperty: "Ignored",
							direction: "notion-to-obsidian",
						},
						{
							obsidianKey: "invalidDirection",
							notionProperty: "Ignored too",
							direction: "sideways",
						},
					],
				},
			],
		});

		const [database] = normalized.databases;

		expect(database).toBeDefined();
		expect(database?.propertyMappings).toEqual([
			{
				direction: "bidirectional",
				notionProperty: "Status",
				obsidianKey: "status",
			},
		]);
	});

	it("uses immutable defaults when persisted data is empty", () => {
		const first = normalizeSettings(undefined);
		const second = normalizeSettings(undefined);

		first.databases.push(createDefaultDatabaseConfig("Scratch"));

		expect(second).toEqual(DEFAULT_SETTINGS);
		expect(second.databases).toEqual([]);
	});
});

describe("coercePersistedSettings", () => {
	it("drops non-object values before they reach normalizeSettings", () => {
		expect(coercePersistedSettings("invalid")).toBeUndefined();
		expect(coercePersistedSettings(42)).toBeUndefined();
		expect(coercePersistedSettings(null)).toBeUndefined();
		expect(coercePersistedSettings({
			databases: [],
			notionToken: "secret_123",
		})).toEqual({
			databases: [],
			notionToken: "secret_123",
		});
	});
});
