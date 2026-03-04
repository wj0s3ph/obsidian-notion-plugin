import { describe, expect, it } from "vitest";

import {
	parseMarkdownDocument,
	renderMarkdownDocument,
} from "./markdown-document";

describe("parseMarkdownDocument", () => {
	it("extracts frontmatter and markdown body", () => {
		const document = parseMarkdownDocument(`---
status: Todo
tags:
  - alpha
  - beta
---
# Launch

Body
`);

		expect(document).toEqual({
			content: "# Launch\n\nBody\n",
			frontmatter: {
				status: "Todo",
				tags: ["alpha", "beta"],
			},
		});
	});

	it("returns an empty frontmatter object when the note has no YAML block", () => {
		const document = parseMarkdownDocument("# Plain note\n");

		expect(document).toEqual({
			content: "# Plain note\n",
			frontmatter: {},
		});
	});
});

describe("renderMarkdownDocument", () => {
	it("renders YAML frontmatter ahead of the markdown body", () => {
		const markdown = renderMarkdownDocument({
			content: "# Launch\n",
			frontmatter: {
				notionPageId: "page-1",
				status: "Done",
				tags: ["alpha", "beta"],
			},
		});

		expect(markdown).toBe(`---
notionPageId: page-1
status: Done
tags:
  - alpha
  - beta
---
# Launch
`);
	});

	it("omits the YAML block when there is no frontmatter", () => {
		const markdown = renderMarkdownDocument({
			content: "# Plain note\n",
			frontmatter: {},
		});

		expect(markdown).toBe("# Plain note\n");
	});
});
