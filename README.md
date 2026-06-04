<p align="center">
    <picture>
      <source media="(prefers-color-scheme: light)" srcset="./resources/icon.png" width="200" />
      <img src="./.github/assets/cursortoys_horizontal.png" width="200" alt="CursorToys" />
  </picture>
</p>
<p align="center">
  <strong>Cursor utilities that keep you in the editor.</strong><br/>
  Test APIs, share AI configs, and manage your Cursor workspace — without context switching.
</p>

[![Publish Extension](https://img.shields.io/github/actions/workflow/status/CursorToys/cursor-toys/publish.yml?style=flat-square&label=Publish)](https://github.com/CursorToys/cursor-toys/actions/workflows/publish.yml)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/godrix/cursor-toys?label=Open%20VSX%20downloads)](https://open-vsx.org/extension/godrix/cursor-toys)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<h3 align="center">
  <a href="#-installation">Installation</a>
  <span> · </span>
  <a href="#-utilities">Utilities</a>
  <span> · </span>
  <a href="#-quick-start">Quick Start</a>
  <span> · </span>
  <a href="#-whats-new">What's New</a>
</h3>

## Why CursorToys

CursorToys is built around a simple DX idea: **the best workflow is the one you never leave the editor for.**

- **When you need to hit an API** → write a `.req` file, click Send Request, assert the response.
- **When you want to share a command** → generate a link; your teammate imports with `Cmd+Shift+I`.
- **When you organize AI assets** → browse commands, prompts, skills, and hooks in sidebar trees.

Everything below follows that pattern: short path from intent to action, progressive detail when you need it.

## 🔨 Utilities

| Utility | What it does |
|:--------|:-------------|
| [🌐 In-Editor API Testing](#-in-editor-api-testing) | Run and assert HTTP requests from `.req` files without leaving Cursor. |
| [🔗 Instant Sharing](#-instant-sharing) | Turn commands, rules, and prompts into shareable links in one click. |
| [🤖 AI Text Refinement](#-ai-text-refinement) | Polish selected text or clipboard with Google Gemini. |
| [📚 Personal Libraries](#-personal-libraries) | Reusable personal commands and prompts across all projects. |
| [🎓 Skills Management](#-skills-management) | Browse, organize, and share Cursor Agent Skills. |
| [🎯 Skills Marketplace](#-skills-marketplace) | Discover and install community skills from Tech Leads Club. |
| [📓 Project Notepads](#-project-notepads) | Project-scoped markdown notes in `.cursor/notepads/`. |
| [📋 Kanban Board](#-kanban-board) | File-backed Todo / Doing / Done board in `.cursor/kanban/`. |
| [📎 Clipboard Manager](#-clipboard-manager) | Copy/cut history, snippet slots (`clip01`), saved terminal commands. |
| [🪝 Cursor Hooks](#-cursor-hooks) | Manage personal and project `hooks.json` from the sidebar. |
| [💬 Chat Integration](#-chat-integration) | Send selections and prompts to Cursor chat faster. |
| [🗜️ File Minification](#️-file-minification) | Minify JSON, HTML, CSS, JS, and more — files or clipboard. |
| [🌐 GitHub Gist Integration](#-github-gist-integration) | Share and import via Gist for browser-friendly links. |
| [📦 MCPB Packages](#-mcpb-packages) | Install MCP server bundles (`.mcpb`) into Cursor with preview. |
| [📊 Spending (API usage)](#-spending-cursor-api-usage) | See Cursor Auto/API usage % in the status bar. |
| [🧪 DeepSpec](#-deepspec) | Spec-driven dev — install the separate **DeepSpec** extension (`godrix.deepspec`). |
| [Explorer sidebar visibility](#explorer-sidebar-visibility) | Hide individual CursorToys trees in the Explorer. |

### 🌐 In-Editor API Testing

**Test APIs where you code** — REST client with environments, helpers, and `@assert()` automation.

- Run requests from `.req` / `.request` files via CodeLens (cURL or `METHOD URL` syntax).
- **Visual request editor** (Postman-style): open `.req` files from the HTTP sidebar to edit method, URL, headers, and body; Send, Copy cURL, and create new requests (blank, paste cURL, or paste HTTP). Use **Open as text** or disable via `cursorToys.httpRequestEditor.enabled`.
- Use `{{variableName}}` from project-root `.env*` files; switch environments instantly.
- Dynamic helpers: `{{@uuid()}}`, `{{@datetime}}`, `{{@userAgent()}}`, `{{@lorem()}}`, and more.
- Responses open in a reusable panel by default (`cursorToys.httpRequestResponseView`).

```http
/*
 * @assert("Status should be 200", "res.status", "equals", 200)
 * @assert("Response should have userId", "res.body.userId", "isDefined")
 */
GET https://api.example.com/user/123
```

<details>
<summary><strong>HTTP assertions — operators, examples, and settings</strong></summary>

**Operators (27+):** `equals`, `gt`, `contains`, `matches`, `isDefined`, `isArray`, `between`, `length`, and more.

**Expression paths:** `res.status`, `res.headers.content-type`, `res.body.users[0].name`

**Settings:**
```json
{
  "cursorToys.httpAssertionsEnabled": true,
  "cursorToys.httpAssertionsShowInline": true,
  "cursorToys.httpAssertionsFailOnError": false
}
```

**HTTP skill:** Right-click your HTTP folder → **CursorToys: Add Skill: HTTP Requests Documentation** — the AI gets full docs for `.req` files, env vars, and assertions.

</details>

### 🔗 Instant Sharing

**Share AI configs as links** — no screenshots, no manual copy-paste.

- Generate deeplinks, web URLs, or CursorToys compressed format from commands, rules, prompts, and skills.
- Import anything with `Cmd+Shift+I` / `Ctrl+Shift+I`.
- Sync team instructions: one link, same file on every machine.
- [Chrome extension](https://chromewebstore.google.com/detail/cursortoys/kndhfkcjndndofieoceaknoapaadjebb) sends web selections to Cursor via deeplink.

### 🤖 AI Text Refinement

**Improve text in place** — powered by Google Gemini, keys stored in VS Code Secrets.

- `Cmd+Shift+R` / `Ctrl+Shift+R` — refine selection; `Cmd+Alt+Shift+R` — refine clipboard.
- **Process with Prompt** — run any prompt from your personal or project library on selected text.
- Models: Gemini 2.5 Flash/Pro; preserves language and intent.
- First use prompts for an API key ([Google AI Studio](https://aistudio.google.com/apikey)).

### 📚 Personal Libraries

**Your commands and prompts, everywhere** — personal (`~/.cursor/`) and project (`.cursor/`) libraries in sidebar trees.

- Browse, rename, delete, and reveal files; filter by extension.
- Organize with folders and drag-and-drop.
- Share from the tree via CursorToys format or deeplink.

### 🎓 Skills Management

**Manage Agent Skills visually** — personal and workspace skills in one tree.

- Folder hierarchy mirrors disk; auto-detects `SKILL.md`.
- Share individual skills or folders as bundles; CodeLens on `SKILL.md`.
- Create templates, move skills to personal library, import from links.

### 🎯 Skills Marketplace

**Install community skills in one click** — catalog from Tech Leads Club.

- Browse by category, search by name/author, view on GitHub.
- **CursorToys: Browse Marketplace** → Install in Cursor.
- Smart memory and disk caching for fast browsing.

### 📓 Project Notepads

**Notes that live with the repo** — markdown in `.cursor/notepads/`.

- Sidebar tree with folders and drag-and-drop.
- Create, rename, delete; share notepads or folders via CursorToys or Gist.

### 📋 Kanban Board

**Lightweight task board stored as markdown** — one card per file in `.{baseFolder}/kanban/`.

- Frontmatter field `status`: `backlog`, `todo`, `doing`, or `done`.
- Optional `tags` in frontmatter (`name` or `name:#hexcolor` per tag) with colored pills on cards.
- **CursorToys: Open Kanban Board** — three-column webview with drag-and-drop; edits persist to disk.
- Sidebar tree: create, rename, delete, and open cards (same pattern as Notepads).

### 📎 Clipboard Manager

**Reuse recent copies and saved shell commands** without leaving the editor.

- **Ctrl+C / Ctrl+X** in the editor add to history by default (`cursorToys.clipboard.bindStandardKeys`). Palette: **Copy (Add to History)** / **Cut (Add to History)**.
- **Paste from Clipboard History** — `Ctrl+Shift+V` / `Cmd+Shift+V` when the editor is focused (Quick Pick preview).
- **Snippet slots** — save with a **custom name** (sidebar shows the name + preview); stored under `~/.{baseFolder}/clipboard/slots.json`. Rename or remove from the tree context menu.
- **Command clipboard** — save selection or clipboard text as global or workspace commands; copy, run in terminal (with confirmation), pin, duplicate, rename, delete from the **Clipboard** sidebar.
- Settings: `cursorToys.clipboard.enabled`, `maxEntries`, `maxEntryChars`, `syncWithSystem`, `previewChars`.

**Other clipboard extensions:** CursorToys does not replace the system copy key by default. Use the CursorToys copy/cut commands (or rebind them), or disable overlapping keybindings in extensions such as *Clipboard Manager* / *Multi Paste* if you prefer a single history UI.

### 🪝 Cursor Hooks

**Configure Cursor hooks without hunting files** — personal and project `hooks.json`.

- Sidebar shows hooks and linked scripts.
- Create, share, import (`Cmd+Shift+I`), reveal in folder.

### 💬 Chat Integration

**Less friction between code and chat.**

- Send selection to chat (context menu); open chat with a prompt (no URL length limit when supported).
- Auto-submit injection for DeepSpec and refine-and-send flows.
- Generate prompt deeplinks from selected code with file path and line numbers.

### 🗜️ File Minification

**Shrink files and clipboard content** — JSON, HTML, XML, CSS, SVG, JS, TS.

- Context menu or **Minify File** command; clipboard auto-detection with size stats.
- Configurable output suffix.

### 🌐 GitHub Gist Integration

**Share for the web, not just Cursor** — public or private gists with version history.

- Recipients view in the browser; import back with `Cmd+Shift+I`.

### 📦 MCPB Packages

**Install MCP bundles into Cursor** — [MCP Bundle](https://github.com/modelcontextprotocol/mcpb) (`.mcpb`) support.

- Preview panel with editable env vars before writing to `~/.cursor/mcp.json`.
- Sidebar tree: reveal, uninstall; optional `npx @anthropic-ai/mcpb` for verify/unpack (`cursorToys.mcpb.useOfficialCli`).

### 📊 Spending (Cursor API usage)

**Glance at usage from the status bar** — Auto % and API % with tooltip details.

- Token auto-detected from Cursor state or set via **Configure spending session token**.
- Click opens Cursor dashboard; hide/show via commands.

### 🧪 DeepSpec

**Spec-driven development** moved to a dedicated extension: **[DeepSpec](https://github.com/godrix/DeepSpec)** (`godrix.deepspec` on the Marketplace).

- Install via **CursorToys → Settings → DeepSpec → Install DeepSpec Extension**, or command **CursorToys: Install DeepSpec Extension**.
- Your `.deepspec/` folder and `.cursor/skills/deep-spec/` skill are unchanged.
- Commands are now `deepspec.*` (replacing `cursor-toys.deepspec.*`). Settings: `deepspec.enabled`, `deepspec.reviewPanelColumn`.

### Explorer sidebar visibility

**Declutter the Explorer** without losing commands.

- `cursorToys.sidebar.hiddenViews` — hide: `notepads`, `commands`, `prompts`, `plans`, `skills`, `hooks`, `mcpb`, `http`
- `cursorToys.sidebar.explorerViews` — duplicate selected sections into the Files sidebar (default: `skills`, `plans`)

## 📋 Installation

<details open>
<summary><strong>Open VSX (Recommended)</strong></summary>

1. Open Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
2. Search **"Cursor Command Toys"**
3. Install

[Open VSX Registry](https://open-vsx.org/extension/godrix/cursor-toys)

</details>

<details>
<summary><strong>Manual via VSIX</strong></summary>

1. Download `.vsix` from [GitHub Releases](https://github.com/CursorToys/cursor-toys/releases)
2. Command Palette → **Extensions: Install from VSIX...**

</details>

<details>
<summary><strong>Local build</strong></summary>

```bash
git clone https://github.com/CursorToys/cursor-toys.git
cd cursor-toys
npm install && npm run compile && npm run package
```

Install the generated `.vsix` via Extensions → Install from VSIX.

</details>

<details>
<summary><strong>Maintainers — automated Open VSX publish</strong></summary>

Pushing to **`main`** with a **new `version` in `package.json`** runs [Publish Extension](https://github.com/CursorToys/cursor-toys/actions/workflows/publish.yml): build, publish to [Open VSX](https://open-vsx.org/extension/godrix/cursor-toys), create git tag `v{version}`, and open a [GitHub Release](https://github.com/CursorToys/cursor-toys/releases) with notes from `CHANGELOG.md` (matching `## v{version}` or `## v{base}`) plus the `.vsix` attached. If only `package.json` changed but `version` is unchanged, the workflow skips publish.

**Repository secret (required):** `OPEN_VSX_TOKEN` — [Open VSX access token](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions#1-create-an-access-token) for the `godrix` namespace.

```bash
# Bump version in package.json, commit, push to main
git add package.json
git commit -m "chore: release 2026.6.5-1"
git push origin main
```

</details>

## 🚀 Quick Start

**Three workflows, ~60 seconds.**

**1. Test an API**
```bash
# .cursor/http/api-test.req
curl -X GET https://api.github.com/users/octocat
```
Click **Send Request** above the file → response in the panel.

**2. Share a command**
1. Create `.cursor/commands/my-command.md`
2. Right-click → **Generate Cursor Toys Command**
3. Share the copied link.

**3. Import team config**
1. `Cmd+Shift+I` / `Ctrl+Shift+I`
2. Paste deeplink, CursorToys link, or Gist URL
3. File created in the right folder.

### Essential commands

| Area | Command | Shortcut |
|:-----|:--------|:---------|
| AI | Refine Selection with AI | `Cmd+Shift+R` / `Ctrl+Shift+R` |
| AI | Import from Link | `Cmd+Shift+I` / `Ctrl+Shift+I` |
| HTTP | Send HTTP Request | CodeLens on `.req` files |
| HTTP | Select HTTP Environment | Command Palette |
| Share | Generate / Share (commands, rules, prompts) | Context menu, CodeLens |
| Chat | Send Selection to Chat | Context menu |
| Tools | Minify File / Trim & Minify Clipboard | Command Palette |

Most actions are also on **CodeLens** and **right-click context menus**. Full list: Command Palette → `CursorToys:`.

## ✨ What's New

**Unreleased** — see [CHANGELOG](CHANGELOG.md) for details.

- **DeepSpec (experimental)** — Activity bar spec pipeline; off by default.
- **HTTP env at project root** — **Breaking:** `.env*` at workspace root; removed `http/environments`.
- **HTTP response panel** — Reusable webview by default; optional save to disk.
- **Explorer visibility** — `cursorToys.sidebar.hiddenViews` to hide resource trees.

**v1.13.1** — Share skills as CursorToys from Skills tree and `SKILL.md`.

**v1.13.0** — Spending status bar; Open Chat with Prompt; MCPB official CLI option.

**v1.10.0** — HTTP `@assert()` system (27+ operators); project-root env files; HTTP docs skill.

Older releases → [CHANGELOG](CHANGELOG.md).

## 🛣️ Roadmap

- **Command Templates** — Ready-to-use command library
- **Cloud Sync** — Personal libraries across machines
- **Usage Analytics** — Most-used commands at a glance
- **AI Command Builder** — Generate commands with AI
- **Public Marketplace** — Community command discovery
- **Mobile Preview** — HTTP responses at different viewport sizes

## ❤️ CursorToys Community

Thank you to our [active community](https://github.com/CursorToys/cursor-toys/discussions) — bugs, docs, design feedback, and features shape every release.

## 🤝 Contributing

Contributions welcome: code, specs, design, docs, bug reports. Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting a feature; see [AGENTS.md](AGENTS.md) for dev setup.

## 📄 Code of Conduct

[Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/)

## 🔒 Privacy

No personal or sensitive data collected. See [Privacy Policy](https://github.com/CursorToys/cursor-toys/blob/main/PRIVACY.md).

## 📝 License

MIT — see [LICENSE](LICENSE).

---

**Made with ❤️ for the Cursor community**
