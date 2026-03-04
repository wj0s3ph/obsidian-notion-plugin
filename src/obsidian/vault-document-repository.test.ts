import { describe, expect, it } from "vitest";

import { VaultDocumentRepository } from "./vault-document-repository";

class FakeVault {
	files = new Map<string, { data: string; mtime: number }>();
	folders = new Set<string>();

	cachedRead(file: { path: string }): Promise<string> {
		const entry = this.files.get(file.path);
		if (!entry) {
			throw new Error(`Missing file ${file.path}`);
		}

		return Promise.resolve(entry.data);
	}

	create(path: string, data: string): Promise<{ basename: string; path: string; stat: { mtime: number } }> {
		this.files.set(path, {
			data,
			mtime: Date.parse("2026-03-04T10:05:00.000Z"),
		});
		return Promise.resolve(this.getFile(path)!);
	}

	createFolder(path: string): Promise<void> {
		this.folders.add(path);
		return Promise.resolve();
	}

	getAbstractFileByPath(path: string): { basename: string; path: string; stat: { mtime: number } } | { path: string } | null {
		return this.getFile(path) ?? (this.folders.has(path) ? { path } : null);
	}

	getMarkdownFiles(): Array<{ basename: string; path: string; stat: { mtime: number } }> {
		return [...this.files.keys()].map((path) => this.getFile(path)!);
	}

	modify(file: { path: string }, data: string): Promise<void> {
		this.files.set(file.path, {
			data,
			mtime: Date.parse("2026-03-04T10:10:00.000Z"),
		});
		return Promise.resolve();
	}

	private getFile(path: string): { basename: string; path: string; stat: { mtime: number } } | null {
		const entry = this.files.get(path);
		if (!entry) {
			return null;
		}

		return {
			basename: path.split("/").pop()?.replace(/\.md$/, "") ?? "",
			path,
			stat: {
				mtime: entry.mtime,
			},
		};
	}
}

describe("VaultDocumentRepository", () => {
	it("reads a single markdown note by path", async () => {
		const vault = new FakeVault();
		vault.files.set("Tasks/launch.md", {
			data: `---
status: Todo
---
# Launch
`,
			mtime: Date.parse("2026-03-04T10:00:00.000Z"),
		});
		vault.files.set("Notes/ignore.md", {
			data: "# Ignore\n",
			mtime: Date.parse("2026-03-04T10:00:00.000Z"),
		});
		const repository = new VaultDocumentRepository(vault as never);

		const document = await repository.readDocument("Tasks/launch.md");

		expect(document).toEqual({
			content: "# Launch\n",
			frontmatter: { status: "Todo" },
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "launch",
		});
	});

	it("returns null for missing or non-markdown paths", async () => {
		const vault = new FakeVault();
		vault.files.set("Tasks/launch.md", {
			data: "# Launch\n",
			mtime: Date.parse("2026-03-04T10:00:00.000Z"),
		});
		const repository = new VaultDocumentRepository(vault as never);

		await expect(repository.readDocument("Tasks/missing.md")).resolves.toBeNull();
		await expect(repository.readDocument("Tasks")).resolves.toBeNull();
	});

	it("creates missing folders and writes markdown documents", async () => {
		const vault = new FakeVault();
		const repository = new VaultDocumentRepository(vault as never);

		await repository.upsertDocument({
			content: "# Launch\n",
			frontmatter: {
				notionPageId: "page-1",
				status: "Done",
			},
			lastEditedTime: "2026-03-04T10:00:00.000Z",
			path: "Tasks/launch.md",
			title: "Launch",
		});

		expect(vault.folders.has("Tasks")).toBe(true);
		expect(vault.files.get("Tasks/launch.md")?.data).toBe(`---
notionPageId: page-1
status: Done
---
# Launch
`);
	});
});
