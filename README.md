# Notion Database Sync

[English](#english) | [简体中文](#简体中文)

## English

### Overview

Notion Database Sync is an Obsidian community plugin for syncing the active Markdown note with a selected Notion database.

It focuses on a narrow, observable workflow:

- push the current note to Notion
- pull the linked Notion page back into the current note
- keep mapped frontmatter properties in sync
- store the linked Notion page ID in frontmatter as `notionPageId`

If only one database profile is configured, the plugin uses it directly. If multiple profiles are configured, the plugin asks you to select one.

### Current feature set

- Manual sync for the active note from Obsidian to Notion
- Manual pull for the active note from Notion to Obsidian
- Property mapping between frontmatter keys and Notion properties
- One-click property list fetch from the target Notion database
- Notion property dropdowns in settings, so mappings do not require manual typing
- Immediate progress notices and clearer failure messages during sync
- English and Simplified Chinese UI copy, following the current Obsidian language

### Supported property types

Writable Notion property types currently handled by the serializer and normalizer:

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

Read-only or unsupported Notion property types are intentionally not written back:

- `created_by`
- `created_time`
- `last_edited_by`
- `last_edited_time`
- `formula`
- `rollup`
- `unique_id`
- `verification`
- `button`

### Setup

1. Create a Notion internal integration.
   Open Notion integrations, click `+ New integration`, choose the workspace, and create an internal integration. Only a workspace owner can create integrations for that workspace.
2. Enable the right capabilities for the integration.
   This plugin needs content access for the database you want to sync. In practice, enable read content and write or insert capabilities so the plugin can read pages, update pages, and create pages.
3. Copy the integration token from the integration configuration page.
   Keep this token private. Do not commit it to source control or share it in screenshots.
4. Share the target Notion page or database with the integration.
   In Notion, open the page that contains the database, click the `...` menu, choose `Add connections`, then select your integration. If the integration cannot access the parent page, API calls will fail even if the token is valid.
5. Find the Notion database ID.
   Open the database as a full page, copy its link, and extract the UUID in the URL. Notion accepts hyphenated and unhyphenated forms. This plugin lets you paste the database ID directly.
6. Build or install the plugin into `<Vault>/.obsidian/plugins/obsidian-notion-plugin/`.
7. Open **Settings → Community plugins → Notion Database Sync**.
8. Paste the integration token.
9. Add a database profile.
10. Fill in:
   - profile name
   - Notion database ID
   - title property
11. Click **Fetch properties** once.
   This reads the remote database schema and caches the available property names for the mapping dropdown.
12. Add property mappings by entering a frontmatter key and selecting a Notion property from the dropdown.

### Notion-specific notes

- Notion now refers to many database containers as data sources in the API. The plugin still asks for a "database ID" because that matches how most users find the ID in Notion.
- If a mapped property depends on a relation, the related database may also need to be shared with the integration. Otherwise Notion may omit that property from the returned schema.
- Linked databases are not a separate source of truth for the API. Share the original database with the integration instead of a linked view.

### Usage

- Use the ribbon icon or command **Sync active note database** to push the current note into Notion.
- Use the command **Pull active note from Notion** to overwrite the current note with the linked Notion page content and mapped properties.
- On first sync, the plugin creates a Notion page and writes `notionPageId` into the note frontmatter.

### Troubleshooting

- `Failed to fetch` usually means the integration token is invalid, the target page or database was not shared with the integration, or the requested database ID is wrong.
- If **Fetch properties** returns nothing useful, confirm you shared the original database, not only a linked database view.
- If relation-based properties are missing, share the related databases with the same integration as well.
- If sync creates or updates the page but mapped properties look wrong, verify the mapping names against the remote schema and re-run **Fetch properties**.

### Known behavior

- This plugin currently focuses on active-note workflows. It does not expose a bulk "sync all databases" command.
- `notionPageId` is a built-in frontmatter key and is not configurable in settings.
- Property types are derived from the remote Notion database schema. The plugin does not guess property types from frontmatter alone.

### Development

```bash
npm install
npm run build
npm test
npm run build:release
```

Coverage is enforced at 70% for lines, statements, functions, and branches.

### Release

Release assets are:

- `main.js`
- `manifest.json`
- `styles.css`
- `<plugin-id>-<version>.zip`

Build them with:

```bash
npm run build:release
```

Current release notes:

- [1.0.0 release notes](docs/releases/1.0.0.md)

The repository includes [.github/workflows/release.yml](.github/workflows/release.yml), which publishes `release/*` on SemVer tags such as `1.0.1`.

## 简体中文

### 概览

Notion Database Sync 是一个 Obsidian 社区插件，用来把当前 Markdown 笔记与指定的 Notion 数据库同步。

它当前聚焦在一个可观察、可诊断的手动工作流上：

- 把当前笔记推送到 Notion
- 把已关联的 Notion 页面拉回当前笔记
- 同步 frontmatter 与 Notion 属性映射
- 用固定 frontmatter 字段 `notionPageId` 保存关联的页面 ID

如果只配置了一个数据库，插件会直接使用它；如果配置了多个数据库，插件会先让你选择目标数据库。

### 当前功能

- 手动将当前笔记从 Obsidian 同步到 Notion
- 手动将当前笔记从 Notion 拉回 Obsidian
- 支持 frontmatter 键与 Notion 属性的映射
- 支持一键拉取目标 Notion 数据库的属性列表
- 设置页里的 Notion 属性使用下拉框选择，不需要手动输入
- 同步时会先显示进行中提示，失败时也会给出更明确的错误信息
- UI 文案支持英文和简体中文，跟随 Obsidian 当前语言

### 支持的属性类型

当前已支持读写的 Notion 属性类型：

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

以下只读或暂不支持回写的属性类型不会写回 Notion：

- `created_by`
- `created_time`
- `last_edited_by`
- `last_edited_time`
- `formula`
- `rollup`
- `unique_id`
- `verification`
- `button`

### 配置步骤

1. 在 Notion 中创建 internal integration。
   打开 Notion integrations 页面，点击 `+ New integration`，选择工作区并创建 internal integration。只有该工作区的 workspace owner 才能创建 integration。
2. 为 integration 打开合适的 capabilities。
   这个插件需要访问数据库内容。实际配置上，至少应允许读取内容，以及写入或插入内容，这样插件才能读取页面、更新页面和创建页面。
3. 在 integration 配置页复制 token。
   这个 token 是密钥，不要提交到代码仓库，也不要在截图里暴露。
4. 把目标数据库所在的页面或数据库共享给这个 integration。
   在 Notion 中打开包含数据库的页面，点击右上角 `...`，选择 `Add connections`，再选中你的 integration。即使 token 正确，如果 integration 没有访问父页面，API 调用也会失败。
5. 找到 Notion 数据库 ID。
   把数据库作为整页打开，复制链接，从 URL 中提取 UUID。带连字符和不带连字符的写法都可以，这个插件支持直接粘贴数据库 ID。
6. 构建或安装插件到 `<Vault>/.obsidian/plugins/obsidian-notion-plugin/`。
7. 打开 **Settings → Community plugins → Notion Database Sync**。
8. 填入 integration token。
9. 添加一个数据库配置。
10. 填写以下信息：
   - 配置名称
   - Notion 数据库 ID
   - 标题属性
11. 点击一次 **Fetch properties / 拉取属性**。
   这一步会读取远端数据库 schema，并把可用属性名缓存到映射下拉框里。
12. 在属性映射表中填写 frontmatter 键，并从下拉框选择对应的 Notion 属性。

### Notion 相关说明

- Notion 在 API 里会把很多数据库容器称为 data source，但插件里仍然使用“数据库 ID”这个说法，因为这更符合大多数用户在 Notion 里的查找方式。
- 如果映射的属性依赖 relation，相关数据库也可能需要共享给同一个 integration，否则 Notion 返回的 schema 里可能缺少这些属性。
- Linked database 不是 API 的独立真实来源。应该共享原始数据库，而不是只共享一个 linked view。

### 使用方式

- 使用侧边栏按钮或命令 **Sync active note database**，把当前笔记推送到 Notion。
- 使用命令 **Pull active note from Notion**，把已关联的 Notion 页面内容和映射属性拉回当前笔记。
- 首次同步时，插件会创建 Notion 页面，并把 `notionPageId` 写入笔记 frontmatter。

### 排查问题

- 出现 `Failed to fetch`，通常表示 integration token 无效、目标页面或数据库没有共享给 integration，或者数据库 ID 填错了。
- 如果 **Fetch properties / 拉取属性** 没拿到有效结果，先确认你共享的是原始数据库，而不只是 linked database 视图。
- 如果 relation 相关属性缺失，把关联数据库也共享给同一个 integration。
- 如果页面能创建或更新，但属性映射结果不对，先对照远端 schema 检查映射名称，再重新执行一次 **Fetch properties / 拉取属性**。

### Official Notion references / Notion 官方参考

- Internal integration setup: https://developers.notion.com/guides/get-started/authorization
- Create an integration: https://developers.notion.com/docs/create-a-notion-integration
- Authentication: https://developers.notion.com/reference/authentication
- Retrieve a database: https://developers.notion.com/reference/retrieve-a-database
- Working with databases and data sources: https://developers.notion.com/docs/working-with-databases
- Notion Help Center overview: https://www.notion.com/help/create-integrations-with-the-notion-api

### 当前行为说明

- 插件当前聚焦在“当前笔记”工作流，没有暴露批量“同步所有数据库”的命令。
- `notionPageId` 是内置 frontmatter 字段，不在设置页中开放配置。
- 属性类型来自远端 Notion 数据库 schema，不会只根据 frontmatter 值自动猜测类型。

### 开发

```bash
npm install
npm run build
npm test
npm run build:release
```

测试覆盖率阈值为 70%，覆盖行、语句、函数和分支。

### 发布

Release 资产包括：

- `main.js`
- `manifest.json`
- `styles.css`
- `<插件 ID>-<版本号>.zip`

构建命令：

```bash
npm run build:release
```

当前版本说明：

- [1.0.0 发布说明](docs/releases/1.0.0.md)

仓库内置了 [.github/workflows/release.yml](.github/workflows/release.yml)，推送类似 `1.0.1` 的 SemVer tag 时会自动发布 `release/*`。
