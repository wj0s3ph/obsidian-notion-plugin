import { PluginSettingTab, Setting } from "obsidian";

import {
	createDefaultDatabaseConfig,
	type DatabaseSyncSetting,
	type NotionSyncPluginSettings,
} from "../settings";

interface SettingsHost {
	saveSettings(): Promise<void>;
	settings: NotionSyncPluginSettings;
}

export class NotionSyncSettingTab extends PluginSettingTab {
	constructor(app: PluginSettingTab["app"], private readonly plugin: SettingsHost) {
		super(app, plugin as never);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Integration")
			.setHeading();

		new Setting(containerEl)
			.setName("Integration token")
			.setDesc("Paste your Notion internal integration token.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Secret token")
					.setValue(this.plugin.settings.notionToken)
					.onChange(async (value) => {
						this.plugin.settings.notionToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Database profiles")
			.setHeading();

		this.plugin.settings.databases.forEach((profile, index) => {
			this.renderProfileSection(containerEl, profile, index);
		});

		new Setting(containerEl)
			.setName("Add database profile")
			.setDesc("Create another Notion database profile.")
			.addButton((button) => button
				.setButtonText("Add profile")
				.onClick(async () => {
					this.plugin.settings.databases.push(
						createDefaultDatabaseConfig(`Database ${this.plugin.settings.databases.length + 1}`),
					);
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private renderProfileSection(
		containerEl: HTMLElement,
		profile: DatabaseSyncSetting,
		index: number,
	): void {
		const section = containerEl.createDiv({
			cls: "notion-sync-profile",
		});
		new Setting(section)
			.setName(profile.name || `Database ${index + 1}`)
			.setHeading();

		new Setting(section)
			.addExtraButton((button) => button
				.setIcon("trash")
				.setTooltip("Remove profile")
				.onClick(async () => {
					this.plugin.settings.databases.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(section)
			.setName("Profile name")
			.setDesc("Shown in settings and notices.")
			.addText((text) => text
				.setValue(profile.name)
				.onChange(async (value) => {
					profile.name = value;
					await this.plugin.saveSettings();
				}));

		new Setting(section)
			.setName("Notion database ID")
			.setDesc("Use the target data source or database ID from Notion.")
			.addText((text) => text
				.setPlaceholder("Database ID")
				.setValue(profile.databaseId)
				.onChange(async (value) => {
					profile.databaseId = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(section)
			.setName("Title property")
			.setDesc("Notion title property used when creating or updating pages.")
			.addText((text) => text
				.setValue(profile.titleProperty)
				.onChange(async (value) => {
					profile.titleProperty = value.trim() || "Name";
					await this.plugin.saveSettings();
				}));

		new Setting(section)
			.setName("Page ID frontmatter key")
			.setDesc("Frontmatter key used to store the linked Notion page ID.")
			.addText((text) => text
				.setValue(profile.notionPageIdField)
				.onChange(async (value) => {
					profile.notionPageIdField = value.trim() || "notionPageId";
					await this.plugin.saveSettings();
				}));

		new Setting(section)
			.setName("Property mappings")
			.setHeading();

		profile.propertyMappings.forEach((mapping, mappingIndex) => {
			new Setting(section)
				.setName(`Mapping ${mappingIndex + 1}`)
				.addText((text) => text
					.setPlaceholder("Frontmatter key")
					.setValue(mapping.obsidianKey)
					.onChange(async (value) => {
						mapping.obsidianKey = value.trim();
						await this.plugin.saveSettings();
					}))
				.addText((text) => text
					.setPlaceholder("Notion property")
					.setValue(mapping.notionProperty)
					.onChange(async (value) => {
						mapping.notionProperty = value.trim();
						await this.plugin.saveSettings();
					}))
				.addDropdown((dropdown) => dropdown
					.addOption("bidirectional", "Bidirectional")
					.addOption("obsidian-to-notion", "Obsidian -> Notion")
					.addOption("notion-to-obsidian", "Notion -> Obsidian")
					.setValue(mapping.direction)
					.onChange(async (value) => {
						mapping.direction = value as DatabaseSyncSetting["propertyMappings"][number]["direction"];
						await this.plugin.saveSettings();
					}))
				.addExtraButton((button) => button
					.setIcon("trash")
					.setTooltip("Remove mapping")
					.onClick(async () => {
						profile.propertyMappings.splice(mappingIndex, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		});

		new Setting(section)
			.setName("Add property mapping")
			.setDesc("Map a frontmatter key to a Notion property.")
			.addButton((button) => button
				.setButtonText("Add mapping")
				.onClick(async () => {
					profile.propertyMappings.push({
						direction: "bidirectional",
						notionProperty: "",
						obsidianKey: "",
					});
					await this.plugin.saveSettings();
					this.display();
				}));
	}
}
