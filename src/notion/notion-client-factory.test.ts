import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";

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

			return Promise.resolve(new Response("", { status: 200 }));
		});
		vi.stubGlobal("fetch", rawFetch);

		const createClient = createNotionClientFactory(() => " secret_test ", {
			fetch: rawFetch,
			requestUrl: undefined,
		});
		const client = createClient() as { options?: Record<string, unknown> };

		expect(clientConstructor).toHaveBeenCalledTimes(1);
		expect(client.options?.auth).toBe("secret_test");

		const fetchOption = client.options?.fetch;
		expect(typeof fetchOption).toBe("function");
		await expect(
			(fetchOption as (input: string) => Promise<unknown>)("https://example.com"),
		).resolves.toBeInstanceOf(Response);
		expect(rawFetch).toHaveBeenCalledTimes(1);
	});

	it("strips browser-unsafe request options before delegating to fetch", async () => {
		const rawFetch = vi.fn(() => Promise.resolve(new Response("", { status: 200 })));
		vi.stubGlobal("fetch", rawFetch);

		const createClient = createNotionClientFactory(() => "secret_test", {
			fetch: rawFetch,
			requestUrl: undefined,
		});
		const client = createClient() as { options?: Record<string, unknown> };
		const fetchOption = client.options?.fetch as (
			input: string,
			init?: Record<string, unknown>,
		) => Promise<unknown>;

		await fetchOption("https://example.com", {
			agent: { keepAlive: true },
			headers: {
				authorization: "Bearer secret",
				"user-agent": "notionhq-client/test",
				"x-test": "1",
			},
			method: "POST",
		});

		expect(rawFetch).toHaveBeenCalledTimes(1);
		expect(rawFetch).toHaveBeenCalledWith("https://example.com", {
			headers: {
				authorization: "Bearer secret",
				"x-test": "1",
			},
			method: "POST",
		});
	});

	it("uses Obsidian requestUrl to bypass browser fetch restrictions", async () => {
		const requestUrlMock = vi.spyOn(obsidian, "requestUrl").mockResolvedValue({
			arrayBuffer: new ArrayBuffer(0),
			headers: {
				"content-type": "application/json",
			},
			json: {
				ok: true,
			},
			status: 200,
			text: "{\"ok\":true}",
		});
		const rawFetch = vi.fn(() => Promise.resolve(new Response("", { status: 200 })));
		vi.stubGlobal("fetch", rawFetch);

		const createClient = createNotionClientFactory(() => "secret_test");
		const client = createClient() as { options?: Record<string, unknown> };
		const fetchOption = client.options?.fetch as (
			input: string,
			init?: Record<string, unknown>,
		) => Promise<{
			headers: Headers;
			ok: boolean;
			status: number;
			text: () => Promise<string>;
		}>;

		const response = await fetchOption("https://api.notion.com/v1/data_sources/db/query", {
			body: "{\"filter\":{}}",
			headers: {
				authorization: "Bearer secret",
				"content-type": "application/json",
				"user-agent": "notionhq-client/test",
			},
			method: "POST",
		});

		expect(requestUrlMock).toHaveBeenCalledWith({
			body: "{\"filter\":{}}",
			contentType: "application/json",
			headers: {
				authorization: "Bearer secret",
				"content-type": "application/json",
			},
			method: "POST",
			throw: false,
			url: "https://api.notion.com/v1/data_sources/db/query",
		});
		expect(rawFetch).not.toHaveBeenCalled();
		expect(response.ok).toBe(true);
		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe("{\"ok\":true}");
		expect(response.headers.get("content-type")).toBe("application/json");
	});
});
