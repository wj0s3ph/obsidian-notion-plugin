# Notion Database Sync

Bidirectional Obsidian to Notion database sync for Markdown notes and frontmatter properties.

## What it does

- Syncs notes under one or more configured vault folders to matching Notion databases.
- Creates a Notion page for new Obsidian notes and stores the linked page ID in frontmatter.
- Imports remote-only Notion pages into the configured Obsidian folder.
- Pushes Markdown body changes from Obsidian to Notion and pulls remote Markdown updates back.
- Syncs mapped frontmatter properties in both directions.
- Filters out Notion read-only properties during bidirectional sync.

## How it works

Each database profile links:

- one Obsidian folder
- one Notion database ID
- one Notion title property
- one page ID frontmatter key
- a set of frontmatter-to-Notion property mappings

The plugin stores the linked Notion page ID in frontmatter, `notionPageId` by default. After a page is linked, subsequent sync runs compare local and remote edit timestamps and apply the newer side.

## Supported property sync

Writable property types currently covered by the serializer and normalizer:

- `title`
- `rich_text`
- `number`
- `checkbox`
- `url`
- `email`
- `phone_number`
- `date`
- `select`
- `multi_select`
- `status`

Read-only Notion property types are intentionally excluded from sync:

- `created_by`
- `created_time`
- `last_edited_by`
- `last_edited_time`
- `formula`
- `rollup`
- `unique_id`
- `verification`
- `button`

## Setup

1. Create a Notion internal integration and copy its token.
2. Share each target Notion database with that integration.
3. Install this plugin into `<Vault>/.obsidian/plugins/obsidian-notion-plugin/`.
4. Open **Settings → Community plugins → Notion Database Sync**.
5. Paste the integration token.
6. Add one or more database profiles.
7. For each profile, configure:
   - vault folder
   - Notion database ID
   - title property
   - page ID frontmatter key
   - remote poll interval
   - property mappings

## Property mappings

Each mapping row connects one frontmatter key to one Notion property and supports three directions:

- `Bidirectional`
- `Obsidian -> Notion`
- `Notion -> Obsidian`

Example:

- `status` -> `Status` -> `Bidirectional`
- `tags` -> `Tags` -> `Bidirectional`
- `reviewedAt` -> `Last reviewed` -> `Notion -> Obsidian`

## Commands

- `Sync active note database`
- `Sync all configured databases`

## Automatic sync behavior

- On startup, the plugin can run a full sync if enabled in settings.
- On local Markdown file create or modify, the matching profile is synced after a short debounce.
- A background poll checks each enabled profile at its configured interval and pulls remote changes when due.

## Development

```bash
npm install
npm run build
npm run build:release
npm test
npm run test:coverage
```

Coverage is enforced at 70% for lines, statements, functions, and branches.

## Release artifacts

The plugin release should contain:

- `main.js`
- `manifest.json`
- `styles.css`

## GitHub release build

Use `npm run build:release` to produce GitHub release assets in `release/`.

This repository also includes `.github/workflows/release.yml`, which builds and uploads `release/*` whenever you push a SemVer tag such as `1.0.1`.

## Notes

- The Notion API now refers to database content containers as data sources in some endpoints. The plugin keeps the user-facing term “database ID” because that matches common Notion usage.
- Existing local frontmatter keys are preserved unless they are explicitly mapped and updated by sync.
