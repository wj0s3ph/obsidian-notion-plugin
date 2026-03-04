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

1. Create a Notion internal integration and copy its token.
2. Share the target Notion database with that integration.
3. Build or install the plugin into `<Vault>/.obsidian/plugins/obsidian-notion-plugin/`.
4. Open **Settings → Community plugins → Notion Database Sync**.
5. Paste the integration token.
6. Add a database profile.
7. Fill in:
   - profile name
   - Notion database ID
   - title property
8. Click **Fetch properties** once.
9. Add property mappings by choosing a frontmatter key and a Notion property from the dropdown.

### Usage

- Use the ribbon icon or command **Sync active note database** to push the current note into Notion.
- Use the command **Pull active note from Notion** to overwrite the current note with the linked Notion page content and mapped properties.
- On first sync, the plugin creates a Notion page and writes `notionPageId` into the note frontmatter.

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

1. 在 Notion 中创建一个 internal integration，并复制 token。
2. 把目标 Notion 数据库共享给这个 integration。
3. 构建或安装插件到 `<Vault>/.obsidian/plugins/obsidian-notion-plugin/`。
4. 打开 **Settings → Community plugins → Notion Database Sync**。
5. 填入 integration token。
6. 添加一个数据库配置。
7. 填写以下信息：
   - 配置名称
   - Notion 数据库 ID
   - 标题属性
8. 点击一次 **Fetch properties / 拉取属性**。
9. 在属性映射表中填写 frontmatter 键，并从下拉框选择对应的 Notion 属性。

### 使用方式

- 使用侧边栏按钮或命令 **Sync active note database**，把当前笔记推送到 Notion。
- 使用命令 **Pull active note from Notion**，把已关联的 Notion 页面内容和映射属性拉回当前笔记。
- 首次同步时，插件会创建 Notion 页面，并把 `notionPageId` 写入笔记 frontmatter。

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
