/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createdButtons: FakeButtonControl[] = [];
const createdDropdowns: FakeDropdownControl[] = [];

class FakeControl {
	setPlaceholder(): this {
		return this;
	}

	setValue(): this {
		return this;
	}

	onChange(): this {
		return this;
	}
}

class FakeTextControl extends FakeControl {
	inputEl = {
		type: "text",
	};
}

class FakeDropdownControl extends FakeControl {
	options = new Map<string, string>();

	addOption(value: string, label: string): this {
		this.options.set(value, label);
		return this;
	}
}

class FakeButtonControl extends FakeControl {
	buttonText = "";
	onClickHandler: (() => void | Promise<void>) | null = null;

	setButtonText(value: string): this {
		this.buttonText = value;
		return this;
	}

	onClick(callback: () => void | Promise<void>): this {
		this.onClickHandler = callback;
		return this;
	}
}

class FakeToggleControl extends FakeControl {}

class FakeExtraButtonControl extends FakeControl {
	setIcon(): this {
		return this;
	}

	setTooltip(): this {
		return this;
	}

	onClick(): this {
		return this;
	}
}

function attachObsidianDomHelpers(element: HTMLElement): HTMLElement {
	Object.assign(element, {
		createDiv(options?: { cls?: string }) {
			const div = attachObsidianDomHelpers(document.createElement("div"));
			if (options?.cls) {
				div.className = options.cls;
			}
			element.append(div);
			return div;
		},
		createEl(tag: string, options?: { text?: string }) {
			const child = attachObsidianDomHelpers(document.createElement(tag));
			if (options?.text) {
				child.textContent = options.text;
			}
			element.append(child);
			return child;
		},
		empty() {
			element.replaceChildren();
		},
	});

	return element;
}

vi.mock("obsidian", () => {
	class Notice {
		constructor(_message?: string) {}
	}

	class PluginSettingTab {
		app: unknown;
		containerEl: HTMLElement;

		constructor(app: unknown) {
			this.app = app;
			this.containerEl = attachObsidianDomHelpers(document.createElement("div"));
		}
	}

	class Setting {
		constructor(private readonly containerEl: HTMLElement) {}

		setName(name: string): this {
			const nameEl = document.createElement("div");
			nameEl.className = "setting-item-name";
			nameEl.textContent = name;
			this.containerEl.append(nameEl);
			return this;
		}

		setDesc(description: string): this {
			const descEl = document.createElement("div");
			descEl.className = "setting-item-description";
			descEl.textContent = description;
			this.containerEl.append(descEl);
			return this;
		}

		setHeading(): this {
			this.containerEl.dataset.heading = "true";
			return this;
		}

		addText(callback: (control: FakeTextControl) => void): this {
			callback(new FakeTextControl());
			return this;
		}

		addToggle(callback: (control: FakeToggleControl) => void): this {
			callback(new FakeToggleControl());
			return this;
		}

		addButton(callback: (control: FakeButtonControl) => void): this {
			const control = new FakeButtonControl();
			createdButtons.push(control);
			callback(control);
			return this;
		}

		addDropdown(callback: (control: FakeDropdownControl) => void): this {
			const control = new FakeDropdownControl();
			createdDropdowns.push(control);
			callback(control);
			return this;
		}

		addExtraButton(callback: (control: FakeExtraButtonControl) => void): this {
			callback(new FakeExtraButtonControl());
			return this;
		}
	}

	return {
		getLanguage: () => "en",
		Notice,
		PluginSettingTab,
		Setting,
	};
});

import { createDefaultDatabaseConfig } from "../settings";
import { NotionSyncSettingTab } from "./settings-tab";

describe("NotionSyncSettingTab", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		createdButtons.length = 0;
		createdDropdowns.length = 0;
	});

	it("renders section headings through Setting.setHeading instead of raw heading tags", () => {
		const profile = createDefaultDatabaseConfig("Tasks");
		const tab = new NotionSyncSettingTab({} as never, {
			fetchDatabaseProperties: vi.fn(async () => []),
			saveSettings: vi.fn(async () => undefined),
			settings: {
				databases: [profile],
				notionToken: "",
			},
		});

		tab.display();

		expect(tab.containerEl.querySelector("h2, h3, h4, h5")).toBeNull();
		expect(tab.containerEl.textContent).toContain("Integration");
		expect(tab.containerEl.textContent).toContain("Database profiles");
		expect(tab.containerEl.textContent).toContain("Tasks");
		expect(tab.containerEl.textContent).toContain("Property mappings");
		expect(tab.containerEl.textContent).not.toContain("Page ID frontmatter key");
		expect(tab.containerEl.textContent).not.toContain("Sync on startup");
		expect(tab.containerEl.textContent).not.toContain("Enabled");
		expect(tab.containerEl.textContent).not.toContain("Vault folder");
		expect(tab.containerEl.textContent).not.toContain("Remote poll interval");
	});

	it("renders cached Notion properties in a dropdown and wires a refresh button", async () => {
		const profile = {
			...createDefaultDatabaseConfig("Tasks"),
			databaseId: "db-1",
			id: "tasks",
			notionProperties: ["Published", "Slug"],
			propertyMappings: [{
				direction: "bidirectional" as const,
				notionProperty: "Published",
				obsidianKey: "published",
			}],
		};
		const fetchDatabaseProperties = vi.fn(async () => ["Published", "Slug", "Status"]);
		const tab = new NotionSyncSettingTab({} as never, {
			fetchDatabaseProperties,
			saveSettings: vi.fn(async () => undefined),
			settings: {
				databases: [profile],
				notionToken: "secret_test",
			},
		});

		tab.display();

		const propertyDropdown = createdDropdowns.find((dropdown) => dropdown.options.has("Published"));
		expect(propertyDropdown?.options).toEqual(new Map([
			["", "Select a property"],
			["Published", "Published"],
			["Slug", "Slug"],
		]));

		const refreshButton = createdButtons.find((button) => button.buttonText === "Fetch properties");
		expect(refreshButton).toBeDefined();

		await refreshButton?.onClickHandler?.();

		expect(fetchDatabaseProperties).toHaveBeenCalledWith("tasks");
	});

	it("does not render a sync direction selector for property mappings", () => {
		const profile = {
			...createDefaultDatabaseConfig("Tasks"),
			databaseId: "db-1",
			id: "tasks",
			notionProperties: ["Published"],
			propertyMappings: [{
				direction: "bidirectional" as const,
				notionProperty: "Published",
				obsidianKey: "published",
			}],
		};
		const tab = new NotionSyncSettingTab({} as never, {
			fetchDatabaseProperties: vi.fn(async () => ["Published"]),
			saveSettings: vi.fn(async () => undefined),
			settings: {
				databases: [profile],
				notionToken: "secret_test",
			},
		});

		tab.display();

		expect(tab.containerEl.textContent).not.toContain("Bidirectional");
		expect(tab.containerEl.textContent).not.toContain("Obsidian -> Notion");
		expect(tab.containerEl.textContent).not.toContain("Notion -> Obsidian");
	});
});
