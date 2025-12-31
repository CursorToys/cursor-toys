<div align="center">

# 🎮 CursorToys

### The Ultimate Productivity Toolkit for Cursor AI

**Supercharge your workflow** • **Test APIs in-editor** • **Share instantly** • **Collaborate effortlessly**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=Godrix.cursor-toys)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/d/Godrix.cursor-toys.svg)](https://marketplace.visualstudio.com/items?itemName=Godrix.cursor-toys)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/godrix/cursor-toys?label=Open%20VSX%20downloads)](https://open-vsx.org/extension/godrix/cursor-toys)

[Installation](#-quick-start) • [Features](#-features) • [Configuration](#-configuration) • [Support](#-support)

</div>

---

## 🎯 What is CursorToys?

**CursorToys** transforms Cursor AI into a **collaborative powerhouse**. Share AI configurations instantly, test APIs without leaving your editor, optimize files and clipboard content, and build reusable command libraries that work across all your projects.

> **Stop context-switching.** Everything you need to maximize Cursor AI productivity, in one extension.

### Why Developers Love It

```
✨ One-click sharing     → No more copy-pasting commands
🚀 In-editor API testing → Zero external tools, environment variables support
📚 Personal libraries    → Reusable across all projects
👥 Team collaboration    → Sync AI configs instantly
🗜️ File optimization    → Minify JSON, HTML, CSS, JS instantly
📋 Smart clipboard      → Auto-detect and optimize clipboard content
```

---

## 🎬 See It In Action

<table>
<tr>
<td width="50%">

### 🔗 Share Commands Instantly
![Share Commands](.github/assets/share-command-and-generate-deeplink.gif)
*Generate shareable links with one click*

</td>
<td width="50%">

### 📥 Import Configurations
![Import Commands](.github/assets/import-commands-rules-prompts.gif)
*Import team configs in seconds*

</td>
</tr>
<tr>
<td colspan="2">

### 📚 Personal Command Library
![Personal Commands](.github/assets/personal-commands-view-tree.gif)
*Visual tree view for all your commands and prompts*

</td>
</tr>
</table>

---

## ✨ Features

### 🔗 Instant Sharing & Collaboration

**Share AI configurations in one click** — No more screenshots or copy-pasting.

- 🎯 **One-Click Share Links** — Convert commands, rules, and prompts to shareable deeplinks
- ⌨️ **Fast Import** — `Cmd+Shift+I` to import from any link
- 🔄 **Multiple Formats** — Deeplink, web URL, or custom protocols
- 👥 **Team Sync** — Everyone uses the same AI instructions

### 🌐 In-Editor API Testing

**Test APIs without leaving Cursor** — Full REST client built-in.

- 🚀 **Execute Requests** — Run HTTP requests from `.req` files with CodeLens
- 📝 **Multiple Formats** — cURL commands or structured JSON
- ⚡ **Performance Tracking** — See execution time for each request
- 🎨 **Syntax Highlighting** — Beautiful highlighting for requests and responses
- 🌍 **Environment Variables** — Use `{{variableName}}` for dynamic values
- 🔧 **Multiple Environments** — Switch between dev, staging, prod instantly
- 💾 **Auto-Save Responses** — Or preview-only mode for quick tests

### 📚 Personal Command Libraries

**Build reusable libraries** — Commands that work across all projects.

- 🗂️ **Visual Tree View** — Browse all personal commands and prompts in Explorer sidebar
- 🏠 **Personal + Project** — Separate libraries for personal and project-specific
- ✏️ **Easy Management** — Rename, delete, reveal in folder
- 🔍 **Smart Filtering** — Filter by file extensions
- 📂 **Hierarchical Folders** — Organize in subfolders with drag-and-drop
- 🎯 **Drag & Drop** — Move commands/prompts between folders easily

### 🗜️ File Minification & Optimization

**Optimize files and clipboard content** — Reduce file sizes instantly.

- 📦 **Minify Files** — One-click minification for JSON, HTML, XML, CSS, SVG, JS, TS
- 📋 **Clipboard Minification** — Minify clipboard content with auto-detection
- 📊 **Statistics** — See original size, minified size, and savings percentage
- ⚙️ **Configurable** — Customize output suffix and behavior
- 🎯 **Context Menu** — Right-click any supported file → Minify File

### 💬 Chat Integration

**Send code to Cursor AI faster** — No manual copy-paste.

- ✂️ **Send Selection** — Right-click → Send to Chat
- 🔗 **Prompt Deeplinks** — Generate shareable prompt links from selected code
- 📝 **Custom Text** — Send any text directly to chat
- 📍 **Context Included** — File path, language, and line numbers auto-added

---

## 🚀 Quick Start

### Installation

**Option 1: VS Code Marketplace** (Recommended)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Godrix.cursor-toys)
- [Open VSX Registry](https://open-vsx.org/extension/godrix/cursor-toys) (for Cursor and other editors)

**Option 2: Manual Installation**
1. Download the latest `.vsix` from [GitHub Releases](https://github.com/godrix/cursor-toys/releases)
2. Open Cursor/VS Code
3. Go to Extensions (`Cmd+Shift+X`)
4. Click `...` → `Install from VSIX...`
5. Select the downloaded file

### First Steps

1. **Open Command Palette** (`Cmd+Shift+P`)
2. Type **"CursorToys"** to see all available commands
3. Try **"CursorToys: Generate Share Link"** on a command file
4. Press **`Cmd+Shift+I`** to import a shared link

---

## 📖 Usage Examples

### 🔗 Sharing Commands

**Right-click any command file** → `CursorToys: Generate Command Share Link`

```bash
# Share link copied to clipboard!
cursor://godrix.cursor-toys/command?text=...

# Or web format
https://cursor.com/link/command?text=...
```

**Send to team** → They press `Cmd+Shift+I` → Command imported ✨

### 🌐 HTTP Request Testing

**Create a `.req` file** in `.cursor/http/`:

```http
## Get Users
GET {{BASE_URL}}/api/users
Authorization: Bearer {{API_TOKEN}}

## Create User  
POST {{BASE_URL}}/api/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Set up environment variables** in `.cursor/http/environments/.env.dev`:

```env
BASE_URL=http://localhost:3000
API_TOKEN=your-dev-token-here
```

**Click CodeLens "Send Request"** → Variables replaced → Response appears instantly! ⚡

### 🗜️ Minify Files

**Optimize any file with one click:**

```bash
# Right-click any JSON, HTML, XML, CSS, SVG, JS, or TS file
→ "Minify File"
→ Creates file.min.ext with optimized content
```

**Or minify clipboard content:**

```bash
# Copy large JSON/HTML/CSS to clipboard
Cmd+Shift+P → "Trim & Minify Clipboard"
→ Clipboard optimized automatically!
```

**Statistics shown:** `Savings: 15.3KB (68.2%) | Original: 22.4KB → Minified: 7.1KB`

### 📚 Personal Commands

Your personal commands in `~/.cursor/commands/` appear in the sidebar:

```
📁 Personal Commands
  ├─ 📄 code-review.md
  ├─ 📄 refactor-helper.md
  └─ 📄 bug-analyzer.md
```

**Right-click** → Generate link, rename, delete, or reveal in folder.

---

## ⚙️ Configuration
- Send selected code directly to Cursor chat
- Custom text injection for faster context building
- Streamlined AI interaction workflow

## 🚀 Installation

### Quick Install (Recommended)

**For Cursor/VS Code:**
- Open Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
- Search for **"Cursor Command Toys"**
- Click Install

**Direct Links:**
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Godrix.cursor-toys)
- [Open VSX Registry](https://open-vsx.org/extension/godrix/cursor-toys) (for Cursor and other editors)

### Manual Install

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/godrix/cursor-toys/releases)
2. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run **"Extensions: Install from VSIX..."**
4. Select the downloaded file

**That's it!** The extension is ready to enhance your Cursor experience.

## 📖 Quick Start Guide

### 🎯 **Get Started in 60 Seconds**

**Step 1: Test an API (30 seconds)**
```bash
# Create .cursor/http/api-test.req in your project
curl -X GET https://api.github.com/users/octocat
```
Click the "Send Request" link that appears above → See formatted response!

**Step 2: Share a Command (20 seconds)**
1. Create `.cursor/commands/my-command.md`
2. Right-click → "Generate Cursor Toys Command"
3. Link copied! Share it anywhere.

**Step 3: Import Team Config (10 seconds)**
1. Press `Cmd+Shift+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
2. Paste a deeplink
3. Done! File created automatically.

### 🎯 **Daily Workflow Scenarios**

#### Scenario 1: Testing an API Endpoint
1. Create `.cursor/http/api-test.req` in your project
2. Write your curl command or JSON request
3. Click the "Send Request" CodeLens link
4. View formatted response with execution time

#### Scenario 2: Sharing a Team Command
1. Create your command in `.cursor/commands/`
2. Right-click → "Generate Cursor Toys Command"
3. Share the link in your team chat
4. Team members import with `Cmd+Shift+I`

#### Scenario 3: Building a Personal Command Library
1. Use the Personal Commands tree view
2. Save frequently used commands as personal commands
3. Access them from any project instantly
4. Organize and manage your AI command collection

## 🤝 Detailed Usage: Share and Import

### Generating Share Links

![Share Command and Generate Deeplink](.github/assets/share-command-and-generate-deeplink.gif)

#### Method 1: Context Menu (Recommended for Quick Generation)

1.  Navigate to the configuration file you wish to share:
      * `.cursor/commands/` or `.claude/commands/` (for Commands)
      * `.cursor/rules/` (for Rules)
      * `.cursor/prompts/` (for Prompts)
2.  **Right-click** the file and select the specific **"Generate Cursor Toys..."** option (e.g., "Generate Cursor Toys Command").
3.  The share link will be **automatically copied to your clipboard**.

#### Method 2: CodeLens (Direct In-File Access)

1.  Open any file in `.cursor/commands/`, `.claude/commands/`, `.cursor/rules/`, or `.cursor/prompts/`.
2.  Click the CodeLens link displayed at the top of the file.
3.  The deeplink will be generated and copied.

### Importing Shared Links

![Import Commands, Rules, and Prompts](.github/assets/import-commands-rules-prompts.gif)

#### Method 1: Keyboard Shortcut

1.  Press **`Ctrl+Shift+I`** (Windows/Linux) or **`Cmd+Shift+I`** (Mac).
2.  Paste the deeplink into the input box.
3.  For **commands**, choose where to save:
    - **Project commands**: Save to `.cursor/commands/` or `.claude/commands/` in the current workspace (based on configuration, project-specific)
    - **Personal commands**: Save to `~/.cursor/commands/` or `~/.claude/commands/` (based on configuration, available in all projects)
4.  The file will be **automatically created and imported** into the appropriate directory.

#### Method 2: Command Palette

1.  Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux).
2.  Type **"Import Cursor Toys"**.
3.  Paste the deeplink, and for commands, choose the save location.
4.  The file will be created.

### Saving Commands as User Commands

You can move existing project commands to your personal commands folder so they're available across all projects:

1.  Right-click on any file in `.cursor/commands/` or `.claude/commands/` folder.
2.  Select **"Cursor Toys"** submenu.
3.  Choose **"Save as User Command"**.
4.  The command will be copied to `~/.cursor/commands/` or `~/.claude/commands/` (based on your configuration) and you'll be asked if you want to remove the original file from the workspace.

## 🌐 HTTP Request Execution

**Test APIs without leaving your editor.** Execute HTTP requests directly from your workspace with full syntax highlighting, automatic response formatting, and performance tracking.

### Visual Demo
![Send HTTP Request](.github/assets/send-request.gif)

### Creating HTTP Request Files

**Important**: HTTP request files must be located in the `.cursor/http/` folder (or subfolders within it) to be recognized by the extension.

Create files with `.req` or `.request` extension in `.cursor/http/` containing your HTTP requests in one of two formats:

#### Format 1: Curl Command
```bash
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token123" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

#### Format 2: Structured JSON
```json
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  },
  "body": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Executing Requests

#### Method 1: CodeLens (Recommended)
1. Open any `.req` or `.request` file in `.cursor/http/` folder
2. Click the **"Send Request"** link that appears above the request (or above each section if you have multiple requests)
3. The request will be executed and the response will be displayed

#### Method 2: Command Palette
1. Open any `.req` or `.request` file in `.cursor/http/` folder
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type **"CursorToys: Send HTTP Request"** and select it
4. The request will be executed

**Note**: Files must be in `.cursor/http/` (or subfolders) to be recognized. The extension will not show CodeLens links for `.req` files outside this folder.

### Multiple Requests in One File

You can organize multiple requests in a single file using markdown sections. Create the file in `.cursor/http/`:

```markdown
## Get User
curl -X GET https://api.example.com/users/123 \
  -H "Authorization: Bearer token123"

## Create User
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token123" \
  -d '{"name": "John Doe"}'
```

Each section will have its own "Send Request" CodeLens link, allowing you to execute requests individually.

### File Location Requirements

**HTTP request files must be located in:**
- `.cursor/http/` (root level)
- `.cursor/http/subfolder/` (any subfolder)

**Supported file extensions:**
- `.req`
- `.request`

**Example file structure:**
```
project/
  .cursor/
    http/
      api-tests.req
      auth/
        login.request
      users.req
```

### Response Files

When a request is executed:
- **If `httpRequestSaveFile` is `true`**: The response is saved to a `.res` or `.response` file (same name as request file, with response extension)
- **If `httpRequestSaveFile` is `false`**: The response is shown in a preview tab (not saved to disk)

Response files include:
- HTTP status code and status text
- Response headers
- Formatted response body (JSON and XML are automatically formatted)
- Execution time in the file name/title

### Configuration

Configure HTTP request behavior in your settings:

```json
{
  "cursorToys.httpRequestTimeout": 10,
  "cursorToys.httpRequestSaveFile": false
}
```

- **`cursorToys.httpRequestTimeout`**: Timeout in seconds for HTTP requests (default: 10 seconds)
- **`cursorToys.httpRequestSaveFile`**: Save HTTP response to file. If `false`, only shows preview without saving (default: `false`)

### Requirements

- **curl**: The extension uses `curl` command-line tool to execute requests. Make sure `curl` is installed and available in your system PATH.

### HTTP Environment Variables

**Manage environment-specific configurations** for your API requests.

#### Setting Up Environments

1. **Initialize Environments Folder**:
   - Navigate to `.cursor/http/` folder in your workspace
   - Right-click → "CursorToys: Create Environments Folder"
   - Or use Command Palette → "CursorToys: Create Environments Folder"

2. **Environment Files Structure**:
   ```
   .cursor/http/
     environments/
       .env              # Default environment
       .env.dev          # Development environment
       .env.staging      # Staging environment
       .env.prod         # Production environment
       .env.example      # Template with documentation
       .gitignore        # Protects sensitive data
   ```

3. **Create Environment Variables**:
   ```env
   # .cursor/http/environments/.env.dev
   BASE_URL=http://localhost:3000
   API_KEY=your-dev-api-key
   AUTH_TOKEN=dev-token-123
   TIMEOUT=10000
   API_VERSION=v1
   ```

#### Using Variables in Requests

Use `{{variableName}}` syntax in your `.req` files:

```http
## Get User Profile
GET {{BASE_URL}}/api/{{API_VERSION}}/users/me
Authorization: Bearer {{AUTH_TOKEN}}
Content-Type: application/json

## Update User
PUT {{BASE_URL}}/api/{{API_VERSION}}/users/123
Authorization: Bearer {{AUTH_TOKEN}}
Content-Type: application/json

{
  "name": "Updated Name"
}
```

#### Switching Environments

**Method 1: Command Palette**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "CursorToys: Select HTTP Environment"
3. Choose environment from list (dev, staging, prod, etc.)

**Method 2: Configuration**
```json
{
  "cursorToys.httpDefaultEnvironment": "dev"
}
```

#### Environment Management Commands

| Command | Description |
|:--------|:------------|
| CursorToys: Select HTTP Environment | Switch between environments |
| CursorToys: Open Environments Folder | Open environments folder |
| CursorToys: Create Environment | Create new environment file |
| CursorToys: Create Environments Folder | Create default structure |

#### Features

- ✅ **Case-Insensitive**: Variables match regardless of case
- ✅ **Validation**: Warns about unresolved variables before sending
- ✅ **Caching**: Fast variable lookup with automatic cache management
- ✅ **Git Safe**: Includes `.gitignore` to protect sensitive data
- ✅ **Multiple Formats**: Supports quoted and unquoted values

#### Variable File Format

```env
# Comments start with #
KEY=value
KEY_WITH_QUOTES="value with spaces"
KEY_WITH_SINGLE='single quotes also work'

# Empty lines are ignored

# No spaces around = sign (best practice)
CORRECT=value
# INCORRECT = value  # spaces cause issues
```

## 🗜️ File Minification & Clipboard Optimization

**Optimize your files and clipboard content to reduce size and improve performance.**

### Minifying Files

**Supported File Types:**
- 📄 **JSON** — Remove whitespace, compact structure
- 🌐 **HTML** — Remove comments, excess whitespace, line breaks
- 📋 **XML** — Remove comments, whitespace
- 🎨 **CSS** — Remove comments, whitespace, unnecessary semicolons
- 🖼️ **SVG** — Remove metadata, comments, optimize structure
- 💻 **JavaScript** — Remove comments and excess whitespace
- 📘 **TypeScript** — Remove comments and excess whitespace

#### Method 1: Context Menu (Recommended)

1. Right-click any supported file in Explorer or editor
2. Select **"CursorToys: Minify File"**
3. Minified file created with configurable suffix (default: `.min`)
4. Statistics shown: `Savings: 15.3KB (68.2%) | Original: 22.4KB → Minified: 7.1KB`

#### Method 2: Editor Title

1. Open any supported file
2. Click minify icon (📦) in editor title bar
3. Minified file created automatically

#### Method 3: Command Palette

1. Open file to minify
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "CursorToys: Minify File"
4. Minified file created

### Minifying Clipboard Content

**Perfect for optimizing large JSON responses, HTML snippets, or CSS before pasting into chat.**

#### Auto-Detection Mode (Recommended)

1. Copy content to clipboard
2. Press `Cmd+Shift+P` → "CursorToys: Trim & Minify Clipboard"
3. Content type auto-detected and minified
4. Optimized content replaces clipboard
5. Statistics shown

#### Manual Type Selection

1. Copy content to clipboard
2. Press `Cmd+Shift+P` → "CursorToys: Trim & Minify Clipboard (Select Type)"
3. Choose content type from list
4. Content minified based on selected type
5. Statistics shown

### Minification Examples

#### JSON Minification

**Before (234 bytes):**
```json
{
  "user": {
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  }
}
```

**After (71 bytes, 69.7% savings):**
```json
{"user":{"name":"John Doe","email":"john@example.com","age":30}}
```

#### HTML Minification

**Before (312 bytes):**
```html
<!DOCTYPE html>
<html>
  <head>
    <title>Page Title</title>
  </head>
  <body>
    <!-- Comment -->
    <h1>Hello World</h1>
  </body>
</html>
```

**After (89 bytes, 71.5% savings):**
```html
<!DOCTYPE html><html><head><title>Page Title</title></head><body><h1>Hello World</h1></body></html>
```

### Configuration

```json
{
  // Suffix for minified files (e.g., .min creates file.min.js)
  "cursorToys.minify.outputSuffix": ".min",
  
  // Preserve comments (future feature)
  "cursorToys.minify.preserveComments": false
}
```

### Use Cases

#### Use Case 1: Optimize API Responses for Chat
**Problem:** Large JSON responses exceed chat context limits.

**Solution:**
1. Copy JSON response to clipboard
2. Run "Trim & Minify Clipboard"
3. Paste optimized JSON into chat
4. **Result:** More context available for AI

#### Use Case 2: Reduce Build Output Size
**Problem:** Production files too large.

**Solution:**
1. Right-click CSS/JS files → "Minify File"
2. Deploy `.min` versions
3. **Result:** Faster load times, reduced bandwidth

#### Use Case 3: Clean HTML Templates
**Problem:** HTML templates with excessive whitespace and comments.

**Solution:**
1. Open template file
2. Click minify icon in title bar
3. Use minified version in production
4. **Result:** Cleaner, smaller HTML files

### Minification Statistics

After minification, you'll see detailed statistics:

```
✅ Clipboard minified! 
Savings: 15.3KB (68.2%) | Original: 22.4KB → Minified: 7.1KB
```

- **Savings**: Amount of space saved (in KB)
- **Percentage**: Reduction percentage
- **Original**: Original file/clipboard size
- **Minified**: Final size after minification

## 🔗 Link Formats & Distribution

Choose the link format that works best for your sharing needs:

| Format | Example | Best For |
| :--- | :--- | :--- |
| **Deeplink** | `cursor://godrix.cursor-toys/prompt?text=...` | Direct sharing in Slack, Discord, or other tools that support native links |
| **Web Link** | `https://cursor.com/link/prompt?text=...` | Blogs, documentation, forums, or any platform requiring HTTP links |
| **Custom** | `https://example.com/link/prompt?text=...` | Internal systems, custom distribution channels, or branded sharing |

### All Configuration Options

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **Link Generation** |
| `cursorToys.linkType` | `string` | `"deeplink"` | Link format: `"deeplink"`, `"web"`, or `"custom"` |
| `cursorToys.customBaseUrl` | `string` | `""` | Custom base URL (only used when `linkType` is `"custom"`) |
| `cursorToys.allowedExtensions` | `string[]` | `["md", "mdc"]` | File extensions allowed for link processing |
| **Folder Configuration** |
| `cursorToys.baseFolder` | `string` | `"cursor"` | Base folder for commands and HTTP files (e.g., `"cursor"`, `"vscode"`, `"ai"`) |
| `cursorToys.commandsFolder` | `string` | `"cursor"` | Commands folder: `"cursor"` or `"claude"` |
| `cursorToys.personalCommandsView` | `string` | `"both"` | Personal commands view: `"both"`, `"cursor"`, or `"claude"` |
| **HTTP Requests** |
| `cursorToys.httpRequestTimeout` | `number` | `10` | HTTP request timeout in seconds |
| `cursorToys.httpRequestSaveFile` | `boolean` | `false` | Save HTTP responses to file (vs preview only) |
| `cursorToys.httpDefaultEnvironment` | `string` | `"dev"` | Default HTTP environment name |
| **Minification** |
| `cursorToys.minify.outputSuffix` | `string` | `".min"` | Suffix for minified files (e.g., `.min` creates `file.min.js`) |
| `cursorToys.minify.preserveComments` | `boolean` | `false` | Preserve comments when minifying (future feature) |

## 🔄 VS Code Compatibility

CursorToys is fully compatible with VS Code, but some Cursor-specific features have limitations:

### ✅ Features That Work Fully in VS Code

- **Personal Commands/Prompts Management** — Full library management with tree view
- **In-Editor API Testing** — Complete HTTP request testing with environment variables
- **File Minification** — All minification features work identically
- **Clipboard Processing** — Smart clipboard optimization
- **Web-Based Sharing Links** — Use `https://cursor.com/link/` format
- **Custom Base Folder** — Configure any folder name (e.g., `.vscode`, `.ai`)

### ⚠️ Features With Limitations in VS Code

#### Deeplinks (`cursor://`)
**Limitation:** Native `cursor://` protocol links do not open automatically in VS Code (clicking won't trigger the extension).

**Workaround:** Deeplinks still work, but require manual import:
1. Copy the `cursor://` deeplink
2. Open Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
3. Run **"CursorToys: Import Share Link"** (or use shortcut `Cmd+Shift+I` / `Ctrl+Shift+I`)
4. Paste the deeplink when prompted
5. File will be created successfully

**Alternative:** Configure link type to web for better sharing:
```json
{
  "cursorToys.linkType": "web"
}
```

#### Send to Chat
**Limitation:** Commands that send text to Cursor's AI chat won't work (no chat in VS Code).

**Workaround:** Manually copy the generated content and use it in a compatible chat interface or AI tool.

#### Rules and Prompts
**Limitation:** Rules and prompts are Cursor-specific features that may not work in VS Code.

**Note:** These features use the configured base folder, but their functionality depends on Cursor AI's architecture. They work for organization and sharing, but won't have the same behavior in VS Code as in Cursor IDE.

### 🚀 Using CursorToys with VS Code

1. **Install the extension** normally from VS Code Marketplace
2. **Configure base folder** in settings:
   ```json
   {
     "cursorToys.baseFolder": "vscode"
   }
   ```
3. **Set link type** to web:
   ```json
   {
     "cursorToys.linkType": "web"
   }
   ```
4. **All file management and API testing features work perfectly!**

> **Note:** The `baseFolder` setting applies to all resources (commands, rules, prompts, HTTP). Rules and prompts are Cursor AI-specific features - they'll be stored in your configured folder but may not have full functionality outside of Cursor IDE.

## 💡 Real-World Use Cases

### Use Case 1: Team Onboarding
**Problem**: New team members need to set up Cursor with project-specific commands and rules.

**Solution**: 
1. Team lead creates standardized commands and rules
2. Generates deeplinks for each configuration
3. Shares links in onboarding documentation
4. New members import everything with `Cmd+Shift+I` in seconds

**Result**: Consistent AI behavior across the entire team from day one.

### Use Case 2: API Development Workflow
**Problem**: Constantly switching between editor and terminal/Postman to test API endpoints.

**Solution**:
1. Create `.req` files in `.cursor/http/` folder (or subfolders)
2. Set up environment variables in `.cursor/http/environments/`
3. Use `{{VARIABLE}}` syntax for dynamic values
4. Execute directly from editor with CodeLens
5. Switch environments via status bar or command palette
6. View formatted responses with execution times

**Result**: Faster iteration, better context, no context switching. Environment-specific testing without manual value changes.

### Use Case 3: Optimizing Large API Responses
**Problem**: Large JSON responses from APIs take up too much space in chat context.

**Solution**:
1. Copy API response to clipboard
2. Run "Trim & Minify Clipboard" command
3. Paste optimized JSON into Cursor chat
4. More room for actual code and questions

**Result**: Better use of chat context limits, faster AI responses, cleaner conversations.

### Use Case 4: Personal Productivity
**Problem**: Recreating the same commands in every new project.

**Solution**:
1. Build a personal command library using the tree view
2. Save frequently used commands as personal commands
3. Access them instantly in any project
4. Share your best commands with the community

**Result**: Your best AI workflows available everywhere, instantly.

### Use Case 5: Knowledge Sharing
**Problem**: Great AI prompts and commands get lost in Slack/Discord history.

**Solution**:
1. Create a command/prompt that solves a specific problem
2. Generate a shareable deeplink
3. Share in team channels or documentation
4. Team members can import and use immediately

**Result**: Knowledge becomes reusable, searchable, and permanent.

-----

## ⚙️ Configuration & Customization

### Workspace vs User Settings

Configure the extension at both workspace and user levels:

- **Workspace settings**: Project-specific configurations (`.vscode/settings.json`)
- **User settings**: Personal preferences that apply globally

### Recommended Settings

```json
{
  // Use web links for maximum compatibility
  "cursorToys.linkType": "web",
  
  // Save HTTP responses for API testing workflow
  "cursorToys.httpRequestSaveFile": true,
  "cursorToys.httpRequestTimeout": 30,
  "cursorToys.httpDefaultEnvironment": "dev",
  
  // Support both .cursor and .claude folders
  "cursorToys.commandsFolder": "cursor",
  "cursorToys.personalCommandsView": "both",
  
  // Minification settings
  "cursorToys.minify.outputSuffix": ".min"
}
```

## 📝 Limitations & Notes

  * **URL Length Limit**: Deeplink content cannot exceed 8,000 characters (after URL-encoding). The system will warn you if this limit is reached.
  * **File Location for Deeplinks**: Only files within `.cursor/commands/`, `.claude/commands/`, `.cursor/rules/`, or `.cursor/prompts/` folders can be converted into share links.
  * **HTTP Request File Location**: HTTP request files (`.req`, `.request`) must be located in `.cursor/http/` folder (or subfolders) to be recognized and executed.
  * **HTTP Requests**: Requires `curl` to be installed and available in your system PATH.

## ⌨️ Available Commands

| Command | Description | Shortcut |
| :--- | :--- | :--- |
| **Sharing & Import** |
| CursorToys: Generate Share Link | Generate share link (opens type selector) | - |
| CursorToys: Generate Command Share Link | Generate command share link | - |
| CursorToys: Generate Rule Share Link | Generate rule share link | - |
| CursorToys: Generate Prompt Share Link | Generate prompt share link | - |
| CursorToys: Import Share Link | Import share link to create file | `Ctrl+Shift+I` / `Cmd+Shift+I` |
| CursorToys: Save as User Command | Save project command as personal command | - |
| CursorToys: Save as User Prompt | Save project prompt as personal prompt | - |
| **HTTP Requests** |
| CursorToys: Send HTTP Request | Execute HTTP request from file | - |
| CursorToys: Select HTTP Environment | Switch HTTP environment | - |
| CursorToys: Open Environments Folder | Open environments folder | - |
| CursorToys: Create Environment | Create new environment file | - |
| CursorToys: Create Environments Folder | Create environments folder structure | - |
| **Minification** |
| CursorToys: Minify File | Minify current file | - |
| CursorToys: Trim & Minify Clipboard | Auto-detect and minify clipboard | - |
| CursorToys: Trim & Minify Clipboard (Select Type) | Select type and minify clipboard | - |
| **Chat Integration** |
| CursorToys: Send to Chat | Send custom text to Cursor chat | - |
| CursorToys: Send Selection to Chat | Send selected code to Cursor chat | - |
| CursorToys: Copy Selection as Prompt | Copy selection as prompt link | - |

**Pro Tip**: Most commands are accessible via CodeLens (clickable links in your files) or context menu (right-click), so you rarely need to remember command names!

## 🎁 Developer Experience Benefits

### ⏱️ **Time Savings**
- **No more manual file copying**: Import team configurations in seconds
- **No context switching**: Test APIs without leaving your editor
- **Instant access**: Personal commands available across all projects

### 🧠 **Cognitive Load Reduction**
- **Visual organization**: Tree view makes command management intuitive
- **One-click actions**: CodeLens eliminates menu navigation
- **Automatic formatting**: Responses formatted for readability

### 🤝 **Team Productivity**
- **Consistency**: Everyone uses the same AI configurations
- **Knowledge sharing**: Best practices become reusable assets
- **Onboarding speed**: New team members productive faster

### 🚀 **Workflow Enhancement**
- **Integrated testing**: API testing where you code
- **Command library**: Build once, use everywhere
- **Seamless sharing**: Turn configurations into shareable links instantly

---

## 🤝 Contributing

We welcome contributions! Whether it's:
- 🐛 Bug reports
- 💡 Feature suggestions
- 📝 Documentation improvements
- 🔧 Code contributions

Please feel free to [open an issue](https://github.com/godrix/cursor-toys/issues) or submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for the Cursor community**