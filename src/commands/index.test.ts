import { describe, expect, it, vi } from "vitest";

import { registerCommands } from "./index";

interface RegisteredCommand {
	checkCallback: (checking: boolean) => boolean;
	id: string;
	name: string;
}

describe("registerCommands", () => {
	it("registers a single manual sync command for the active markdown note", async () => {
		const syncActiveFile = vi.fn(async () => undefined);
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
		};

		registerCommands(plugin as never);

		expect(addCommand).toHaveBeenCalledTimes(1);
		const [command] = (addCommand.mock.calls[0] ?? []) as [RegisteredCommand];
		expect(command.id).toBe("sync-active-note-database");
		expect(command.name).toBe("Sync active note database");
		expect(command.checkCallback(true)).toBe(true);

		command.checkCallback(false);

		expect(syncActiveFile).toHaveBeenCalledWith(true);
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

		const [command] = (addCommand.mock.calls[0] ?? []) as [RegisteredCommand];
		expect(command.checkCallback(true)).toBe(false);
	});
});
