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
	listDocuments(folder: string): Promise<LocalDocument[]>;
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

export interface SyncDatabaseProfilesOptions {
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

export async function syncDatabaseProfiles(
	profiles: DatabaseSyncSetting[],
	options: SyncDatabaseProfilesOptions,
): Promise<SyncSummary> {
	const summary = createEmptySummary();

	for (const profile of profiles) {
		if (!profile.enabled || !profile.databaseId.trim()) {
			summary.skipped += 1;
			continue;
		}

		const profileSummary = await syncProfile(profile, options);
		mergeSummary(summary, profileSummary);
	}

	return summary;
}

async function syncProfile(
	profile: DatabaseSyncSetting,
	options: SyncDatabaseProfilesOptions,
): Promise<SyncSummary> {
	const summary = createEmptySummary();
	const snapshot = await options.notionRepository.getDatabaseSnapshot(profile.databaseId);
	const localDocuments = await options.localRepository.listDocuments(profile.folder);
	const remotePagesById = new Map(snapshot.pages.map((page) => [page.id, page]));
	const knownPaths = new Set(localDocuments.map((document) => document.path));
	const linkedRemotePageIds = new Set<string>();

	for (const document of localDocuments) {
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

			linkedRemotePageIds.add(createdPage.id);
			await options.localRepository.upsertDocument(linkDocumentToPage(document, profile, createdPage.id, createdPage.lastEditedTime));
			summary.createdRemotePages += 1;
			continue;
		}

		const remotePage = remotePagesById.get(pageId);
		if (!remotePage) {
			continue;
		}

		linkedRemotePageIds.add(pageId);

		if (shouldPushLocalChanges(document, remotePage, profile, snapshot.schema)) {
			const updatedPage = await options.notionRepository.updatePage({
				markdown: document.content,
				pageId,
				properties,
				title: document.title,
				titleProperty: profile.titleProperty,
			});
			remotePagesById.set(updatedPage.id, updatedPage);
			summary.updatedRemotePages += 1;
			continue;
		}

		if (shouldPullRemoteChanges(document, remotePage, profile, snapshot.schema)) {
			await options.localRepository.upsertDocument(
				mergeRemoteIntoLocalDocument(document, remotePage, profile),
			);
			summary.updatedLocalDocuments += 1;
			continue;
		}

		summary.skipped += 1;
	}

	for (const remotePage of snapshot.pages) {
		if (linkedRemotePageIds.has(remotePage.id)) {
			continue;
		}

		const path = buildImportedDocumentPath(profile.folder, remotePage.title, knownPaths);
		knownPaths.add(path);
		await options.localRepository.upsertDocument(
			createLocalDocumentFromRemotePage(path, profile, remotePage),
		);
		summary.createdLocalDocuments += 1;
	}

	return summary;
}

function buildImportedDocumentPath(
	folder: string,
	title: string,
	knownPaths: Set<string>,
): string {
	const baseName = sanitizeImportedFileName(title);
	let path = `${folder}/${baseName}.md`;
	let counter = 2;

	while (knownPaths.has(path)) {
		path = `${folder}/${baseName}-${counter}.md`;
		counter += 1;
	}

	return path;
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

function createLocalDocumentFromRemotePage(
	path: string,
	profile: DatabaseSyncSetting,
	page: NotionPage,
): LocalDocument {
	return {
		content: page.markdown,
		frontmatter: {
			...extractObsidianProperties({
				mappings: profile.propertyMappings,
				notionProperties: page.properties,
				syncDirection: "notion-to-obsidian",
			}),
			[profile.notionPageIdField]: page.id,
		},
		lastEditedTime: page.lastEditedTime,
		path,
		title: page.title,
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
	schema: Record<string, string>,
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
	};
}

function mergeSummary(target: SyncSummary, source: SyncSummary): void {
	target.createdLocalDocuments += source.createdLocalDocuments;
	target.createdRemotePages += source.createdRemotePages;
	target.skipped += source.skipped;
	target.updatedLocalDocuments += source.updatedLocalDocuments;
	target.updatedRemotePages += source.updatedRemotePages;
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

	return (
		document.content !== page.markdown
		|| hasDifferentMappedProperties(
			getComparableRemoteState(page, profile, schema),
			Object.fromEntries(
				Object.entries(getComparableRemoteState(page, profile, schema)).map(([key]) => [
					key,
					document.frontmatter[key],
				]),
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

	return (
		document.content !== page.markdown
		|| hasDifferentMappedProperties(
			getComparableLocalState(document, profile, schema),
			Object.fromEntries(
				Object.entries(getComparableLocalState(document, profile, schema)).map(([name]) => [
					name,
					page.properties[name]?.value,
				]),
			),
		)
	);
}

function compareTimestamps(left: string, right: string): number {
	return left.localeCompare(right);
}

function sanitizeImportedFileName(value: string): string {
	const sanitized = Array.from(value.trim())
		.map((character) => isInvalidFileNameCharacter(character) ? " " : character)
		.join("")
		.trim()
		.replace(/\s+/g, " ")
		.replace(/\.+$/g, "")
		.trim();

	return sanitized || "Untitled";
}

function isInvalidFileNameCharacter(character: string): boolean {
	return character <= "\u001f" || "\\/:*?\"<>|".includes(character);
}
