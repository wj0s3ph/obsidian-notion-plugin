export type SyncDirection =
	| "bidirectional"
	| "notion-to-obsidian"
	| "obsidian-to-notion";

export interface PropertyMappingSetting {
	direction: SyncDirection;
	notionProperty: string;
	obsidianKey: string;
}

export interface DatabaseSyncSetting {
	id: string;
	name: string;
	enabled: boolean;
	folder: string;
	databaseId: string;
	notionPageIdField: string;
	propertyMappings: PropertyMappingSetting[];
	syncIntervalSeconds: number;
	titleProperty: string;
}

export interface NotionSyncPluginSettings {
	notionToken: string;
	syncOnStartup: boolean;
	databases: DatabaseSyncSetting[];
}

export interface PersistedPropertyMappingSetting {
	direction?: string;
	notionProperty?: string;
	obsidianKey?: string;
}

export interface PersistedDatabaseSyncSetting {
	id?: string;
	name?: string;
	enabled?: boolean;
	folder?: string;
	databaseId?: string;
	notionPageIdField?: string;
	propertyMappings?: PersistedPropertyMappingSetting[];
	syncIntervalSeconds?: number;
	titleProperty?: string;
}

export interface PersistedPluginSettings {
	notionToken?: string;
	syncOnStartup?: boolean;
	databases?: PersistedDatabaseSyncSetting[];
}

const DEFAULT_SYNC_INTERVAL_SECONDS = 300;
const DEFAULT_TITLE_PROPERTY = "Name";
const DEFAULT_NOTION_PAGE_ID_FIELD = "notionPageId";

export const DEFAULT_SETTINGS: NotionSyncPluginSettings = {
	databases: [],
	notionToken: "",
	syncOnStartup: true,
};

export function createDefaultDatabaseConfig(name = "New database"): DatabaseSyncSetting {
	return {
		databaseId: "",
		enabled: false,
		folder: "",
		id: createConfigId(),
		name,
		notionPageIdField: DEFAULT_NOTION_PAGE_ID_FIELD,
		propertyMappings: [],
		syncIntervalSeconds: DEFAULT_SYNC_INTERVAL_SECONDS,
		titleProperty: DEFAULT_TITLE_PROPERTY,
	};
}

export function normalizeSettings(
	settings: PersistedPluginSettings | undefined,
): NotionSyncPluginSettings {
	return {
		databases: (settings?.databases ?? []).map(normalizeDatabaseConfig),
		notionToken: settings?.notionToken ?? DEFAULT_SETTINGS.notionToken,
		syncOnStartup: settings?.syncOnStartup ?? DEFAULT_SETTINGS.syncOnStartup,
	};
}

function createConfigId(): string {
	return `database-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSyncDirection(value: string | undefined): value is SyncDirection {
	return (
		value === "bidirectional"
		|| value === "notion-to-obsidian"
		|| value === "obsidian-to-notion"
	);
}

function normalizeDatabaseConfig(
	config: PersistedDatabaseSyncSetting,
): DatabaseSyncSetting {
	const defaults = createDefaultDatabaseConfig(config.name ?? "New database");

	return {
		...defaults,
		databaseId: config.databaseId ?? defaults.databaseId,
		enabled: config.enabled ?? defaults.enabled,
		folder: config.folder ?? defaults.folder,
		id: config.id ?? defaults.id,
		name: config.name ?? defaults.name,
		notionPageIdField: config.notionPageIdField ?? defaults.notionPageIdField,
		propertyMappings: normalizePropertyMappings(config.propertyMappings),
		syncIntervalSeconds: config.syncIntervalSeconds ?? defaults.syncIntervalSeconds,
		titleProperty: config.titleProperty ?? defaults.titleProperty,
	};
}

function normalizePropertyMappings(
	propertyMappings: PersistedPropertyMappingSetting[] | undefined,
): PropertyMappingSetting[] {
	return (propertyMappings ?? [])
		.flatMap((mapping) => {
			const obsidianKey = mapping.obsidianKey?.trim();
			const notionProperty = mapping.notionProperty?.trim();
			const direction = mapping.direction?.trim();

			if (!obsidianKey || !notionProperty || !isSyncDirection(direction ?? "bidirectional")) {
				if (!obsidianKey || !notionProperty) {
					return [];
				}

				if (direction !== undefined) {
					return [];
				}
			}

			return [{
				direction: direction && isSyncDirection(direction) ? direction : "bidirectional",
				notionProperty,
				obsidianKey,
			}];
		});
}
