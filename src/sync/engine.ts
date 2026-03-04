import type { DatabaseSyncSetting } from "../settings";
import { buildNotionPropertyPayload, extractObsidianProperties } from "./notion-properties";

export interface LocalDocument {
	content: string;
	frontmatter: Record<string, unknown>;
	lastEditedTime: string;
	path: string;
	title: string;
}

export interface LocalDocumentRepository {
	readDocument(path: string): Promise<LocalDocument | null>;
	upsertDocument(document: LocalDocument): Promise<void>;
}

export interface NotionPage {
	id: string;
	lastEditedTime: string;
	markdown: string;
	properties: Record<string, { type: string; value: unknown }>;
	title: string;
}

export interface NotionDatabaseSnapshot {
	databaseId: string;
	pages: NotionPage[];
	schema: Record<string, string>;
}

export interface NotionRepository {
	getDatabaseSnapshot(databaseId: string): Promise<NotionDatabaseSnapshot>;
	createPage(input: {
		databaseId: string;
		markdown: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage>;
	updatePage(input: {
		markdown: string;
		pageId: string;
		properties: Record<string, Record<string, unknown>>;
		title: string;
		titleProperty: string;
	}): Promise<NotionPage>;
}

export interface SyncDatabaseFileOptions {
	localRepository: LocalDocumentRepository;
	notionRepository: NotionRepository;
}

export interface SyncSummary {
	createdLocalDocuments: number;
	createdRemotePages: number;
	skipped: number;
	updatedLocalDocuments: number;
	updatedRemotePages: number;
}

export async function syncDatabaseFile(
	profile: DatabaseSyncSetting,
	path: string,
	options: SyncDatabaseFileOptions,
): Promise<SyncSummary> {
	const summary = createEmptySummary();
	if (!profile.databaseId.trim()) {
		summary.skipped += 1;
		return summary;
	}

	const document = await options.localRepository.readDocument(path);
	if (!document) {
		summary.skipped += 1;
		return summary;
	}

	const snapshot = await options.notionRepository.getDatabaseSnapshot(profile.databaseId);
	const remotePagesById = new Map(snapshot.pages.map((page) => [page.id, page]));
	const pageId = getLinkedPageId(document, profile);
	const properties = buildRemotePayload(document, profile, snapshot.schema);

	if (!pageId || !remotePagesById.has(pageId)) {
		const createdPage = await options.notionRepository.createPage({
			databaseId: snapshot.databaseId,
			markdown: document.content,
			properties,
			title: document.title,
			titleProperty: profile.titleProperty,
		});

		await options.localRepository.upsertDocument(
			linkDocumentToPage(document, profile, createdPage.id, createdPage.lastEditedTime),
		);
		summary.createdRemotePages += 1;
		return summary;
	}

	const remotePage = remotePagesById.get(pageId);
	if (!remotePage) {
		summary.skipped += 1;
		return summary;
	}

	if (shouldPushLocalChanges(document, remotePage, profile, snapshot.schema)) {
		await options.notionRepository.updatePage({
			markdown: document.content,
			pageId,
			properties,
			title: document.title,
			titleProperty: profile.titleProperty,
		});
		summary.updatedRemotePages += 1;
		return summary;
	}

	if (shouldPullRemoteChanges(document, remotePage, profile, snapshot.schema)) {
		await options.localRepository.upsertDocument(
			mergeRemoteIntoLocalDocument(document, remotePage, profile),
		);
		summary.updatedLocalDocuments += 1;
		return summary;
	}

	summary.skipped += 1;
	return summary;
}

function buildRemotePayload(
	document: LocalDocument,
	profile: DatabaseSyncSetting,
	schema: Record<string, string>,
): Record<string, Record<string, unknown>> {
	return {
		...buildNotionPropertyPayload({
			frontmatter: document.frontmatter,
			mappings: profile.propertyMappings,
			notionSchema: schema,
			syncDirection: "obsidian-to-notion",
		}),
		[profile.titleProperty]: {
			title: [{
				text: {
					content: document.title,
				},
				type: "text",
			}],
			type: "title",
		},
	};
}

function createEmptySummary(): SyncSummary {
	return {
		createdLocalDocuments: 0,
		createdRemotePages: 0,
		skipped: 0,
		updatedLocalDocuments: 0,
		updatedRemotePages: 0,
	};
}

function getComparableLocalState(
	document: LocalDocument,
	profile: DatabaseSyncSetting,
	schema: Record<string, string>,
): Record<string, unknown> {
	const writableProperties = buildNotionPropertyPayload({
		frontmatter: document.frontmatter,
		mappings: profile.propertyMappings,
		notionSchema: schema,
		syncDirection: "obsidian-to-notion",
	});

	return Object.fromEntries(
		Object.entries(writableProperties).map(([name, property]) => {
			const propertyType = String(property.type);
			return [name, normalizeComparableRemoteValue(propertyType, property[propertyType])];
		}),
	);
}

function getComparableRemoteState(
	page: NotionPage,
	profile: DatabaseSyncSetting,
): Record<string, unknown> {
	const frontmatter = extractObsidianProperties({
		mappings: profile.propertyMappings,
		notionProperties: page.properties,
		syncDirection: "notion-to-obsidian",
	});

	return Object.fromEntries(
		Object.keys(frontmatter).map((key) => [key, frontmatter[key]]),
	);
}

function getLinkedPageId(
	document: LocalDocument,
	profile: DatabaseSyncSetting,
): string | null {
	const value = document.frontmatter[profile.notionPageIdField];
	return typeof value === "string" && value.trim() ? value : null;
}

function hasDifferentMappedProperties(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
): boolean {
	const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
	for (const key of keys) {
		if (!isEqual(left[key], right[key])) {
			return true;
		}
	}

	return false;
}

function isEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function linkDocumentToPage(
	document: LocalDocument,
	profile: DatabaseSyncSetting,
	pageId: string,
	lastEditedTime: string,
): LocalDocument {
	return {
		...document,
		frontmatter: {
			...document.frontmatter,
			[profile.notionPageIdField]: pageId,
		},
		lastEditedTime,
	};
}

function mergeRemoteIntoLocalDocument(
	document: LocalDocument,
	page: NotionPage,
	profile: DatabaseSyncSetting,
): LocalDocument {
	return {
		...document,
		content: page.markdown,
		frontmatter: {
			...document.frontmatter,
			...extractObsidianProperties({
				mappings: profile.propertyMappings,
				notionProperties: page.properties,
				syncDirection: "notion-to-obsidian",
			}),
			[profile.notionPageIdField]: page.id,
		},
		lastEditedTime: page.lastEditedTime,
		title: page.title,
	};
}

function normalizeComparableRemoteValue(type: string, value: unknown): unknown {
	switch (type) {
		case "multi_select":
			return Array.isArray(value)
				? value.map((entry) => String((entry as { name: string }).name))
				: [];
		case "select":
		case "status":
			return typeof value === "object" && value !== null
				? (value as { name?: string }).name ?? null
				: null;
		case "title":
		case "rich_text":
			return Array.isArray(value)
				? String((((value[0] as { text?: { content?: string } })?.text)?.content) ?? "")
				: "";
		default:
			return value;
	}
}

function shouldPullRemoteChanges(
	document: LocalDocument,
	page: NotionPage,
	profile: DatabaseSyncSetting,
	schema: Record<string, string>,
): boolean {
	if (compareTimestamps(page.lastEditedTime, document.lastEditedTime) <= 0) {
		return false;
	}

	const remoteState = getComparableRemoteState(page, profile);
	return (
		document.content !== page.markdown
		|| hasDifferentMappedProperties(
			remoteState,
			Object.fromEntries(
				Object.keys(remoteState).map((key) => [key, document.frontmatter[key]]),
			),
		)
	);
}

function shouldPushLocalChanges(
	document: LocalDocument,
	page: NotionPage,
	profile: DatabaseSyncSetting,
	schema: Record<string, string>,
): boolean {
	if (compareTimestamps(document.lastEditedTime, page.lastEditedTime) <= 0) {
		return false;
	}

	const localState = getComparableLocalState(document, profile, schema);
	return (
		document.content !== page.markdown
		|| hasDifferentMappedProperties(
			localState,
			Object.fromEntries(
				Object.keys(localState).map((name) => [name, page.properties[name]?.value]),
			),
		)
	);
}

function compareTimestamps(left: string, right: string): number {
	return left.localeCompare(right);
}
