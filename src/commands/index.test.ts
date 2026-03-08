import { describe, expect, it, vi } from "vitest";

import { registerCommands } from "./index";

interface RegisteredCommand {
	checkCallback: (checking: boolean) => boolean;
	id: string;
	name: string;
}

describe("registerCommands", () => {
	it("registers manual sync commands for pushing and pulling the active markdown note", () => {
		const syncActiveFile = vi.fn(() => Promise.resolve(undefined));
		const pullActiveFileFromNotion = vi.fn(() => Promise.resolve(undefined));
		const addCommand = vi.fn();
		const plugin = {
			addCommand,
			app: {
				workspace: {
					getActiveFile: () => ({
						extension: "md",
						path: "Tasks/launch.md",
					}),
				},
			},
			syncActiveFile,
			pullActiveFileFromNotion,
		};

		registerCommands(plugin as never);

		expect(addCommand).toHaveBeenCalledTimes(2);
		const [syncCommand] = (addCommand.mock.calls[0] ?? []) as [RegisteredCommand];
		const [pullCommand] = (addCommand.mock.calls[1] ?? []) as [RegisteredCommand];
		expect(syncCommand.id).toBe("sync-active-note-database");
		expect(syncCommand.name).toBe("Sync active note database");
		expect(syncCommand.checkCallback(true)).toBe(true);
		expect(pullCommand.id).toBe("pull-active-note-from-notion");
		expect(pullCommand.name).toBe("Pull active note from Notion");
		expect(pullCommand.checkCallback(true)).toBe(true);

		syncCommand.checkCallback(false);
		pullCommand.checkCallback(false);

		expect(syncActiveFile).toHaveBeenCalledWith(true);
		expect(pullActiveFileFromNotion).toHaveBeenCalledWith(true);
	});

	it("disables the command when the active file is not markdown", () => {
		const addCommand = vi.fn();
		const plugin = {
			addCommand,
			app: {
				workspace: {
					getActiveFile: () => null,
				},
			},
			syncActiveFile: vi.fn(),
		};

		registerCommands(plugin as never);

		const [syncCommand] = (addCommand.mock.calls[0] ?? []) as [RegisteredCommand];
		const [pullCommand] = (addCommand.mock.calls[1] ?? []) as [RegisteredCommand];
		expect(syncCommand.checkCallback(true)).toBe(false);
		expect(pullCommand.checkCallback(true)).toBe(false);
	});
});
