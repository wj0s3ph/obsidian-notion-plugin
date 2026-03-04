import { describe, expect, it } from "vitest";

import { getStrings, resolveLocale } from "./i18n";

describe("resolveLocale", () => {
	it("falls back to English for unsupported languages", () => {
		expect(resolveLocale("en")).toBe("en");
		expect(resolveLocale("fr")).toBe("en");
	});

	it("maps Chinese variants to simplified Chinese", () => {
		expect(resolveLocale("zh")).toBe("zh-CN");
		expect(resolveLocale("zh-TW")).toBe("zh-CN");
		expect(resolveLocale("zh-CN")).toBe("zh-CN");
	});
});

describe("getStrings", () => {
	it("returns English copy by default", () => {
		expect(getStrings("en").commandSyncActiveNoteDatabase).toBe("Sync active note database");
	});

	it("returns simplified Chinese copy when Obsidian is in Chinese", () => {
		const strings = getStrings("zh-CN");

		expect(strings.commandSyncActiveNoteDatabase).toBe("同步当前笔记数据库");
		expect(strings.featureFetchProperties).toBe("拉取属性");
	});
});
