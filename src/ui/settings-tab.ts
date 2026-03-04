import { Notice, PluginSettingTab, Setting } from "obsidian";

import { getStrings } from "../i18n";
import {
	createDefaultDatabaseConfig,
	type DatabaseSyncSetting,
	type NotionSyncPluginSettings,
} from "../settings";

interface SettingsHost {
	fetchDatabaseProperties(profileId: string): Promise<string[]>;
	saveSettings(): Promise<void>;
	settings: NotionSyncPluginSettings;
}

export class NotionSyncSettingTab extends PluginSettingTab {
	constructor(app: PluginSettingTab["app"], private readonly plugin: SettingsHost) {
		super(app, plugin as never);
	}

	display(): void {
		const strings = getStrings();
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(strings.integration)
			.setHeading();

		new Setting(containerEl)
			.setName(strings.integrationToken)
			.setDesc(strings.pasteIntegrationToken)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder(strings.secretToken)
					.setValue(this.plugin.settings.notionToken)
					.onChange(async (value) => {
						this.plugin.settings.notionToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(strings.databaseProfiles)
			.setHeading();

		this.plugin.settings.databases.forEach((profile, index) => {
			this.renderProfileSection(containerEl, profile, index);
		});

		new Setting(containerEl)
			.setName(strings.addDatabaseProfile)
			.setDesc(strings.createAnotherDatabaseProfile)
			.addButton((button) => button
				.setButtonText(strings.addProfile)
				.onClick(async () => {
					this.plugin.settings.databases.push(
						createDefaultDatabaseConfig(
							strings.databaseProfileName(this.plugin.settings.databases.length + 1),
						),
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
		const strings = getStrings();
		const section = containerEl.createDiv({
			cls: "notion-sync-profile",
		});
		new Setting(section)
			.setName(profile.name || strings.databaseProfileName(index + 1))
			.setHeading();

		new Setting(section)
			.addExtraButton((button) => button
				.setIcon("trash")
				.setTooltip(strings.removeProfile)
				.onClick(async () => {
					this.plugin.settings.databases.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(section)
			.setName(strings.profileName)
			.setDesc(strings.profileNameDescription)
			.addText((text) => text
				.setValue(profile.name)
				.onChange(async (value) => {
					profile.name = value;
					await this.plugin.saveSettings();
				}));

		new Setting(section)
			.setName(strings.notionDatabaseId)
			.setDesc(strings.notionDatabaseIdDescription)
			.addText((text) => text
				.setPlaceholder(strings.databaseIdPlaceholder)
				.setValue(profile.databaseId)
				.onChange(async (value) => {
					profile.databaseId = value.trim();
					await this.plugin.saveSettings();
				}))
			.addButton((button) => button
				.setButtonText(strings.featureFetchProperties)
				.onClick(async () => {
					try {
						const properties = await this.plugin.fetchDatabaseProperties(profile.id);
						new Notice(
							properties.length > 0
								? strings.fetchedNotionProperties(properties.length)
								: strings.noNotionPropertiesFound,
						);
						this.display();
					} catch (error) {
						new Notice(error instanceof Error ? error.message : strings.failedToFetchNotionProperties);
					}
				}));

		new Setting(section)
			.setName(strings.titleProperty)
			.setDesc(strings.titlePropertyDescription)
			.addText((text) => text
				.setValue(profile.titleProperty)
				.onChange(async (value) => {
					profile.titleProperty = value.trim() || "Name";
					await this.plugin.saveSettings();
				}));

		new Setting(section)
			.setName(strings.propertyMappings)
			.setHeading();

		profile.propertyMappings.forEach((mapping, mappingIndex) => {
			new Setting(section)
				.setName(strings.mapping(mappingIndex + 1))
				.addText((text) => text
					.setPlaceholder(strings.frontmatterKeyPlaceholder)
					.setValue(mapping.obsidianKey)
					.onChange(async (value) => {
						mapping.obsidianKey = value.trim();
						await this.plugin.saveSettings();
					}))
				.addDropdown((dropdown) => {
					dropdown.addOption("", strings.selectNotionProperty);
					for (const propertyName of new Set([
						...profile.notionProperties,
						...(mapping.notionProperty ? [mapping.notionProperty] : []),
					])) {
						dropdown.addOption(propertyName, propertyName);
					}

					dropdown.setValue(mapping.notionProperty)
					.onChange(async (value) => {
						mapping.notionProperty = value.trim();
						await this.plugin.saveSettings();
					});
				})
				.addExtraButton((button) => button
					.setIcon("trash")
					.setTooltip(strings.removeMapping)
					.onClick(async () => {
						profile.propertyMappings.splice(mappingIndex, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		});

		new Setting(section)
			.setName(strings.addPropertyMapping)
			.setDesc(strings.mapFrontmatterKeyToNotionProperty)
			.addButton((button) => button
				.setButtonText(strings.addMapping)
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
