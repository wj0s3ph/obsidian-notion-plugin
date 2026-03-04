import YAML from "yaml";

export interface MarkdownDocument {
	content: string;
	frontmatter: Record<string, unknown>;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdownDocument(markdown: string): MarkdownDocument {
	const match = markdown.match(FRONTMATTER_PATTERN);
	if (!match) {
		return {
			content: markdown,
			frontmatter: {},
		};
	}

	const frontmatter = YAML.parse(match[1] ?? "");
	return {
		content: markdown.slice(match[0].length),
		frontmatter: isRecord(frontmatter) ? frontmatter : {},
	};
}

export function renderMarkdownDocument(document: MarkdownDocument): string {
	if (Object.keys(document.frontmatter).length === 0) {
		return document.content;
	}

	return `---\n${YAML.stringify(document.frontmatter).trimEnd()}\n---\n${document.content}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
