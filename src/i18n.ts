import { getLanguage } from "obsidian";

export type SupportedLocale = "en" | "zh-CN";

export interface I18nStrings {
	activeNoteCouldNotBeRead: string;
	addMapping: string;
	addDatabaseProfile: string;
	addProfile: string;
	addPropertyMapping: string;
	commandPullActiveNoteFromNotion: string;
	commandSyncActiveNoteDatabase: string;
	configureTokenFirst: string;
	createAnotherDatabaseProfile: string;
	databaseProfileName(index: number): string;
	databaseIdPlaceholder: string;
	databaseProfiles: string;
	enterDatabaseIdBeforeFetchingProperties: string;
	failedToFetchNotionProperties: string;
	failedToPull(filePath: string, databaseName: string): string;
	failedToSync(filePath: string, databaseName: string): string;
	pullingInProgress(databaseName: string): string;
	featureFetchProperties: string;
	fetchedNotionProperties(count: number): string;
	frontmatterKeyPlaceholder: string;
	integration: string;
	integrationToken: string;
	linkNoteBeforePulling: string;
	mapFrontmatterKeyToNotionProperty: string;
	mapping(index: number): string;
	noConfiguredDatabases: string;
	noNotionPropertiesFound: string;
	notionDatabaseId: string;
	notionDatabaseIdDescription: string;
	openMarkdownNote: string;
	pageIdFrontmatterKey: string;
	pageIdFrontmatterKeyDescription: string;
	pasteIntegrationToken: string;
	profileName: string;
	profileNameDescription: string;
	propertyMappings: string;
	pullSummary(databaseName: string): string;
	removeMapping: string;
	removeProfile: string;
	ribbonSyncActiveNoteDatabase: string;
	secretToken: string;
	selectDatabasePlaceholder: string;
	selectNotionProperty: string;
	selectedDatabaseFallback: string;
	selectedProfileUnavailable: string;
	settingsAndNoticesDescription: string;
	summary(prefix: string, createdRemote: number, createdLocal: number, updatedRemote: number, updatedLocal: number): string;
	syncingInProgress(databaseName: string): string;
	syncSummary(databaseName: string): string;
	titleProperty: string;
	titlePropertyDescription: string;
}

const EN_STRINGS: I18nStrings = {
	activeNoteCouldNotBeRead: "Active Markdown note could not be read from the vault.",
	addMapping: "Add mapping",
	addDatabaseProfile: "Add database profile",
	addProfile: "Add profile",
	addPropertyMapping: "Add property mapping",
	commandPullActiveNoteFromNotion: "Pull active note from Notion",
	commandSyncActiveNoteDatabase: "Sync active note database",
	configureTokenFirst: "Configure a Notion integration token in plugin settings first.",
	createAnotherDatabaseProfile: "Create another Notion database profile.",
	databaseProfileName: (index) => `Database ${index}`,
	databaseIdPlaceholder: "Database ID",
	databaseProfiles: "Database profiles",
	enterDatabaseIdBeforeFetchingProperties: "Enter a Notion database ID before fetching properties.",
	failedToFetchNotionProperties: "Failed to fetch Notion properties.",
	failedToPull: (filePath, databaseName) => `Failed to pull ${filePath} from ${databaseName}`,
	failedToSync: (filePath, databaseName) => `Failed to sync ${filePath} with ${databaseName}`,
	pullingInProgress: (databaseName) => `Pulling ${databaseName}...`,
	featureFetchProperties: "Fetch properties",
	fetchedNotionProperties: (count) => `Fetched ${count} Notion properties.`,
	frontmatterKeyPlaceholder: "Frontmatter key",
	integration: "Integration",
	integrationToken: "Integration token",
	linkNoteBeforePulling: "Link this note to a Notion page before pulling from Notion.",
	mapFrontmatterKeyToNotionProperty: "Map a frontmatter key to a Notion property.",
	mapping: (index) => `Mapping ${index}`,
	noConfiguredDatabases: "Add at least one Notion database in plugin settings first.",
	noNotionPropertiesFound: "No Notion properties were found for this database.",
	notionDatabaseId: "Notion database ID",
	notionDatabaseIdDescription: "Use the target data source or database ID from Notion.",
	openMarkdownNote: "Open a Markdown note to continue.",
	pageIdFrontmatterKey: "Page ID frontmatter key",
	pageIdFrontmatterKeyDescription: "Frontmatter key used to store the linked Notion page ID.",
	pasteIntegrationToken: "Paste your Notion internal integration token.",
	profileName: "Profile name",
	profileNameDescription: "Shown in settings and notices.",
	propertyMappings: "Property mappings",
	pullSummary: (databaseName) => `Pulled ${databaseName}`,
	removeMapping: "Remove mapping",
	removeProfile: "Remove profile",
	ribbonSyncActiveNoteDatabase: "Sync active note database",
	secretToken: "Secret token",
	selectDatabasePlaceholder: "Select a Notion database",
	selectNotionProperty: "Select a property",
	selectedDatabaseFallback: "selected database",
	selectedProfileUnavailable: "Selected Notion database profile is not available.",
	settingsAndNoticesDescription: "Shown in settings and notices.",
	summary: (prefix, createdRemote, createdLocal, updatedRemote, updatedLocal) =>
		`${prefix}: +${createdRemote} remote, +${createdLocal} local, ~${updatedRemote} remote, ~${updatedLocal} local.`,
	syncingInProgress: (databaseName) => `Syncing ${databaseName}...`,
	syncSummary: (databaseName) => `Synced ${databaseName}`,
	titleProperty: "Title property",
	titlePropertyDescription: "Notion title property used when creating or updating pages.",
};

