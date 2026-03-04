import type { LocalDocument, LocalDocumentRepository } from "../sync/engine";
import { parseMarkdownDocument, renderMarkdownDocument } from "./markdown-document";

interface FileLike {
	basename: string;
	path: string;
	stat: {
		mtime: number;
	};
}

interface VaultLike {
	cachedRead(file: FileLike): Promise<string>;
	create(path: string, data: string): Promise<FileLike>;
	createFolder(path: string): Promise<unknown>;
	getAbstractFileByPath(path: string): FileLike | { path: string } | null;
	modify(file: FileLike, data: string): Promise<void>;
}

export class VaultDocumentRepository implements LocalDocumentRepository {
	constructor(private readonly vault: VaultLike) {}

	async readDocument(path: string): Promise<LocalDocument | null> {
		const normalizedPath = normalizePath(path);
		const file = this.vault.getAbstractFileByPath(normalizedPath);
		if (!isFile(file) || !normalizedPath.endsWith(".md")) {
			return null;
		}

		const markdown = await this.vault.cachedRead(file);
		const document = parseMarkdownDocument(markdown);

		return {
			content: document.content,
			frontmatter: document.frontmatter,
			lastEditedTime: new Date(file.stat.mtime).toISOString(),
			path: normalizedPath,
			title: file.basename,
		};
	}

	async upsertDocument(document: LocalDocument): Promise<void> {
		const normalizedPath = normalizePath(document.path);
		await this.ensureFolderExists(parentPath(normalizedPath));

		const markdown = renderMarkdownDocument({
			content: document.content,
			frontmatter: document.frontmatter,
		});
		const existing = this.vault.getAbstractFileByPath(normalizedPath);

		if (isFile(existing)) {
			await this.vault.modify(existing, markdown);
			return;
		}

		await this.vault.create(normalizedPath, markdown);
	}

	private async ensureFolderExists(path: string): Promise<void> {
		if (!path || this.vault.getAbstractFileByPath(path)) {
			return;
		}

		await this.ensureFolderExists(parentPath(path));
		await this.vault.createFolder(path);
	}
}

function isFile(file: FileLike | { path: string } | null): file is FileLike {
	return Boolean(file && "basename" in file && "stat" in file);
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\/+/, "").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const index = path.lastIndexOf("/");
	return index === -1 ? "" : path.slice(0, index);
}
