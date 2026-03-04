import { describe, expect, it } from "vitest";

import type { PropertyMappingSetting } from "../settings";
import {
	buildNotionPropertyPayload,
	extractObsidianProperties,
	filterSyncablePropertyMappings,
	isReadOnlyNotionPropertyType,
} from "./notion-properties";

const BIDIRECTIONAL_MAPPING: PropertyMappingSetting = {
	direction: "bidirectional",
	notionProperty: "Status",
	obsidianKey: "status",
};

describe("isReadOnlyNotionPropertyType", () => {
	it("marks Notion computed and system properties as read-only", () => {
		expect(isReadOnlyNotionPropertyType("created_time")).toBe(true);
		expect(isReadOnlyNotionPropertyType("created_by")).toBe(true);
		expect(isReadOnlyNotionPropertyType("last_edited_time")).toBe(true);
		expect(isReadOnlyNotionPropertyType("last_edited_by")).toBe(true);
		expect(isReadOnlyNotionPropertyType("formula")).toBe(true);
		expect(isReadOnlyNotionPropertyType("rollup")).toBe(true);
		expect(isReadOnlyNotionPropertyType("unique_id")).toBe(true);
		expect(isReadOnlyNotionPropertyType("verification")).toBe(true);
		expect(isReadOnlyNotionPropertyType("button")).toBe(true);
	});

	it("keeps user-editable properties syncable", () => {
		expect(isReadOnlyNotionPropertyType("select")).toBe(false);
		expect(isReadOnlyNotionPropertyType("status")).toBe(false);
		expect(isReadOnlyNotionPropertyType("rich_text")).toBe(false);
		expect(isReadOnlyNotionPropertyType("date")).toBe(false);
		expect(isReadOnlyNotionPropertyType("checkbox")).toBe(false);
	});
});

describe("filterSyncablePropertyMappings", () => {
	it("drops read-only properties from bidirectional sync", () => {
		const mappings = filterSyncablePropertyMappings("obsidian-to-notion", [
			BIDIRECTIONAL_MAPPING,
			{
				direction: "bidirectional",
				notionProperty: "Created time",
				obsidianKey: "createdAt",
			},
		], {
			"Created time": "created_time",
			Status: "status",
		});

		expect(mappings).toEqual([BIDIRECTIONAL_MAPPING]);
	});

	it("applies direction filtering before building payloads", () => {
		const mappings = filterSyncablePropertyMappings("obsidian-to-notion", [
			BIDIRECTIONAL_MAPPING,
			{
				direction: "notion-to-obsidian",
				notionProperty: "Remote only",
				obsidianKey: "remoteOnly",
			},
		], {
			"Remote only": "rich_text",
			Status: "status",
		});

		expect(mappings).toEqual([BIDIRECTIONAL_MAPPING]);
	});
});

describe("buildNotionPropertyPayload", () => {
	it("serializes mapped frontmatter into writable Notion property payloads", () => {
		const payload = buildNotionPropertyPayload({
			frontmatter: {
				done: true,
				status: "In progress",
				tags: ["alpha", "beta"],
				title: "Launch sync",
			},
			mappings: [
				{
					direction: "bidirectional",
					notionProperty: "Done",
					obsidianKey: "done",
				},
				BIDIRECTIONAL_MAPPING,
				{
					direction: "bidirectional",
					notionProperty: "Tags",
					obsidianKey: "tags",
				},
				{
					direction: "obsidian-to-notion",
					notionProperty: "Name",
					obsidianKey: "title",
				},
			],
			notionSchema: {
				Done: "checkbox",
				Name: "title",
				Status: "status",
				Tags: "multi_select",
			},
			syncDirection: "obsidian-to-notion",
		});

		expect(payload).toEqual({
			Done: {
				checkbox: true,
				type: "checkbox",
			},
			Name: {
				title: [{ text: { content: "Launch sync" }, type: "text" }],
				type: "title",
			},
			Status: {
				status: { name: "In progress" },
				type: "status",
			},
			Tags: {
				multi_select: [{ name: "alpha" }, { name: "beta" }],
				type: "multi_select",
			},
		});
	});
});

describe("extractObsidianProperties", () => {
	it("pulls writable Notion properties back into frontmatter values", () => {
		const result = extractObsidianProperties({
			mappings: [
				BIDIRECTIONAL_MAPPING,
				{
					direction: "bidirectional",
					notionProperty: "Done",
					obsidianKey: "done",
				},
				{
					direction: "notion-to-obsidian",
					notionProperty: "Planned",
					obsidianKey: "plannedAt",
				},
			],
			notionProperties: {
				"Created time": {
					type: "created_time",
					value: "2026-03-04T10:00:00.000Z",
				},
				Done: {
					type: "checkbox",
					value: true,
				},
				Planned: {
					type: "date",
					value: "2026-03-10",
				},
				Status: {
					type: "status",
					value: "Done",
				},
			},
			syncDirection: "notion-to-obsidian",
		});

		expect(result).toEqual({
			done: true,
			plannedAt: "2026-03-10",
			status: "Done",
		});
	});
});
