import { afterEach, describe, expect, it, vi } from "vitest";

const { clientConstructor } = vi.hoisted(() => ({
	clientConstructor: vi.fn(function (this: unknown, options: Record<string, unknown>) {
		return {
			options,
		};
	}),
}));

vi.mock("@notionhq/client", () => ({
	Client: clientConstructor,
}));

import { createNotionClientFactory } from "./notion-api-repository";

describe("createNotionClientFactory", () => {
	afterEach(() => {
		clientConstructor.mockClear();
		vi.unstubAllGlobals();
	});

	it("binds the global fetch implementation before passing it to the Notion client", async () => {
		const rawFetch = vi.fn(function (this: unknown) {
			if (this !== globalThis) {
				throw new TypeError("Illegal invocation");
			}

			return Promise.resolve({ ok: true });
		});
		vi.stubGlobal("fetch", rawFetch);

		const createClient = createNotionClientFactory(() => " secret_test ");
		const client = createClient() as { options?: Record<string, unknown> };

		expect(clientConstructor).toHaveBeenCalledTimes(1);
		expect(client.options?.auth).toBe("secret_test");

		const fetchOption = client.options?.fetch;
		expect(typeof fetchOption).toBe("function");
		await expect(
			(fetchOption as (input: string) => Promise<unknown>)("https://example.com"),
		).resolves.toEqual({ ok: true });
		expect(rawFetch).toHaveBeenCalledTimes(1);
	});
});
