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
const commands: Array<Record<string, unknown>> = [];
const ribbons: Array<{ callback: () => void; icon: string; title: string }> = [];

vi.mock("obsidian", () => {
	class Notice {
		constructor(message?: string) {
			if (message) {
				notices.push(message);
			}
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
		propertyMappings: [],
		titleProperty: "Name",
	};
	chooseDatabaseMock = vi.fn(async (_databases: DatabaseSyncSetting[]) => this.selection);
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

	syncFile = vi.fn(async () => this.syncResult);

	protected override async chooseDatabase(_databases: DatabaseSyncSetting[]) {
		return this.chooseDatabaseMock(_databases);
	}

	protected override createSyncService() {
		return {
			syncFile: this.syncFile,
		} as never;
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

		expect(addCommand).toHaveBeenCalledTimes(1);
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
});
