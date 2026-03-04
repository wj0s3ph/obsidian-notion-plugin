export class Notice {
	constructor(_message?: string) {}
}

export function requestUrl(): Promise<never> {
	return Promise.reject(new Error("requestUrl is not implemented in tests"));
}

export class Plugin {
	app: unknown;

	constructor(app?: unknown) {
		this.app = app;
	}

	addCommand(): void {}

	addSettingTab(): void {}

	loadData(): Promise<unknown> {
		return Promise.resolve(undefined);
	}

	registerEvent(): void {}

	registerInterval(): void {}

	saveData(): Promise<void> {
		return Promise.resolve();
	}
}

export class PluginSettingTab {
	app: unknown;
	containerEl = document.createElement("div");

	constructor(app: unknown, _plugin?: unknown) {
		this.app = app;
	}
}

export class Setting {
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

export class TFile {
	extension = "md";
	path = "";
}
