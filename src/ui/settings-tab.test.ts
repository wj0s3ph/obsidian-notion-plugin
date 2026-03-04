/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
	addOption(): this {
		return this;
	}
}

class FakeButtonControl extends FakeControl {
	setButtonText(): this {
		return this;
	}

	onClick(): this {
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
			callback(new FakeButtonControl());
			return this;
		}

		addDropdown(callback: (control: FakeDropdownControl) => void): this {
			callback(new FakeDropdownControl());
			return this;
		}

		addExtraButton(callback: (control: FakeExtraButtonControl) => void): this {
			callback(new FakeExtraButtonControl());
			return this;
		}
	}

	return {
		PluginSettingTab,
		Setting,
	};
});

import { createDefaultDatabaseConfig } from "../settings";
import { NotionSyncSettingTab } from "./settings-tab";

describe("NotionSyncSettingTab", () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it("renders section headings through Setting.setHeading instead of raw heading tags", () => {
		const profile = createDefaultDatabaseConfig("Tasks");
		const tab = new NotionSyncSettingTab({} as never, {
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
		expect(tab.containerEl.textContent).not.toContain("Sync on startup");
		expect(tab.containerEl.textContent).not.toContain("Enabled");
		expect(tab.containerEl.textContent).not.toContain("Vault folder");
		expect(tab.containerEl.textContent).not.toContain("Remote poll interval");
	});
});