const ZH_CN_STRINGS: I18nStrings = {
	activeNoteCouldNotBeRead: "无法从仓库中读取当前 Markdown 笔记。",
	addMapping: "添加映射",
	addDatabaseProfile: "添加数据库配置",
	addProfile: "添加配置",
	addPropertyMapping: "添加属性映射",
	commandPullActiveNoteFromNotion: "从 Notion 拉取当前笔记",
	commandSyncActiveNoteDatabase: "同步当前笔记数据库",
	configureTokenFirst: "请先在插件设置中配置 Notion 集成令牌。",
	createAnotherDatabaseProfile: "再创建一个 Notion 数据库配置。",
	databaseProfileName: (index) => `数据库 ${index}`,
	databaseIdPlaceholder: "数据库 ID",
	databaseProfiles: "数据库配置",
	enterDatabaseIdBeforeFetchingProperties: "请先填写 Notion 数据库 ID，再拉取属性。",
	failedToFetchNotionProperties: "拉取 Notion 属性失败。",
	failedToPull: (filePath, databaseName) => `从 ${databaseName} 拉取 ${filePath} 失败`,
	failedToSync: (filePath, databaseName) => `同步 ${filePath} 到 ${databaseName} 失败`,
	pullingInProgress: (databaseName) => `正在从 ${databaseName} 拉取...`,
	featureFetchProperties: "拉取属性",
	fetchedNotionProperties: (count) => `已拉取 ${count} 个 Notion 属性。`,
	frontmatterKeyPlaceholder: "Frontmatter 键",
	integration: "集成",
	integrationToken: "集成令牌",
	linkNoteBeforePulling: "请先将此笔记关联到 Notion 页面，再执行拉取。",
	mapFrontmatterKeyToNotionProperty: "将 frontmatter 键映射到 Notion 属性。",
	mapping: (index) => `映射 ${index}`,
	noConfiguredDatabases: "请先在插件设置中至少添加一个 Notion 数据库配置。",
	noNotionPropertiesFound: "这个数据库没有可用的 Notion 属性。",
	notionDatabaseId: "Notion 数据库 ID",
	notionDatabaseIdDescription: "填写目标数据源或数据库 ID。",
	openMarkdownNote: "请先打开一个 Markdown 笔记。",
	pageIdFrontmatterKey: "页面 ID Frontmatter 键",
	pageIdFrontmatterKeyDescription: "用于保存关联 Notion 页面 ID 的 frontmatter 键。",
	pasteIntegrationToken: "粘贴你的 Notion 内部集成令牌。",
	profileName: "配置名称",
	profileNameDescription: "用于设置页和通知中的显示名称。",
	propertyMappings: "属性映射",
	pullSummary: (databaseName) => `已从 ${databaseName} 拉取`,
	removeMapping: "删除映射",
	removeProfile: "删除配置",
	ribbonSyncActiveNoteDatabase: "同步当前笔记数据库",
	secretToken: "密钥令牌",
	selectDatabasePlaceholder: "选择一个 Notion 数据库",
	selectNotionProperty: "选择属性",
	selectedDatabaseFallback: "所选数据库",
	selectedProfileUnavailable: "所选 Notion 数据库配置不可用。",
	settingsAndNoticesDescription: "用于设置页和通知中的显示名称。",
	summary: (prefix, createdRemote, createdLocal, updatedRemote, updatedLocal) =>
		`${prefix}：远端新增 ${createdRemote}，本地新增 ${createdLocal}，远端更新 ${updatedRemote}，本地更新 ${updatedLocal}。`,
	syncingInProgress: (databaseName) => `正在同步 ${databaseName}...`,
	syncSummary: (databaseName) => `已同步 ${databaseName}`,
	titleProperty: "标题属性",
	titlePropertyDescription: "创建或更新页面时使用的 Notion 标题属性。",
};

export function resolveLocale(language: string | undefined): SupportedLocale {
	if (!language) {
		return "en";
	}

	return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function getStrings(language = getLanguage()): I18nStrings {
	return resolveLocale(language) === "zh-CN" ? ZH_CN_STRINGS : EN_STRINGS;
}
