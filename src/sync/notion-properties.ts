import type { PropertyMappingSetting, SyncDirection } from "../settings";

export type NotionPropertyType = string;

export interface NotionPropertySnapshot {
	type: NotionPropertyType;
	value: unknown;
}

export interface BuildNotionPropertyPayloadOptions {
	frontmatter: Record<string, unknown>;
	mappings: PropertyMappingSetting[];
	notionSchema: Record<string, NotionPropertyType>;
	syncDirection: Exclude<SyncDirection, "bidirectional">;
}

export interface ExtractObsidianPropertiesOptions {
	mappings: PropertyMappingSetting[];
	notionProperties: Record<string, NotionPropertySnapshot>;
	syncDirection: Exclude<SyncDirection, "bidirectional">;
}

type NotionPropertyPayloadValue =
	| Array<Record<string, unknown>>
	| Array<{ name: string }>
	| Record<string, unknown>
	| string
	| number
	| boolean;

const READ_ONLY_PROPERTY_TYPES = new Set<NotionPropertyType>([
	"button",
	"created_by",
	"created_time",
	"formula",
	"last_edited_by",
	"last_edited_time",
	"rollup",
	"unique_id",
	"verification",
]);

export function isReadOnlyNotionPropertyType(type: NotionPropertyType): boolean {
	return READ_ONLY_PROPERTY_TYPES.has(type);
}

export function filterSyncablePropertyMappings(
	syncDirection: Exclude<SyncDirection, "bidirectional">,
	mappings: PropertyMappingSetting[],
	notionSchema: Record<string, NotionPropertyType>,
): PropertyMappingSetting[] {
	return mappings.filter((mapping) => {
		if (!supportsDirection(mapping.direction, syncDirection)) {
			return false;
		}

		const propertyType = notionSchema[mapping.notionProperty];
		if (!propertyType) {
			return false;
		}

		return !isReadOnlyNotionPropertyType(propertyType);
	});
}

export function buildNotionPropertyPayload(
	options: BuildNotionPropertyPayloadOptions,
): Record<string, Record<string, unknown>> {
	return filterSyncablePropertyMappings(
		options.syncDirection,
		options.mappings,
		options.notionSchema,
	).reduce<Record<string, Record<string, unknown>>>((payload, mapping) => {
		const value = options.frontmatter[mapping.obsidianKey];
		if (value === undefined) {
			return payload;
		}

		const propertyType = options.notionSchema[mapping.notionProperty];
		if (!propertyType) {
			return payload;
		}

		const notionValue = serializeNotionValue(propertyType, value);
		if (notionValue === null) {
			return payload;
		}

		payload[mapping.notionProperty] = {
			type: propertyType,
			[propertyType]: notionValue,
		};
		return payload;
	}, {});
}

export function extractObsidianProperties(
	options: ExtractObsidianPropertiesOptions,
): Record<string, unknown> {
	return options.mappings.reduce<Record<string, unknown>>((frontmatter, mapping) => {
		if (!supportsDirection(mapping.direction, options.syncDirection)) {
			return frontmatter;
		}

		const property = options.notionProperties[mapping.notionProperty];
		if (!property || isReadOnlyNotionPropertyType(property.type)) {
			return frontmatter;
		}

		frontmatter[mapping.obsidianKey] = normalizeObsidianValue(property);
		return frontmatter;
	}, {});
}

function normalizeDateValue(value: unknown): string | { start: string; end?: string } | null {
	if (typeof value === "string") {
		return {
			start: value,
		};
	}

	if (
		typeof value === "object"
		&& value !== null
		&& "start" in value
		&& typeof value.start === "string"
	) {
		const end = "end" in value && typeof value.end === "string" ? value.end : undefined;
		return end ? { end, start: value.start } : { start: value.start };
	}

	return null;
}

function normalizeObsidianValue(property: NotionPropertySnapshot): unknown {
	switch (property.type) {
		case "multi_select":
			return Array.isArray(property.value) ? property.value : [];
		default:
			return property.value;
	}
}

function serializeNotionValue(
	propertyType: NotionPropertyType,
	value: unknown,
): NotionPropertyPayloadValue | null {
	switch (propertyType) {
		case "checkbox":
			return typeof value === "boolean" ? value : Boolean(value);
		case "date":
			return normalizeDateValue(value);
		case "email":
		case "phone_number":
		case "url":
			return typeof value === "string" ? value : null;
		case "multi_select":
			return normalizeStringArray(value)?.map((item) => ({ name: item })) ?? null;
		case "number":
			return typeof value === "number" ? value : null;
		case "rich_text":
			return createRichText(value);
		case "select":
		case "status":
			return typeof value === "string" ? { name: value } : null;
		case "title":
			return createRichText(value);
		default:
			return null;
	}
}

function createRichText(value: unknown): Array<Record<string, unknown>> | null {
	if (typeof value !== "string") {
		return null;
	}

	return [{
		text: {
			content: value,
		},
		type: "text",
	}];
}

function normalizeStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	return value.filter((item): item is string => typeof item === "string");
}

function supportsDirection(
	mappingDirection: SyncDirection,
	targetDirection: Exclude<SyncDirection, "bidirectional">,
): boolean {
	return mappingDirection === "bidirectional" || mappingDirection === targetDirection;
}
