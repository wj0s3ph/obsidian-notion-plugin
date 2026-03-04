import { Plugin } from "obsidian";

import {
	DEFAULT_SETTINGS,
	type NotionSyncPluginSettings,
	normalizeSettings,
} from "./settings";

export default class NotionSyncPlugin extends Plugin {
	settings: NotionSyncPluginSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
