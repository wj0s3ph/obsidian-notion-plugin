/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseSyncSetting } from "./settings";
import type { SyncFileResult } from "./sync/sync-service";

const addCommand = vi.fn();
const addRibbonIcon = vi.fn();
const addSettingTab = vi.fn();
const registerEvent = vi.fn();
const registerInterval = vi.fn();
const notices: string[] = [];
const hiddenNotices: string[] = [];
const commands: Array<Record<string, unknown>> = [];
const ribbons: Array<{ callback: () => void; icon: string; title: string }> = [];

vi.mock("obsidian", () => {
	class Notice {
		private message = "";

		constructor(message?: string) {
			this.message = message ?? "";
			if (message) {
				notices.push(message);
			}
		}

		hide(): void {
			if (this.message) {
				hiddenNotices.push(this.message);
			}
		}

		setMessage(message: string): this {
			this.message = message;
			notices.push(message);
			return this;
		}
	}

	class Plugin {
		app: unknown;

		constructor(app?: unknown) {
			this.app = app;
		}

		addCommand(command: Record<string, unknown>): void {
			commands.push(command);
			addCommand(command);
		}

		addRibbonIcon(icon: string, title: string, callback: () => void): void {
			ribbons.push({ callback, icon, title });
			addRibbonIcon(icon, title, callback);
		}

		addSettingTab(tab: unknown): void {
			addSettingTab(tab);
		}

		loadData(): Promise<unknown> {
			return Promise.resolve({
				databases: [{
					databaseId: "db-1",
					id: "tasks",
					name: "Tasks",
				}],
				notionToken: "secret_test",
			});
		}

		registerEvent(): void {
			registerEvent();
		}

		registerInterval(): void {
			registerInterval();
		}

		saveData(): Promise<void> {
			return Promise.resolve();
		}
	}

	class PluginSettingTab {
		app: unknown;
		containerEl = document.createElement("div");

		constructor(app: unknown) {
			this.app = app;
		}
	}

	class Setting {
		constructor(_containerEl: HTMLElement) {}

		addButton(): this {
			return this;
		}

		addDropdown(): this {
			return this;
		}

		addExtraButton(): this {
			return this;
		}

		addText(): this {
			return this;
		}

		addToggle(): this {
			return this;
		}

		setDesc(): this {
			return this;
		}

		setHeading(): this {
			return this;
		}

		setName(): this {
			return this;
		}
	}

	class FuzzySuggestModal {
		constructor(_app: unknown) {}

		open(): void {}

		onClose(): void {}

		setPlaceholder(): void {}
	}

	return {
		FuzzySuggestModal,
		getLanguage: () => "en",
		Notice,
		Plugin,
		PluginSettingTab,
		Setting,
	};
});

import NotionSyncPlugin from "./main";

class TestPlugin extends NotionSyncPlugin {
	constructor(app: unknown) {
		super(app as never, {} as never);
	}

	selection = {
		databaseId: "db-1",
		id: "tasks",
		name: "Tasks",
		notionPageIdField: "notionPageId",
		notionProperties: [],
		propertyMappings: [],
		titleProperty: "Name",
	};
	chooseDatabaseMock = vi.fn((_databases: DatabaseSyncSetting[]) => Promise.resolve(this.selection));
	syncResult: SyncFileResult = {
		status: "success",
		summary: {
			createdLocalDocuments: 0,
			createdRemotePages: 1,
			skipped: 0,
			updatedLocalDocuments: 0,
			updatedRemotePages: 0,
		},
	};
	databaseSchema = {
		Name: "title",
		Published: "date",
		Slug: "rich_text",
	};

	syncFile = vi.fn(() => Promise.resolve(this.syncResult));
	pullFile = vi.fn(() => Promise.resolve(this.syncResult));
	saveSettingsMock = vi.fn(() => Promise.resolve(undefined));

	protected override chooseDatabase(_databases: DatabaseSyncSetting[]) {
		return this.chooseDatabaseMock(_databases);
	}

	protected override createSyncService() {
		return {
			pullFile: this.pullFile,
			syncFile: this.syncFile,
		} as never;
	}

	protected override createNotionRepository() {
		return {
			getDatabaseSchema: vi.fn(() => Promise.resolve(this.databaseSchema)),
		} as never;
	}

	override async saveSettings(): Promise<void> {
		await this.saveSettingsMock();
	}
}

