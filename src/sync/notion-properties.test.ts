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

	it("preserves false and zero values instead of dropping them as empty payloads", () => {
		const payload = buildNotionPropertyPayload({
			frontmatter: {
				done: false,
				estimate: 0,
			},
			mappings: [
				{
					direction: "bidirectional",
					notionProperty: "Done",
					obsidianKey: "done",
				},
				{
					direction: "bidirectional",
					notionProperty: "Estimate",
					obsidianKey: "estimate",
				},
			],
			notionSchema: {
				Done: "checkbox",
				Estimate: "number",
			},
			syncDirection: "obsidian-to-notion",
		});

		expect(payload).toEqual({
			Done: {
				checkbox: false,
				type: "checkbox",
			},
			Estimate: {
				number: 0,
				type: "number",
			},
		});
	});

	it("supports rich text, select, date and url payload serialization", () => {
		const payload = buildNotionPropertyPayload({
			frontmatter: {
				dueDate: {
					end: "2026-03-05",
					start: "2026-03-04",
				},
				referenceUrl: "https://example.com",
				summary: "Hello",
				type: "Feature",
			},
			mappings: [
				{
					direction: "bidirectional",
					notionProperty: "Due date",
					obsidianKey: "dueDate",
				},
				{
					direction: "bidirectional",
					notionProperty: "Reference",
					obsidianKey: "referenceUrl",
				},
				{
					direction: "bidirectional",
					notionProperty: "Summary",
					obsidianKey: "summary",
				},
				{
					direction: "bidirectional",
					notionProperty: "Type",
					obsidianKey: "type",
				},
			],
			notionSchema: {
				"Due date": "date",
				Reference: "url",
				Summary: "rich_text",
				Type: "select",
			},
			syncDirection: "obsidian-to-notion",
		});

		expect(payload).toEqual({
			"Due date": {
				date: {
					end: "2026-03-05",
					start: "2026-03-04",
				},
				type: "date",
			},
			Reference: {
				type: "url",
				url: "https://example.com",
			},
			Summary: {
				rich_text: [{ text: { content: "Hello" }, type: "text" }],
				type: "rich_text",
			},
			Type: {
				select: { name: "Feature" },
				type: "select",
			},
		});
	});

	it("drops unmappable values and unknown schema properties", () => {
		const payload = buildNotionPropertyPayload({
			frontmatter: {
				brokenTags: "not-an-array",
				estimate: "not-a-number",
			},
			mappings: [
				{
					direction: "bidirectional",
					notionProperty: "Estimate",
					obsidianKey: "estimate",
				},
				{
					direction: "bidirectional",
					notionProperty: "Missing",
					obsidianKey: "missing",
				},
				{
					direction: "bidirectional",
					notionProperty: "Tags",
					obsidianKey: "brokenTags",
				},
			],
			notionSchema: {
				Estimate: "number",
				Tags: "multi_select",
			},
			syncDirection: "obsidian-to-notion",
		});

		expect(payload).toEqual({});
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

	it("normalizes multi-select values and respects one-way mappings", () => {
		const result = extractObsidianProperties({
			mappings: [
				{
					direction: "obsidian-to-notion",
					notionProperty: "Push only",
					obsidianKey: "pushOnly",
				},
				{
					direction: "bidirectional",
					notionProperty: "Tags",
					obsidianKey: "tags",
				},
			],
			notionProperties: {
				"Push only": {
					type: "rich_text",
					value: "ignored",
				},
				Tags: {
					type: "multi_select",
					value: ["alpha", "beta"],
				},
			},
			syncDirection: "notion-to-obsidian",
		});

		expect(result).toEqual({
			tags: ["alpha", "beta"],
		});
	});
});