describe("NotionSyncPlugin", () => {
	beforeEach(() => {
		addCommand.mockClear();
		addRibbonIcon.mockClear();
		addSettingTab.mockClear();
		registerEvent.mockClear();
		registerInterval.mockClear();
		notices.length = 0;
		hiddenNotices.length = 0;
		commands.length = 0;
		ribbons.length = 0;
	});

	it("loads without automatic sync hooks and wires a ribbon action for manual sync", async () => {
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => ({
					extension: "md",
					path: "Tasks/launch.md",
				}),
			},
			vault: {},
		});

		await plugin.onload();

		expect(addCommand).toHaveBeenCalledTimes(2);
		expect(addRibbonIcon).toHaveBeenCalledTimes(1);
		expect(addSettingTab).toHaveBeenCalledTimes(1);
		expect(registerEvent).not.toHaveBeenCalled();
		expect(registerInterval).not.toHaveBeenCalled();

		ribbons[0]?.callback();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.syncFile).toHaveBeenCalledWith("Tasks/launch.md", "tasks");
		expect(plugin.chooseDatabaseMock).not.toHaveBeenCalled();
	});

	it("requires the user to pick a database before syncing the active note", async () => {
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => ({
					extension: "md",
					path: "Tasks/launch.md",
				}),
			},
			vault: {},
		});
		plugin.selection = null as never;

		await plugin.onload();
		plugin.settings.databases.push({
			databaseId: "db-2",
			id: "notes",
			name: "Notes",
			notionPageIdField: "notionPageId",
			notionProperties: [],
			propertyMappings: [],
			titleProperty: "Name",
		});
		await plugin.syncActiveFile(true);

		expect(plugin.syncFile).not.toHaveBeenCalled();
		expect(plugin.chooseDatabaseMock).toHaveBeenCalledTimes(1);
		expect(notices).toEqual([]);
	});

	it("syncs immediately when exactly one database is configured", async () => {
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => ({
					extension: "md",
					path: "Tasks/launch.md",
				}),
			},
			vault: {},
		});

		await plugin.onload();
		await plugin.syncActiveFile(true);

		expect(plugin.chooseDatabaseMock).not.toHaveBeenCalled();
		expect(plugin.syncFile).toHaveBeenCalledWith("Tasks/launch.md", "tasks");
	});

	it("surfaces a specific notice when sync is skipped for a diagnosable reason", async () => {
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => ({
					extension: "md",
					path: "Tasks/launch.md",
				}),
			},
			vault: {},
		});
		plugin.syncResult = {
			message: "Active Markdown note could not be read from the vault.",
			reason: "document-not-found",
			status: "skipped",
		};

		await plugin.onload();
		await plugin.syncActiveFile(true);

		expect(notices).toContain("Active Markdown note could not be read from the vault.");
	});

	it("fetches database properties for settings-backed mapping dropdowns", async () => {
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => null,
			},
			vault: {},
		});

		await plugin.onload();
		await expect(plugin.fetchDatabaseProperties("tasks")).resolves.toEqual(["Name", "Published", "Slug"]);
		expect(plugin.settings.databases[0]?.notionProperties).toEqual(["Name", "Published", "Slug"]);
		expect(plugin.saveSettingsMock).toHaveBeenCalledTimes(1);
	});

	it("pulls the active note from Notion into the local file", async () => {
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => ({
					extension: "md",
					path: "Tasks/launch.md",
				}),
			},
			vault: {},
		});

		await plugin.onload();
		await plugin.pullActiveFileFromNotion(true);

		expect(plugin.pullFile).toHaveBeenCalledWith("Tasks/launch.md", "tasks");
	});

	it("shows immediate progress feedback while sync is still running", async () => {
		let resolveSync: ((value: SyncFileResult) => void) | null = null;
		const plugin = new TestPlugin({
			workspace: {
				getActiveFile: () => ({
					extension: "md",
					path: "Tasks/launch.md",
				}),
			},
			vault: {},
		});
		plugin.syncFile = vi.fn(() => new Promise<SyncFileResult>((resolve: (value: SyncFileResult) => void) => {
			resolveSync = resolve;
		}));

		await plugin.onload();
		const syncPromise = plugin.syncActiveFile(true);
		await Promise.resolve();

		expect(notices).toContain("Syncing Tasks...");

		if (resolveSync) {
			const completeSync = resolveSync as (value: SyncFileResult) => void;
			completeSync({
				status: "success",
				summary: {
					createdLocalDocuments: 0,
					createdRemotePages: 1,
					skipped: 0,
					updatedLocalDocuments: 0,
					updatedRemotePages: 0,
				},
			});
		}
		await syncPromise;

		expect(hiddenNotices).toContain("Syncing Tasks...");
		expect(notices).toContain("Synced Tasks: +1 remote, +0 local, ~0 remote, ~0 local.");
	});
});
