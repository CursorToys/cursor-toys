# Change Log

All notable changes to the "CursorToys" extension will be documented in this file.

## [1.8.0] - 2026-01-24

### Added

#### 🎓 **Enhanced Skills Management**
- **Save as Personal Skill**: New command `cursor-toys.save-as-user-skill` to move skills from project to personal folder
  - Available via context menu for skill folders
  - Moves skills to `~/.cursor/skills/` or `~/.claude/skills/` based on configuration
  - Automatically creates personal skills folder if needed
- **Create Skill Command**: New command `cursor-toys.createSkill` to create new skills
  - Available from Skills view title bar and context menu
  - Creates new skill folder with SKILL.md file
  - Supports both personal and project skills
- **Enhanced Sharing for Commands and Prompts**:
  - New command `cursor-toys.shareUserCommandAsCursorToys`: Share personal commands as CursorToys format
  - New command `cursor-toys.shareUserPromptAsCursorToys`: Share personal prompts as CursorToys format
  - Available in context menu for Commands and Prompts views

### Changed

#### 🔧 **AI Provider Architecture Refactoring**
- **Simplified AI Provider Interface**: Refactored from abstract base class to direct implementation
  - Removed `BaseAIProvider` abstract class in favor of simpler interface-based approach
  - `GeminiProvider` now implements `AIProvider` interface directly
  - Reduced code complexity and improved maintainability
- **Improved Error Handling**: Enhanced error messages and timeout handling
  - Better error messages for API key validation
  - Improved timeout error messages with retry information
  - Enhanced quota/rate limit error handling with retry time extraction
  - More detailed error context for debugging
- **API Key Management**: Streamlined API key management
  - Simplified API key storage and retrieval
  - Improved validation flow
  - Better error messages for configuration issues

#### 🎯 **Skills Management Improvements**
- **Folder-Based Structure**: Updated Skills tree view to use folder-based structure
  - Skills are now displayed as folders (not individual files)
  - Context menu actions work on skill folders
  - Better visual organization matching actual file structure
- **Command Title Consistency**: Updated command titles for better clarity
  - "Generate Deeplink" commands now consistently named
  - "Share as CursorToys" commands clearly distinguished from deeplinks
  - Improved command palette organization
- **Context Menu Organization**: Improved context menu structure
  - Removed category-level share actions from Commands and Prompts views
  - Better organization of sharing options
  - Clearer separation between deeplink and CursorToys sharing

#### ⌨️ **Keyboard Shortcuts**
- **Refine Selection Shortcut**: Removed `when` clause from `refineSelectionWithAI` shortcut
  - Shortcut now works globally, not just when text is selected
  - More consistent behavior with other refinement commands

### Technical Details

#### Enhanced Files
- **`src/aiProviders/geminiProvider.ts`**:
  - Refactored from abstract base class to direct implementation
  - Simplified API key management methods
  - Improved error handling with detailed error messages
  - Better timeout handling with retry information
  - Enhanced quota/rate limit error detection
- **`src/aiProviders/index.ts`**:
  - Removed `BaseAIProvider` abstract class
  - Simplified `AIProvider` interface
  - Updated `getAIProvider()` factory function
  - Added `RefinementOptions` interface for better type safety
- **`src/textRefiner.ts`**:
  - Updated to use new simplified provider interface
  - Improved error handling flow
  - Better integration with new provider architecture
- **`src/extension.ts`**:
  - Added `save-as-user-skill` command registration
  - Added `createSkill` command registration
  - Added `shareUserCommandAsCursorToys` and `shareUserPromptAsCursorToys` commands
  - Updated Skills tree provider integration
  - Improved context menu organization
  - Updated command titles for consistency
- **`src/shareableGenerator.ts`**:
  - Enhanced to support new sharing commands for Commands and Prompts
  - Improved validation for Skills sharing
- **`src/shareableImporter.ts`**:
  - Enhanced Skills import flow
  - Improved folder structure handling for Skills
- **`src/userSkillsTreeProvider.ts`**:
  - Updated to handle folder-based items correctly
  - Improved context value handling for skill folders
  - Better integration with new commands
- **`package.json`**:
  - Version bumped from 1.7.0 to 1.8.0
  - Added new activation events for Skills commands
  - Updated command titles for consistency
  - Reorganized command palette entries
  - Updated AI provider configuration descriptions
  - Improved keyboard shortcut configuration

#### New Commands
- `cursor-toys.save-as-user-skill`: Move skill from project to personal folder
- `cursor-toys.createSkill`: Create new skill folder with SKILL.md
- `cursor-toys.shareUserCommandAsCursorToys`: Share personal command as CursorToys format
- `cursor-toys.shareUserPromptAsCursorToys`: Share personal prompt as CursorToys format

### Use Cases

**Moving Skills to Personal Library:**
1. Right-click on skill folder in Skills view
2. Select "Move to Personal Skills"
3. Skill is moved to `~/.cursor/skills/` or `~/.claude/skills/`
4. Skill is now available across all projects

**Creating New Skills:**
1. Click "Create Skill" button in Skills view title bar
2. Enter skill name
3. Choose Personal or Project location
4. SKILL.md file is created and opened in editor

**Sharing Personal Commands/Prompts:**
1. Right-click on command or prompt in tree view
2. Select "Share as CursorToys"
3. Shareable link is copied to clipboard
4. Share with team members

## [1.7.0] - 2026-01-23

### Added

#### 🤖 **AI-Powered Text Refinement**
- **AI Text Refiner**: Refine text and code using AI providers
  - New command `cursor-toys.refineSelectionWithAI`: Refine selected text in editor with AI
  - New command `cursor-toys.refineClipboardWithAI`: Refine clipboard text with AI
  - Keyboard shortcuts: `Cmd+Shift+R` (selection) and `Cmd+Alt+Shift+R` (clipboard)
  - Support for multiple AI providers (currently Google Gemini)
  - Configurable AI model and refinement prompt
  - Secure API key storage using VS Code Secrets API
- **AI Provider Commands**:
  - `cursor-toys.configureAIProvider`: Configure AI provider and API key
  - `cursor-toys.removeAIProviderKey`: Remove stored API key
- **Gemini Provider**: Complete integration with Google Gemini API
  - Support for Gemini 2.5 Flash and Pro models
  - Automatic model selection (defaults to gemini-2.5-flash)
  - Safety settings optimized for code and text refinement
  - Configurable request timeout (default: 30 seconds)
  - Comprehensive error handling with user-friendly messages
- **AI Configuration Options**:
  - `cursorToys.aiProvider`: Choose AI provider (default: "gemini")
  - `cursorToys.aiModel`: Specify AI model (e.g., "gemini-2.5-flash", "gemini-2.5-pro")
  - `cursorToys.aiRefinePrompt`: Customize refinement prompt
  - `cursorToys.aiRequestTimeout`: Set request timeout in seconds (default: 30)

### Changed
- **HTTP Environment Management**: Enhanced environment folder creation
  - Automatically creates HTTP folder with llms.txt when environments are initialized
  - llms.txt provides comprehensive documentation on HTTP features and usage
  - Includes examples for cURL, REST Client format, variables, and helper functions
  - Updates to environment manager ensure HTTP folder exists before operations

### Technical Details

#### New Files
- **`src/textRefiner.ts`**: Core text refinement system
  - `refineClipboard()`: Refine clipboard text with AI
  - `refineSelectedText()`: Refine selected text in editor
  - `getAIProvider()`: Factory function for AI provider instances
  - Progress indicators and error handling
  - Automatic API key configuration flow
- **`src/aiProviders/index.ts`**: AI provider interface and types
  - `AIProvider` interface: Standard interface for all AI providers
  - `AIProviderType`: Type union for supported providers
  - Provider discovery and validation
- **`src/aiProviders/geminiProvider.ts`**: Google Gemini implementation
  - Singleton pattern for global access
  - API key management with VS Code Secrets
  - Text refinement with safety settings
  - Model validation and configuration
  - Comprehensive error handling

#### Enhanced Files
- **`src/extension.ts`**:
  - Registered AI refinement commands
  - Added keyboard shortcuts for refinement
  - Integrated AI provider configuration commands
  - Added context menu items for text refinement
- **`src/environmentManager.ts`**:
  - Enhanced `createEnvironment()` to create HTTP folder and llms.txt
  - Enhanced `initializeDefaultEnvironments()` to ensure HTTP folder exists
  - Enhanced `createFileWatcher()` to create HTTP folder when needed
  - Automatic llms.txt creation for HTTP documentation
- **`src/utils.ts`**:
  - Added `createHttpLlmsFile()`: Creates comprehensive HTTP documentation
  - llms.txt includes all HTTP features: cURL, REST Client, variables, helpers
- **`package.json`**:
  - Version bumped from 1.6.0 to 1.7.0
  - Added AI refinement commands
  - Added AI configuration options
  - Added keyboard shortcuts for refinement
  - Added context menu items for selection refinement
  - Added dependency: `@google/genai` for Gemini integration

#### New Commands
- `cursor-toys.refineSelectionWithAI`: Refine selected text with AI
- `cursor-toys.refineClipboardWithAI`: Refine clipboard text with AI
- `cursor-toys.configureAIProvider`: Configure AI provider and API key
- `cursor-toys.removeAIProviderKey`: Remove stored AI provider key

#### Configuration Options Added
- `cursorToys.aiProvider`: AI provider to use (default: "gemini")
- `cursorToys.aiModel`: AI model to use (optional, provider default if empty)
- `cursorToys.aiRefinePrompt`: Prompt for text refinement
- `cursorToys.aiRequestTimeout`: Request timeout in seconds (default: 30)

#### Keyboard Shortcuts
- `Cmd+Shift+R` / `Ctrl+Shift+R`: Refine selected text
- `Cmd+Alt+Shift+R` / `Ctrl+Alt+Shift+R`: Refine clipboard text

#### Dependencies Added
- `@google/genai`: Google Gemini API client (version ^1.38.0)

### Use Cases

**Refining Text in Editor:**
1. Select text or code in editor
2. Press `Cmd+Shift+R` or use Command Palette: "CursorToys: Refine Selection with AI"
3. Text is refined and replaced in place
4. First-time use prompts for API key configuration

**Refining Clipboard Text:**
1. Copy text to clipboard
2. Press `Cmd+Alt+Shift+R` or use Command Palette: "CursorToys: Refine Clipboard Text with AI"
3. Clipboard is updated with refined text
4. Paste refined text anywhere

**Configuring AI Provider:**
1. Use Command Palette: "CursorToys: Configure AI Provider"
2. Enter your Google Gemini API key (get from https://aistudio.google.com/apikey)
3. Key is securely stored using VS Code Secrets API
4. Optional: Configure AI model in settings (e.g., "gemini-2.5-pro")

**Customizing Refinement Prompt:**
1. Open VS Code settings
2. Search for "CursorToys AI Refine Prompt"
3. Customize the prompt (e.g., "Make this more concise and professional")
4. Refinement uses your custom prompt

**Benefits:**
1. **Improve Code Quality**: Fix typos, improve clarity, enhance documentation
2. **Enhance Writing**: Refine commit messages, comments, and documentation
3. **Quick Cleanup**: Clean up messy text from external sources
4. **Context Preservation**: AI maintains original language and context
5. **Seamless Workflow**: Refine without leaving Cursor/VS Code

## [1.6.0] - 2026-01-XX

### Added

#### 🎯 **Skills Management**
- **Skills Support**: Complete support for Cursor Skills
  - New "Skills" view in Explorer sidebar to browse and manage skills
  - Support for both personal skills (`~/.cursor/skills/`, `~/.claude/skills/`) and project skills (`workspace/.cursor/skills/`, `workspace/.claude/skills/`)
  - Visual tree view with hierarchical folder structure (Category → Skill Folder → SKILL.md)
  - Automatic tree view refresh on file changes
  - Drag-and-drop support for organizing skills between folders
- **Skills Commands**:
  - `cursor-toys.openSkill`: Open SKILL.md file in editor
  - `cursor-toys.generateSkillDeeplink`: Generate deeplink for skill
  - `cursor-toys.shareAsCursorToysSkill`: Share skill as CursorToys format
  - `cursor-toys.shareAsCursorToysSkillFolder`: Share skills folder as bundle
  - `cursor-toys.deleteSkill`: Delete skill folder
  - `cursor-toys.renameSkill`: Rename skill folder
  - `cursor-toys.revealSkill`: Reveal skill in file system
  - `cursor-toys.refreshSkills`: Refresh skills tree view
- **Skills Sharing**: Complete sharing infrastructure for skills
  - Share individual skills via deeplink (`cursor://.../skill?name={skillName}&text={content}`)
  - Share individual skills via CursorToys compressed format
  - Share skills folders as bundles (`cursortoys://SKILL_BUNDLE:...`)
  - Import skills from deeplinks and shareables
  - Support for both personal and project skills import
- **Skills Tree View Features**:
  - Hierarchical display: Category (Personal/Workspace) → Skill Folders → SKILL.md
  - Visual distinction between personal and workspace skills
  - Context menu with all management options
  - File system watchers for real-time updates
  - Support for `.cursor/skills/` and `.claude/skills/` folders
- **Skills CodeLens**: CodeLens support for SKILL.md files
  - "Share as Deeplink" and "Share as CursorToys" actions in SKILL.md files
  - Automatic detection of SKILL.md files in skills folders

#### 🎨 **UI Improvements**
- **Personal Commands View**: Enhanced to match Hooks and Plans structure
  - Now displays categories at root level: "Personal (~/.cursor)" and "{workspaceName} (workspace)"
  - Better organization with clear separation between personal and project commands
  - Maintains backward compatibility with existing folder structure
- **Personal Prompts View**: Enhanced to match Hooks and Plans structure
  - Now displays categories at root level: "Personal (~/.cursor)" and "{workspaceName} (workspace)"
  - Better organization with clear separation between personal and project prompts
  - Maintains backward compatibility with existing folder structure

### Changed
- **UserCommandsTreeProvider**: Updated to show Personal/Workspace categories
  - Added `'category'` type to tree items
  - Root level now shows categories instead of direct files
  - Improved drag-and-drop handling for categories
- **UserPromptsTreeProvider**: Updated to show Personal/Workspace categories
  - Added `'category'` type to tree items
  - Root level now shows categories instead of direct files
  - Improved drag-and-drop handling for categories
- **Shareable Generator**: Extended to support skills type
  - Added `generateShareableForSkillFolder()`: Generate shareable for skills folder bundle
  - Added `collectSkillFoldersFromFolder()`: Helper to collect skill folders recursively
  - Added skill type to all shareable functions
  - Validation of SKILL.md file naming
- **Shareable Importer**: Enhanced to handle skills imports
  - Added `importSkillBundle()`: Import skills bundle from shareable
  - Support for `cursortoys://SKILL:` and `cursortoys://SKILL_BUNDLE:` protocols
  - Skills import flow with personal/project location choice
  - Creates skill folder structure (folder with SKILL.md inside)
- **Deeplink Generator/Importer**: Extended to support skills
  - Added skill type detection in `getFileTypeFromPath()`
  - Support for `cursor://.../skill?name={skillName}&text={content}` format
  - Skills deeplink generation uses skill folder name as skill name
  - Skills import creates folder structure automatically
- **CodeLens Provider**: Enhanced to detect SKILL.md files
  - Added skill type detection
  - CodeLens actions for SKILL.md files
- **Utils Enhanced**: Added skills path helpers
  - `getSkillsPath()`: Get path to skills folder (personal or project)
  - `getPersonalSkillsPaths()`: Get personal skills paths (includes both .cursor and .claude)
  - `isSkillFolder()`: Check if folder contains SKILL.md
  - `getFileTypeFromPath()`: Extended to detect skill files (SKILL.md)

### Technical Details

#### New Files
- **`src/userSkillsTreeProvider.ts`**: Complete skills management system
  - Tree provider for skills with drag-and-drop support
  - Hierarchical folder structure display (Category → Skill Folder → SKILL.md)
  - Support for both personal and project skills
  - Context menu integration
  - File system integration for opening and revealing files
  - Visual icons for skill folders and SKILL.md files

#### Enhanced Files
- **`src/utils.ts`**:
  - Added `getSkillsPath()`: Get skills folder path
  - Added `getPersonalSkillsPaths()`: Get personal skills paths array
  - Added `isSkillFolder()`: Check if folder is a skill folder
  - Extended `getFileTypeFromPath()` to detect `'skill'` type
- **`src/userCommandsTreeProvider.ts`**:
  - Added `'category'` type support
  - Modified `getChildren()` to return Personal/Workspace categories at root
  - Updated `getTreeItem()` to handle category items
  - Enhanced drag-and-drop to support categories
- **`src/userPromptsTreeProvider.ts`**:
  - Added `'category'` type support
  - Modified `getChildren()` to return Personal/Workspace categories at root
  - Updated `getTreeItem()` to handle category items
  - Enhanced drag-and-drop to support categories
- **`src/deeplinkGenerator.ts`**:
  - Added `'skill'` type support
  - Extended `generateDeeplink()` to accept skill type
  - Updated `buildDeeplink()` to handle skills (uses folder name as skill name)
- **`src/deeplinkImporter.ts`**:
  - Added `'skill'` type support
  - Extended `parseDeeplinkUrl()` to recognize skill type
  - Updated `getDestinationPath()` to create skill folder structure
  - Enhanced import flow to create folders for skills
- **`src/shareableGenerator.ts`**:
  - Added `generateShareableForSkillFolder()`: Generate skills bundle
  - Added `collectSkillFoldersFromFolder()`: Helper function
  - Extended all shareable functions to support skill type
- **`src/shareableImporter.ts`**:
  - Added `importSkillBundle()`: Import skills bundle
  - Extended `parseShareableUrl()` to recognize SKILL type
  - Updated `getDestinationPath()` to handle skills
- **`src/codelensProvider.ts`**:
  - Added skill type detection
  - CodeLens actions for SKILL.md files
- **`src/extension.ts`**:
  - Registered `UserSkillsTreeProvider` and tree view
  - Registered all skills-related commands
  - Added FileSystemWatcher for skills folders
  - Added helper functions for skills commands
- **`package.json`**:
  - Added `cursor-toys.userSkills` view
  - Added all skills-related commands
  - Added context menu items for skills
  - Added activation events for skills view
  - Updated version to 1.6.0

## [1.5.2] - 2026-01-05

### Added

#### 🔧 **Inline Variables and Helper Functions for HTTP Requests**
- **Inline Variable Support**: Define variables directly in HTTP request files using `# @var` decorator
  - Format: `# @var VAR_NAME=value` or `# @var VAR_NAME value`
  - Support for global variables (before first `##` section)
  - Support for section-specific variables (override global)
  - Cascading behavior: section variables override global variables
  - Case-insensitive variable matching in hover provider
  - Variables are excluded from environment variable substitution (variables with `@` prefix are processed separately)
- **Helper Functions**: Built-in helper functions for dynamic values
  - `{{@prompt("label")}}` - Prompt user for input value with custom label
  - `{{@randomIn(min, max)}}` - Generate random integer between min and max (inclusive)
  - `{{@datetime}}` or `{{@datetime("format")}}` - Current date/time (ISO, timestamp, date, time, or custom format)
  - `{{@uuid()}}` - Generate random UUID v4
  - `{{@randomString(length)}}` - Generate random alphanumeric string of specified length
- **Enhanced Hover Provider**: Improved variable hover information
  - Shows `# @var` variable definitions when hovering over variables
  - Displays variable source (file-level `# @var` vs environment file)
  - Provides helpful tips for defining variables
  - Shows when `# @var` values override environment variables
- **Syntax Highlighting**: Enhanced syntax highlighting for inline variables
  - `# @var` decorator highlighted as control directive
  - Variable name highlighted separately
  - Helper expressions (`{{@helper()}}`) highlighted as function calls
  - Visual distinction between file variables and environment variables
- **REST Client Format Enhancement**: Improved parsing to skip comments and empty lines
  - Better handling of `# @var` decorators in REST Client format
  - Preserves variable definitions during request parsing

#### 📋 **Cursor Plans Management**
- **Plans Management**: New system to manage Cursor plan files
  - New "Cursor Plans" view in Explorer sidebar to browse and manage plans
  - Support for both personal plans (`~/.cursor/plans/`) and project plans (`workspace/.cursor/plans/`)
  - Visual tree view with hierarchical folder structure
  - Automatic tree view refresh on file changes
  - Drag-and-drop support for organizing plans between folders
- **Plans Commands**:
  - `cursor-toys.openPlan`: Open plan file in editor
  - `cursor-toys.generatePlanShareable`: Generate shareable for plan
  - `cursor-toys.deletePlan`: Delete plan file
  - `cursor-toys.renamePlan`: Rename plan file
  - `cursor-toys.revealPlan`: Reveal plan in file system
  - `cursor-toys.refreshPlans`: Refresh plans tree view
  - `cursor-toys.shareAsCursorToysPlan`: Share plan as CursorToys format
  - `cursor-toys.shareAsCursorToysPlanFolder`: Share plan folder as bundle
- **Plans Sharing**: Complete sharing infrastructure for plans
  - Share individual plans via CursorToys compressed format
  - Share plan folders as bundles
  - Share plans via GitHub Gist with metadata
  - Import plans from shareables and bundles
  - Support for both personal and project plans import
- **Plans Tree View Features**:
  - Hierarchical display of plans organized in folders
  - Visual distinction between personal and workspace plans
  - Context menu with all management options
  - File system watchers for real-time updates
  - Support for `.plan.md` file extension

### Changed
- **Shareable Generator**: Extended to support plans type
  - Added `generateShareableForPlanFolder()`: Generate shareable for plan folder bundle
  - Added plan type to all shareable functions
  - Validation of `.plan.md` file extension
  - Support for plan bundles in project bundles
- **Shareable Importer**: Enhanced to handle plans imports
  - Added `importPlanBundle()`: Import plan bundle from shareable
  - Support for `cursortoys://PLAN:` and `cursortoys://PLAN_BUNDLE:` protocols
  - Plans import flow with personal/project location choice
  - Validation of `.plan.md` file extension on import
- **GistManager**: Updated to support plans type
  - Added `'plan'` to supported types in metadata
  - Support for plan type in Gist description building
  - Added `plan_bundle` to bundle types
- **Utils Enhanced**: Added plans path helpers
  - `getPlansPath()`: Get path to plans folder (personal or project)
  - `getPersonalPlansPaths()`: Get personal plans paths
  - `isPlanFile()`: Check if file has `.plan.md` extension
  - `getFileTypeFromPath()`: Extended to detect plan files

### Technical Details

#### New Files
- **`src/userPlansTreeProvider.ts`**: Complete plans management system
  - Tree provider for plans with drag-and-drop support
  - Hierarchical folder structure display
  - Support for both personal and project plans
  - Context menu integration
  - File system integration for opening and revealing files
  - Visual icons for plans files

#### Enhanced Files
- **`src/httpRequestExecutor.ts`**:
  - Added `extractFileVariables()`: Extract variables defined with `# @var` decorator
  - Added `replaceFileVariables()`: Replace `{{VAR_NAME}}` with file variable values
  - Added `replacePromptVariables()`: Replace `{{@prompt()}}` expressions with user input
  - Added helper functions system: `@prompt`, `@randomIn`, `@datetime`, `@uuid`, `@randomString`
  - Enhanced REST Client format parsing to preserve `# @var` decorators and comments
  - Improved variable substitution order: environment variables → file variables → prompt/helper expressions
  - Support for cascading variables (global → section-specific)
- **`src/httpEnvironmentProviders.ts`**:
  - Enhanced hover provider to detect and display `# @var` variable definitions
  - Added case-insensitive variable matching for file variables
  - Improved hover tooltips to show variable source (`# @var` vs environment file)
  - Added helpful tips for defining variables when not found
  - Shows when `# @var` values override environment variables
- **`syntaxes/http-request.tmLanguage.json`**:
  - Added syntax highlighting for `# @var` decorator pattern
  - Added highlighting for helper expressions (`{{@helper()}}`)
  - Proper scoping for variable decorators and helper functions
- **`src/extension.ts`**:
  - Registered UserPlansTreeProvider for plans view
  - Added 8 new plans-related commands
  - Integrated plans file watchers for real-time updates
  - Added helper functions for plans command arguments
  - Support for plans in context menus
- **`src/shareableGenerator.ts`**:
  - Added `generateShareableForPlanFolder()` function
  - Extended type definitions to include `'plan'`
  - Validation logic for `.plan.md` file extension
  - Support for plans in project bundles
  - Added `collectPlanFilesFromFolder()` helper function
- **`src/shareableImporter.ts`**:
  - Added `importPlanBundle()` function for plan bundle import
  - Extended type definitions to include `'plan'`
  - Support for `cursortoys://PLAN:` and `cursortoys://PLAN_BUNDLE:` protocol parsing
  - Plans destination path handling
  - Support for plans in Gist imports
- **`src/gistManager.ts`**:
  - Extended `CursorToysMetadata` type to include `'plan'`
  - Updated type definitions in helper functions
  - Added `plan_bundle` to bundle types
- **`src/utils.ts`**:
  - Added `getPlansPath()` function
  - Added `getPersonalPlansPaths()` function
  - Added `isPlanFile()` helper function
  - Extended `getFileTypeFromPath()` to detect plan files
- **`package.json`**:
  - Added `cursor-toys.userPlans` view contribution
  - Added 8 new plans commands
  - Added plans context menu items
  - Added view title actions for plans tree
  - Added activation events for plans view

#### New View
- `cursor-toys.userPlans`: Cursor Plans tree view in Explorer sidebar
  - Shows both personal and project plans files
  - Displays plans organized in folders
  - Context menu with all plans management actions

### Use Cases

**Using Inline Variables:**
```http
# @var API_BASE=https://api.example.com
# @var API_KEY=your-key-here
# @var USER_ID=12345

## Get User
GET {{API_BASE}}/users/{{USER_ID}}
Authorization: Bearer {{API_KEY}}
```

**Using Helper Functions:**
```http
## Create User with Random Data
POST {{BASE_URL}}/api/users
Content-Type: application/json

{
  "id": "{{@uuid()}}",
  "name": "User{{@randomString(8)}}",
  "age": {{@randomIn(18, 65)}},
  "createdAt": "{{@datetime}}",
  "email": "{{@prompt("Enter email")}}"
}
```

**Cascading Variables:**
```http
# @var TIMEOUT=5000

## Request 1
GET {{BASE_URL}}/api/users
# Uses TIMEOUT=5000 (global)

# @var TIMEOUT=10000
## Request 2
GET {{BASE_URL}}/api/posts
# Uses TIMEOUT=10000 (section-specific, overrides global)
```

**Managing Cursor Plans:**
1. View plans in "Cursor Plans" view in Explorer sidebar
2. Create plans with `.plan.md` extension in `.cursor/plans/` folder
3. Organize plans in subfolders with drag-and-drop
4. Share individual plans or entire folders with team

**Sharing Plans:**
1. Right-click on plan in tree view
2. Choose "Share Plan" (CursorToys format) or "Share via GitHub Gist"
3. Share link with team members
4. Recipients import with `Cmd+Shift+I`

**Importing Plans:**
1. Press `Cmd+Shift+I` in Cursor
2. Paste plan shareable link or Gist URL
3. Choose Personal or Project location
4. Plan is imported and ready to use

## [1.5.1] - 2026-01-05

### Added

#### 🌐 **REST Client Format Support for HTTP Requests**
- **REST Client Format**: Support for REST Client format (HTTP Request File format) in addition to curl commands
  - Format: `METHOD URL` with headers and body separated by empty line
  - Use `###` separator (three hashes) for multiple requests in same file
  - Parse requests with METHOD URL pattern (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
  - Support URLs with variables like `{{BASE_URL}}` in addition to `http://` and `https://`
  - Convert REST Client format to curl commands for execution
  - Automatic format detection (tries REST Client format before curl)
- **CodeLens Support**: Full CodeLens support for REST Client format requests
  - Show "Send Request" and "Copy as cURL" actions on request lines
  - Detect `###` separators to identify individual requests
  - Preserve request titles from `###` separator comments
  - Support environment variables in URLs and headers
- **Syntax Highlighting**: Enhanced syntax highlighting for REST Client format
  - Highlight HTTP methods as keywords
  - Highlight URLs and environment variables
  - Highlight headers with proper formatting
  - Highlight `###` separator as punctuation

#### 🔄 **Environment File Watchers**
- **File Watchers**: Automatic monitoring of environment file changes
  - Monitor `.env` file changes in environments folder
  - Automatically invalidate cache when environment files are modified
  - Support multiple workspace folders with individual watchers
  - Fire environment change events to notify listeners
  - Clean up watchers on workspace folder removal
  - Dispose watchers properly on extension deactivation
- **Cache Management**: Improved cache invalidation
  - Clear cache on file create, change, or delete events
  - Per-workspace cache management
  - Per-environment cache clearing support

### Changed
- **HTTP Request Parsing**: Enhanced to support multiple formats
  - Try REST Client format parsing before curl parsing
  - Support both curl commands and REST Client format in same file
  - Respect `###` separator to stop parsing at request boundaries
- **Request Extraction**: Refactored to handle both formats
  - `extractCurlFromSection()` renamed to `extractRequestFromSection()`
  - Support extraction of REST Client format requests
  - Preserve original formatting for body content

### Technical Details

#### Enhanced Files
- **`src/httpRequestExecutor.ts`**:
  - Added `parseRestClientFormat()`: Parse METHOD URL format requests
  - Added `isRestClientFormat()`: Detect REST Client format
  - Added `convertRestClientToCurl()`: Convert format for execution
  - Updated `parseHttpRequest()`: Try REST Client format before curl
  - Refactored `extractCurlFromSection()` to `extractRequestFromSection()`
  - Support for `###` separator detection
  - Preserve line breaks and empty lines for body separation
- **`src/httpCodeLensProvider.ts`**:
  - Added REST Client pattern matching for METHOD URL format
  - Detect `###` separators to identify individual requests
  - Support request titles from `###` separator comments
  - Show CodeLens on request lines with proper positioning
- **`src/environmentManager.ts`**:
  - Added `fileWatchers` Map and `workspacePaths` Set
  - Implemented `setupFileWatchers()`: Initialize watchers on activation
  - Added `updateFileWatchers()`: Handle workspace folder changes
  - Added `createFileWatcher()`: Create watcher per workspace
  - Added `clearEnvironmentCache()`: Clear cache for specific environment
  - Added `clearWorkspaceCache()`: Clear cache for workspace
  - Added `dispose()`: Clean up watchers on deactivation
- **`src/extension.ts`**:
  - Integrated file watcher setup in `activate()` function
  - Added watcher disposal in `deactivate()` function
- **`syntaxes/http-request.tmLanguage.json`**:
  - Added REST Client format pattern matching
  - Highlight HTTP methods, URLs, headers, and environment variables
  - Support `###` separator highlighting as punctuation
  - Proper scoping for REST Client format elements

### Use Cases

**REST Client Format Example:**
```http
### Get All Users
GET {{BASE_URL}}/api/users
Authorization: Bearer {{API_KEY}}

### Create User
POST {{BASE_URL}}/api/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Benefits:**
1. **Familiar Format**: Use the same format as VS Code REST Client extension
2. **Better Readability**: Cleaner syntax than curl commands for simple requests
3. **Multiple Requests**: Use `###` separator to organize multiple requests in one file
4. **Environment Variables**: Full support for `{{variable}}` syntax
5. **Automatic Updates**: Environment files are automatically reloaded when changed

## [1.5.0] - 2026-01-04

### Added

#### 🪝 **Cursor Hooks Management**
- **Hooks File Management**: New system to manage Cursor hooks.json files
  - New "Cursor Hooks" view in Explorer sidebar to browse and manage hooks
  - Support for both personal hooks (`~/.cursor/hooks.json`) and project hooks (`workspace/.cursor/hooks.json`)
  - Visual tree view with hooks file and associated scripts
  - Automatic tree view refresh on file changes
- **Hooks Commands**:
  - `cursor-toys.createHooksFile`: Create new hooks.json file (personal or project)
  - `cursor-toys.openHooks`: Open hooks.json file in editor
  - `cursor-toys.deleteHooks`: Delete hooks.json file
  - `cursor-toys.revealHooks`: Reveal hooks.json in file system
  - `cursor-toys.shareHooks`: Share hooks.json as CursorToys shareable
  - `cursor-toys.shareHooksViaGist`: Share hooks.json via GitHub Gist
  - `cursor-toys.refreshHooks`: Refresh hooks tree view
- **Hook Scripts Management**: Full support for managing hook scripts referenced in hooks.json
  - `cursor-toys.openHookScript`: Open hook script file in editor
  - `cursor-toys.shareHookScript`: Share hook script as shareable
  - `cursor-toys.shareHookScriptViaGist`: Share hook script via GitHub Gist
  - `cursor-toys.revealHookScript`: Reveal hook script in file system
  - `cursor-toys.deleteHookScript`: Delete hook script file
- **Hooks Sharing**: Complete sharing infrastructure for hooks
  - Share hooks.json via CursorToys compressed format
  - Share hooks.json via GitHub Gist with metadata
  - Import hooks from shareables with `Cmd+Shift+I`
  - Validation of hooks.json structure before sharing
  - Support for both personal and project hooks import
- **Hooks Tree View Features**:
  - Hierarchical display of hooks.json file and referenced scripts
  - Automatic detection of hook scripts from hooks.json content
  - Visual distinction between hooks file and scripts
  - Context menu with all management options
  - File system watchers for real-time updates

### Changed
- **Shareable Generator**: Extended to support hooks type
  - Added `generateShareableForHooks()`: Generate shareable for hooks.json
  - Added `generateGistShareableForHooks()`: Create Gist for hooks.json
  - Validation of hooks.json structure (version and hooks fields required)
  - Special handling for hooks.json file naming
- **Shareable Importer**: Enhanced to handle hooks imports
  - Added `importHooks()`: Import hooks.json from shareable
  - Support for `cursortoys://HOOKS:` protocol
  - Hooks import flow with personal/project location choice
  - Validation of hooks.json structure on import
- **GistManager**: Updated to support hooks type
  - Added `'hooks'` to supported types in metadata
  - Support for hooks type in Gist description building
- **Utils Enhanced**: Added hooks path helpers
  - `getHooksPath()`: Get path to hooks.json (personal or project)
  - `getPersonalHooksPath()`: Get personal hooks.json path (~/.cursor/hooks.json)
  - `getFileTypeFromPath()`: Extended to detect hooks.json files
- **File System Watchers**: Added watchers for hooks.json files
  - Personal hooks watcher (`~/.cursor/hooks.json`)
  - Project hooks watcher (`workspace/.cursor/hooks.json`)
  - Automatic tree view refresh on file changes

### Technical Details

#### New Files
- **`src/hooksManager.ts`**: Complete hooks management system
  - `createHooksFile()`: Create hooks.json with default structure
  - `hooksFileExists()`: Check if hooks.json exists
  - `validateHooksFile()`: Validate hooks.json structure
  - `getHookScripts()`: Extract script paths from hooks.json
  - Default hooks template with examples
- **`src/userHooksTreeProvider.ts`**: Tree provider for hooks
  - Hierarchical display of hooks and scripts
  - Support for both personal and project hooks
  - Context menu integration
  - File system integration for opening and revealing files
  - Visual icons for hooks file vs scripts

#### Enhanced Files
- **`src/extension.ts`**:
  - Registered UserHooksTreeProvider for hooks view
  - Added 12 new hooks-related commands
  - Integrated hooks file watchers for real-time updates
  - Added helper functions for hooks command arguments
  - Support for hooks in context menus
- **`src/shareableGenerator.ts`**:
  - Added `generateShareableForHooks()` function
  - Added `generateGistShareableForHooks()` function
  - Extended type definitions to include `'hooks'`
  - Validation logic for hooks.json structure
- **`src/shareableImporter.ts`**:
  - Added `importHooks()` function for hooks import
  - Extended type definitions to include `'hooks'`
  - Support for `cursortoys://HOOKS:` protocol parsing
  - Hooks destination path handling
- **`src/gistManager.ts`**:
  - Extended `CursorToysMetadata` type to include `'hooks'`
  - Updated type definitions in helper functions
- **`src/utils.ts`**:
  - Added `getHooksPath()` function
  - Added `getPersonalHooksPath()` function
  - Extended `getFileTypeFromPath()` to detect hooks.json
- **`package.json`**:
  - Version bumped from 1.4.2 to 1.5.0
  - Added `cursor-toys.userHooks` view contribution
  - Added 12 new hooks commands
  - Added hooks context menu items
  - Added view title actions for hooks tree
  - Added activation events for hooks view

#### New View
- `cursor-toys.userHooks`: Cursor Hooks tree view in Explorer sidebar
  - Shows both personal and project hooks.json files
  - Displays hook scripts referenced in hooks.json
  - Context menu with all hooks management actions

### Use Cases

**Managing Cursor Hooks:**
1. Click "Create Hooks File" button in Cursor Hooks view
2. Choose between Personal (all projects) or Project (workspace-specific)
3. Edit hooks.json to configure your hooks
4. Referenced scripts appear automatically in the tree view

**Sharing Hooks:**
1. Right-click on hooks.json in tree view
2. Choose "Share Hooks" (CursorToys format) or "Share via GitHub Gist"
3. Share link with team members
4. Recipients import with `Cmd+Shift+I`

**Importing Hooks:**
1. Press `Cmd+Shift+I` in Cursor
2. Paste hooks shareable link or Gist URL
3. Choose Personal or Project location
4. hooks.json is imported and ready to use

## [1.4.2] - 2026-01-04

### Added
- **Share via GitHub Gist in Personal Commands**: Added "Share via GitHub Gist" option to context menu of Personal Commands view
- **Share via GitHub Gist in Personal Prompts**: Added "Share via GitHub Gist" option to context menu of Personal Prompts view

### Changed
- **Simplified StatusBar Menu**: Streamlined quick access menu (CursorToys icon in status bar) to show only most relevant commands:
  - Added: New Notepad, Minify File, Trim Clipboard
  - Kept: Open Marketplace, Check Recommendations, Import from URL
  - Removed: Refresh Recommendations, Generate Deeplink, Import from Gist, Send to Chat, HTTP Request (still accessible via Command Palette and context menus)

## [1.4.1] - 2026-01-02

### Added

#### 🔄 **Cascading Environment Decorators for HTTP Requests**
- **3-Level Environment Cascading**: Environment decorators now cascade through three levels for better flexibility
  - **Section-specific**: `# @env dev` placed before a section (##) applies only to that section
  - **Previous section inheritance**: Sections without explicit decorator inherit from previous section
  - **Global environment**: `# @env prod` at the top of file applies to all sections without explicit decorator
- **Smart Environment Propagation**: Environment settings cascade down until explicitly changed
  - Reduces repetition - no need to add `# @env` before every section
  - More intuitive behavior - sections inherit parent environment by default
  - Explicit decorators always override inherited values
- **CodeLens Environment Display**: CodeLens now shows environment name only when variables are present
  - Format: `Send Request: Section Title [env]` when section has variables
  - Format: `Send Request: Section Title` when section has no variables
  - Cleaner UI - environment indicator only shown when relevant
- **Standalone cURL Support**: Standalone cURL commands (not in sections) also support cascading
  - Inherits from global environment decorator if present
  - Environment shown in CodeLens only if variables detected
- **Hover Provider Cascading**: Variable hover now uses same 3-level cascading logic
  - Shows correct environment for each variable based on cascade
  - Recursive environment detection for inheritance chain

### Enhanced

#### 🎨 **Syntax Highlighting for HTTP Request Files**
- **Environment Decorator Syntax**: New syntax highlighting for `# @env` decorators
  - `# @env` keyword highlighted as control directive (keyword.control.directive.env)
  - Environment name highlighted as type entity (entity.name.type.env-name)
  - Makes decorators visually distinct from regular comments
- **Variable Syntax Highlighting**: Enhanced highlighting for environment variables
  - `{{variableName}}` pattern now highlighted as environment variable
  - Variable name inside braces highlighted separately (variable.parameter.env-variable)
  - Improves visibility of variables in HTTP request files
- **Comment Support**: Added block comment support (`/* */`) for HTTP request files
  - Block comments properly highlighted as comment.block.http-request
  - Consistent with other language syntax highlighting

### Changed
- **Version**: Bumped from 1.4.0 to 1.4.1
- **Environment Detection Logic**: Refactored environment detection into modular functions
  - `findSectionEnvironment()`: Finds section-specific decorator
  - `findPreviousSectionEnvironment()`: Finds inherited environment from previous section
  - `findGlobalEnvironment()`: Finds global environment at file top
  - `getEnvironmentForSection()`: Orchestrates 3-level cascade
- **HTTP CodeLens Provider**: Updated to support cascading and conditional environment display
  - Detects global environment at file start
  - Initializes section environment with global value
  - Maintains environment state across sections (no reset)
  - Shows environment in title only when variables present
- **HTTP Request Executor**: Updated to use new cascading logic
  - Applies same 3-level environment detection
  - Properly resolves variables using cascaded environment
  - Validates variables against correct environment
- **HTTP Environment Providers**: Enhanced hover and completion providers
  - Hover provider uses recursive cascading logic
  - Shows correct environment name in hover tooltip
  - Suggests available environments in completion

### Technical Details

#### Enhanced Files
- **`src/httpCodeLensProvider.ts`**:
  - Added global environment detection at file start
  - Changed `currentEnv` initialization to use `globalEnv` instead of `null`
  - Removed environment reset when starting new sections (maintains cascade)
  - Added comment explaining inheritance behavior: "DO NOT reset currentEnv - maintain inheritance cascade"
  - Environment inheritance now explicit: `envName: currentEnv // Inherits from previous section or global`
- **`src/httpEnvironmentProviders.ts`**:
  - Refactored `getEnvironmentForLine()` to implement 3-level cascade
  - Added `findSectionEnvironment()`: Section-specific decorator detection
  - Added `findPreviousSectionEnvironment()`: Recursive inheritance from previous section
  - Added `findGlobalEnvironment()`: Global decorator detection at file top
  - Updated decorator search logic to stop at section boundaries or non-comment lines
  - Improved comment handling in environment detection
- **`src/httpRequestExecutor.ts`**:
  - Refactored `getEnvironmentForSection()` to use modular helper functions
  - Added `findSectionEnvironment()`: Section-specific decorator detection
  - Added `findPreviousSectionEnvironment()`: Recursive inheritance detection
  - Added `findGlobalEnvironment()`: Global decorator detection
  - Updated environment detection to support 3-level cascading
  - Consistent behavior with other HTTP environment providers
- **`syntaxes/http-request.tmLanguage.json`**:
  - Added block comment syntax pattern (`/* */`)
  - Added environment decorator pattern (`# @env name`)
  - Added variable pattern highlighting (`{{variableName}}`)
  - Captures for keyword and entity name in decorators
  - Captures for variable parameters

### Use Cases

**Cascading Environments Example:**

```http
# @env prod

## Get All Users
curl --request GET \
  --url {{base_url}}/api/users
  # Uses 'prod' environment (inherited from global)

# @env dev
## Create User
curl --request POST \
  --url {{base_url}}/api/users \
  --header 'Content-Type: application/json' \
  --data '{"name": "John"}'
  # Uses 'dev' environment (explicit decorator)

## Update User
curl --request PUT \
  --url {{base_url}}/api/users/1 \
  --header 'Content-Type: application/json' \
  --data '{"name": "Jane"}'
  # Uses 'dev' environment (inherited from previous section)

# @env staging
## Delete User
curl --request DELETE \
  --url {{base_url}}/api/users/1
  # Uses 'staging' environment (explicit decorator)
```

**Benefits:**
1. **Less Repetition**: Set global environment once at the top, override only when needed
2. **Better Organization**: Group related sections with same environment
3. **Clearer Intent**: Explicit decorators show when environment changes
4. **Flexible Workflow**: Mix environments in single file without repetition

## [1.4.0] - 2026-01-01

### Fixed
- Fixed GitHub token placeholder in README to avoid false positive in package security scan
  - Changed placeholder format to use clear text instead of x's pattern
  - Prevents vsce package from detecting placeholder as real token during packaging

### Added

#### 🎯 **Recommendations System**
- **Project Context Detection**: Automatically detects project languages, frameworks, and context
  - Detects languages: JavaScript, TypeScript, Python, Java, Go, Rust, Ruby, PHP, Elixir
  - Detects frameworks: React, Next.js, Vue, Angular, Svelte, Express, NestJS, Jest, Playwright
  - Detects special contexts: Git, GitHub workflows, Docker, Kubernetes, Terraform, monorepos
  - Analyzes package.json, requirements.txt, Cargo.toml, and other project files
- **Smart Recommendations**: Suggests relevant commands, prompts, and rules based on project context
  - Automatic popup when opening workspace (configurable interval)
  - Filters recommendations by detected languages and frameworks
  - Comes with official curated recommendations out of the box
  - Supports custom recommendations index (GitHub Gist or raw URL)
- **Recommendations Browser**: Marketplace-style interface for browsing and installing recommendations
  - Grid layout with cards showing name, description, type, and tags
  - Search by name, description, or tags
  - Filter by type (commands, prompts, rules)
  - Multi-select installation
  - Preview recommendations before installing
  - Dark mode support with VS Code theme integration
- **YAML Frontmatter Support**: Parse metadata from markdown files
  - Extract description, tags, category, author, version
  - Improves discoverability and organization
  - Compatible with existing files (optional metadata)
- **Recommendations Commands**:
  - `cursor-toys.checkRecommendations`: Check recommendations for current project
  - `cursor-toys.browseRecommendations`: Open recommendations marketplace browser
  - `cursor-toys.refreshRecommendations`: Clear recommendations cache and refresh
- **Recommendations Configuration**:
  - `cursorToys.recommendationsEnabled`: Enable/disable recommendations system (default: true)
  - `cursorToys.recommendationsCheckOnStartup`: Check on workspace open (default: true)
  - `cursorToys.recommendationsSuggestInterval`: Days between suggestions (default: 7)
  - `cursorToys.recommendationsIndexUrl`: URL to remote recommendations index
  - `cursorToys.recommendationsIndexGistId`: Alternative Gist ID for recommendations index (default: official CursorToys recommendations)
- **Caching System**: Performance-optimized with memory and disk caching
  - Memory cache: 1 hour TTL
  - Disk cache: 24 hours TTL
  - Automatic cache refresh when expired
  - Manual cache clear command

### Enhanced
- **YAML Parsing**: New utility functions in `utils.ts` for parsing YAML frontmatter
- **Context Detection**: Smart project analysis for better recommendations matching
- **Import System**: Recommendations use existing import infrastructure for seamless installation

## [1.3.0] - 2026-01-01

### Added

#### 📓 **Project Notepads**
- **Notepads Management**: New workspace-specific notepad system for project documentation
  - New "Project Notepads" view in Explorer sidebar to browse and manage notepads
  - Notepads stored in `.{baseFolder}/notepads/` folder (e.g., `.cursor/notepads/`)
  - Workspace-specific notepads (not personal - tied to current project)
  - Hierarchical folder structure with drag-and-drop support
  - Automatic tree view refresh on file changes
- **Notepad Commands**:
  - `cursor-toys.createNotepad`: Create new notepad in current workspace
  - `cursor-toys.openNotepad`: Open notepad file
  - `cursor-toys.generateNotepadShareable`: Generate shareable for notepad
  - `cursor-toys.deleteNotepad`: Delete notepad
  - `cursor-toys.renameNotepad`: Rename notepad
  - `cursor-toys.revealNotepad`: Reveal notepad in file system
  - `cursor-toys.refreshNotepads`: Refresh notepads tree view
- **Notepad Sharing**: Full sharing support for notepads
  - Share single notepads via CursorToys format
  - Share entire notepads folder as bundle
  - Import notepads from shareables and bundles
  - Context menu integration in `.{baseFolder}/notepads/` folder
- **Notepad Features**:
  - Create notepads with markdown format
  - Organize notepads in subfolders
  - Drag and drop files between folders
  - Filter by allowed extensions
  - Alphabetical sorting
  - File system watchers for real-time updates

#### 🌐 **GitHub Gist Integration**
- **Gist Sharing**: Share files and bundles via GitHub Gist
  - New command `cursor-toys.shareViaGist`: Share single file as GitHub Gist
  - New command `cursor-toys.shareFolderViaGist`: Share entire folder as Gist bundle
  - Support for all file types: commands, rules, prompts, notepads, HTTP, environments
  - Automatic metadata generation with CursorToys format
  - Gist description with file type and date
- **Gist Import**: Import files from GitHub Gist
  - Enhanced `cursor-toys.import` command to accept Gist URLs or IDs
  - Automatic format detection (Gist URL, ID, deeplink, or CursorToys)
  - Support for single file and bundle imports from Gist
  - Validates Gist format and extracts metadata
- **GitHub Token Management**:
  - `cursor-toys.configureGitHubToken`: Configure GitHub Personal Access Token
  - `cursor-toys.removeGitHubToken`: Remove stored GitHub token
  - Secure token storage using VS Code Secrets API
  - Token validation before Gist creation
- **Gist Features**:
  - Public or private Gist creation
  - Configurable default visibility via `cursorToys.gistDefaultVisibility` setting
  - URL copied to clipboard automatically
  - Support for Gist URLs, raw URLs, and Gist IDs
  - CursorToys metadata embedded in Gist for format validation
  - Size validation (100MB GitHub limit)
  - Bundle support with multiple files
- **Gist Manager**: Complete Gist management system
  - Singleton pattern for global access
  - Token management with validation
  - Gist creation and fetching
  - Metadata building and parsing
  - URL parsing and validation
  - HTTPS request handling with error management

### Changed
- **Import Command Enhanced**: Now supports GitHub Gist URLs and IDs
  - Accepts `gist.github.com` URLs, `gist.githubusercontent.com` raw URLs, and Gist IDs
  - Automatic format detection (Gist, deeplink, or CursorToys)
  - Updated prompt text: "supports: files, bundles, deeplinks, Gists"
  - Validation for all supported formats
- **Shareable Generator**: Extended to support notepads and Gist creation
  - Added `generateShareableForNotepadFolder()`: Bundle all notepad files
  - Added `generateGistShareable()`: Create single-file Gist
  - Added `generateGistShareableForBundle()`: Create multi-file Gist bundle
  - Support for notepad type in all shareable functions
- **Shareable Importer**: Enhanced to handle notepads and Gists
  - Added `importNotepadBundle()`: Import bundle of notepad files
  - Added `importFromGist()`: Import files from GitHub Gist
  - Support for notepad type in import flows
  - Gist format validation and metadata extraction
  - Bundle type detection for Gist imports
- **Utils Enhanced**: Added notepad path helpers
  - `getNotepadsPath()`: Get path to notepads folder (workspace-specific)
  - Updated `getFileTypeFromPath()` to detect notepad files
  - Support for `.{baseFolder}/notepads/` folder structure
- **Context Menu**: Extended to support notepads and Gist sharing
  - Added notepad-specific context menu items
  - Added Gist sharing options for all file types
  - Gist sharing available for files and folders
  - Automatic bundle type detection for folders
- **Tree Provider**: New UserNotepadsTreeProvider for project notepads
  - Hierarchical folder display
  - Drag-and-drop between folders
  - Recursive directory reading
  - File grouping by folder structure
  - Only shows notepads from current workspace

### Technical Details

#### New Files
- **`src/gistManager.ts`**: Complete GitHub Gist integration
  - GistManager class with singleton pattern
  - Token management with VS Code Secrets API
  - Gist creation with validation
  - Gist fetching and parsing
  - Metadata building and validation
  - URL parsing (supports multiple formats)
  - HTTPS request handling
  - Error management with user-friendly messages
- **`src/userNotepadsTreeProvider.ts`**: Tree provider for project notepads
  - Hierarchical folder structure support
  - Drag-and-drop functionality
  - Recursive directory reading
  - File grouping by folder
  - Only workspace notepads (not personal)
  - Context menu integration

#### Enhanced Files
- **`src/extension.ts`**:
  - Registered 13 new commands (notepads and Gist)
  - Added notepad-specific commands with URI/item helper functions
  - Enhanced import command to support Gist URLs and IDs
  - Integrated GistManager for Gist operations
  - Added UserNotepadsTreeProvider registration
  - Added file system watchers for notepads folder
  - Extended shareable commands to support notepads
- **`src/shareableGenerator.ts`**:
  - Added `generateShareableForNotepadFolder()`: Bundle notepad files
  - Added `generateGistShareable()`: Create GitHub Gist for single file
  - Added `generateGistShareableForBundle()`: Create Gist bundle
  - Extended all bundle functions to include notepads
  - Support for notepad type throughout
- **`src/shareableImporter.ts`**:
  - Added `importNotepadBundle()`: Import notepad bundles
  - Added `importFromGist()`: Import from GitHub Gist
  - Added Gist format validation and detection
  - Support for single file and bundle Gist imports
  - Extended project bundle to include notepads
- **`src/utils.ts`**:
  - Added `getNotepadsPath()`: Get notepads folder path
  - Extended `getFileTypeFromPath()` to detect notepads
  - Support for `.{baseFolder}/notepads/` in path detection
- **`package.json`**:
  - Version bumped from 1.2.0 to 1.3.0
  - Added 13 new commands (notepads and Gist)
  - Added `cursor-toys.userNotepads` view
  - Added `cursorToys.gistDefaultVisibility` configuration
  - Extended context menus for notepads and Gist
  - Updated activation events for new views and commands

#### New Commands
- `cursor-toys.createNotepad`: Create new notepad
- `cursor-toys.openNotepad`: Open notepad file
- `cursor-toys.generateNotepadShareable`: Share notepad
- `cursor-toys.deleteNotepad`: Delete notepad
- `cursor-toys.renameNotepad`: Rename notepad
- `cursor-toys.revealNotepad`: Reveal notepad in folder
- `cursor-toys.refreshNotepads`: Refresh notepads tree
- `cursor-toys.shareAsCursorToysNotepad`: Share as CursorToys (Notepad)
- `cursor-toys.shareAsCursorToysNotepadFolder`: Share folder as bundle
- `cursor-toys.shareViaGist`: Share file via GitHub Gist
- `cursor-toys.shareFolderViaGist`: Share folder via GitHub Gist
- `cursor-toys.importFromGist`: Import from GitHub Gist (integrated into import command)
- `cursor-toys.configureGitHubToken`: Configure GitHub token
- `cursor-toys.removeGitHubToken`: Remove GitHub token

#### Configuration Options Added
- `cursorToys.gistDefaultVisibility`: Default visibility when creating GitHub Gists
  - Options: `"public"`, `"private"`, `"ask"` (default: `"ask"`)
  - Allows presetting Gist visibility or prompting each time

#### New View
- `cursor-toys.userNotepads`: Project Notepads tree view in Explorer sidebar
  - Shows notepads from current workspace only
  - Hierarchical folder structure
  - Drag-and-drop support
  - Context menu with all notepad actions

### Use Cases

**Project Documentation with Notepads:**
1. Create notepads in `.cursor/notepads/` for project-specific documentation
2. Organize in subfolders (e.g., `architecture/`, `decisions/`, `guides/`)
3. Share individual notepads or entire folders with team
4. Keep documentation close to code, version-controlled

**Share via GitHub Gist:**
1. Right-click on any file → "CursorToys: Share via GitHub Gist"
2. Choose public or private visibility
3. Gist URL copied to clipboard
4. Share with anyone (even those without Cursor)
5. Recipients can import via `Cmd+Shift+I` or view in browser

**Import from Gist:**
1. Find a CursorToys Gist on GitHub
2. Press `Cmd+Shift+I` in Cursor
3. Paste Gist URL or ID
4. Files imported to appropriate folders automatically

## [1.2.0] - 2025-12-31

### Added

#### 🗂️ **HTTP and Environment File Sharing**
- **HTTP Request Sharing**: Share HTTP requests as CursorToys shareables
  - New command `cursor-toys.shareAsCursorToysHttp`: Share single HTTP request file
  - New command `cursor-toys.shareAsCursorToysHttpWithPath`: Share HTTP request with folder structure
  - New command `cursor-toys.shareAsCursorToysHttpFolder`: Share entire HTTP folder as bundle
  - Support for `.req` and `.request` file types
  - Automatic detection of HTTP files in `.cursor/http/` folder
- **Environment File Sharing**: Share environment variables as CursorToys shareables
  - New command `cursor-toys.shareAsCursorToysEnv`: Share single environment file
  - New command `cursor-toys.shareAsCursorToysEnvWithPath`: Share environment with folder structure
  - New command `cursor-toys.shareAsCursorToysEnvFolder`: Share entire environments folder as bundle
  - Support for `.env*` files in environments folder
  - Automatic detection of environment files
- **Combined HTTP + Environment Bundles**: Share HTTP requests with their environments
  - New command `cursor-toys.shareAsCursorToysHttpFolderWithEnv`: Bundle HTTP folder with environments
  - Complete API testing setup sharing in one shareable
- **Folder Bundles**: Share entire folders as single shareable
  - New command `cursor-toys.shareAsCursorToysCommandFolder`: Bundle all commands from folder
  - New command `cursor-toys.shareAsCursorToysRuleFolder`: Bundle all rules from folder
  - New command `cursor-toys.shareAsCursorToysPromptFolder`: Bundle all prompts from folder
  - New command `cursor-toys.shareAsCursorToysProject`: Bundle entire `.cursor` project folder
  - Multiple files bundled into single shareable for easy distribution
- **Environments Folder Configuration**: Customize environment folder name
  - New setting `cursorToys.environmentsFolder`: Choose between `.environments`, `environments`, `__environments__`, or `_env`
  - Default: `.environments` (hidden folder, recommended)
  - Allows organization flexibility for HTTP environments
- **ENV CodeLens Provider**: New CodeLens provider for environment files
  - Registered for `.env*` files in environments folder
  - Context-aware environment file detection

### Changed
- **CodeLens Filtering**: DeeplinkCodeLensProvider now only shows for command, rule, and prompt files
  - HTTP and ENV files excluded from deeplink CodeLens (have their own sharing methods)
  - Prevents CodeLens clutter on HTTP request files
- **Deeplink Generation**: Filter out HTTP and ENV types from deeplink generation
  - Only commands, rules, and prompts can be shared as traditional deeplinks
  - HTTP and ENV use shareable format exclusively
- **Import Command Enhanced**: Updated prompt text to reflect support for files, bundles, and deeplinks
  - Changed from "Paste the Cursor deeplink or CursorToys shareable" to "Paste your CursorToys link (supports: files, bundles, deeplinks)"
  - More descriptive placeholder text
- **Context Menu Organization**: Enhanced context menu with folder-level actions
  - Context menu now shows on both files and folders in `.cursor` structure
  - Folder-specific commands only appear when right-clicking folders
  - File-specific commands only appear when right-clicking files
  - Improved regex patterns for better folder detection
- **Shareable Generator**: Extended with multiple bundle generation functions
  - `generateShareableWithPath()`: Generate shareable preserving folder structure
  - `generateShareableForHttpFolder()`: Generate bundle for HTTP folder
  - `generateShareableForEnvFolder()`: Generate bundle for environments folder
  - `generateShareableForHttpFolderWithEnv()`: Generate combined HTTP + ENV bundle
  - `generateShareableForCommandFolder()`: Generate commands bundle
  - `generateShareableForRuleFolder()`: Generate rules bundle
  - `generateShareableForPromptFolder()`: Generate prompts bundle
  - `generateShareableForProject()`: Generate complete project bundle
- **Shareable Importer**: Enhanced to handle bundle imports with folder structure
  - Support for bundles with multiple files
  - Automatic folder structure recreation
  - File path preservation in bundles
- **HTTP CodeLens**: Removed share CodeLens from HTTP files (use context menu instead)
  - Comment added: "Note: Share CodeLens removed - use context menu instead"
  - Cleaner UI for HTTP request files
- **Utils Enhanced**: Extended file type detection
  - Added HTTP and ENV file type detection
  - `getFileTypeFromPath()` now returns `'http' | 'env'` in addition to existing types
  - `getEnvironmentsFolderName()`: Get configured environments folder name
  - `getEnvironmentsPath()`: Updated to use configurable folder name
  - `isHttpOrEnvFile()`: New helper to check if file is HTTP or ENV type
  - Improved environment file detection with multiple folder name support

### Technical Details

#### Enhanced Files
- **`src/extension.ts`**:
  - Added `generateShareableWithPathValidation()` helper function for HTTP/ENV with path
  - Registered 11 new shareable commands for HTTP, ENV, and folder bundles
  - Added ENV CodeLens provider registration
  - Extended `generateShareableWithValidation()` to accept `'http' | 'env'` types
  - Added conditional extension validation based on file type
  - Enhanced import command prompt text
- **`src/shareableGenerator.ts`**:
  - Added 8 new bundle generation functions
  - Support for folder structure preservation
  - Support for multiple file bundling
  - Added HTTP and ENV specific file filtering
  - Bundle compression and encoding for efficient sharing
- **`src/shareableImporter.ts`**:
  - Enhanced to handle bundle imports
  - Support for multiple files in single shareable
  - Automatic folder structure recreation
  - File path preservation and validation
- **`src/codelensProvider.ts`**:
  - Added filtering to exclude HTTP and ENV files
  - Only shows CodeLens for command, rule, and prompt files
  - Added default case to prevent errors
- **`src/httpCodeLensProvider.ts`**:
  - Removed share CodeLens from HTTP files
  - Added comment explaining removal
- **`src/deeplinkGenerator.ts`**:
  - Added filtering to exclude HTTP and ENV types
  - Only generates deeplinks for command, rule, and prompt files
  - Type validation before deeplink generation
- **`src/utils.ts`**:
  - Extended `getFileTypeFromPath()` return type to include `'http' | 'env'`
  - Added HTTP file detection with extension validation (`.req`, `.request`)
  - Added ENV file detection with folder name validation
  - Added `getEnvironmentsFolderName()` function
  - Updated `getEnvironmentsPath()` to use configurable folder name
  - Added `isHttpOrEnvFile()` helper function
- **`package.json`**:
  - Version bumped from 1.1.0 to 1.2.0
  - Added 11 new commands for HTTP, ENV, and folder bundles
  - Added `environmentsFolder` configuration option
  - Updated context menu conditions to support folder-level actions
  - Enhanced regex patterns for better file/folder detection
  - Organized commands by file type in context menu
  - Updated import command title for clarity

#### New Files
- **`src/envCodeLensProvider.ts`**: CodeLens provider for environment files
  - Validates environment file location
  - Checks for `.env*` file pattern
  - Currently returns empty array (share via context menu)

#### New Commands
- `cursor-toys.shareAsCursorToysHttp`: Share HTTP request file
- `cursor-toys.shareAsCursorToysEnv`: Share environment file
- `cursor-toys.shareAsCursorToysHttpWithPath`: Share HTTP with folder structure
- `cursor-toys.shareAsCursorToysEnvWithPath`: Share ENV with folder structure
- `cursor-toys.shareAsCursorToysHttpFolder`: Share HTTP folder as bundle
- `cursor-toys.shareAsCursorToysEnvFolder`: Share environments folder as bundle
- `cursor-toys.shareAsCursorToysHttpFolderWithEnv`: Share HTTP + ENV bundle
- `cursor-toys.shareAsCursorToysCommandFolder`: Share commands folder as bundle
- `cursor-toys.shareAsCursorToysRuleFolder`: Share rules folder as bundle
- `cursor-toys.shareAsCursorToysPromptFolder`: Share prompts folder as bundle
- `cursor-toys.shareAsCursorToysProject`: Share entire project as bundle

#### Configuration Options Added
- `cursorToys.environmentsFolder`: Name of folder to store HTTP environment files
  - Options: `.environments` (default), `environments`, `__environments__`, `_env`
  - Allows customization of environment folder organization

### Use Cases

**Share HTTP Requests:**
1. Right-click on `.req` or `.request` file in `.cursor/http/` folder
2. Select "CursorToys: Share as CursorToys (HTTP Request)"
3. Share the copied link with team members

**Share Complete API Setup:**
1. Right-click on `.cursor/http/` folder
2. Select "CursorToys: Share Folder as CursorToys (HTTP + Environments)"
3. Team receives both requests and environment configurations

**Share Project Configuration:**
1. Right-click on `.cursor` folder
2. Select "CursorToys: Share Project as CursorToys (Complete Bundle)"
3. Entire project setup (commands, rules, prompts, HTTP) shared in one link

## [1.1.0] - 2025-12-31

### Added

#### 🔗 **CursorToys Shareable Format**
- **New Compressed Sharing Format**: Alternative to traditional deeplinks with no URL length limits
  - `cursortoys://TYPE:filename:compressedData` format
  - Uses gzip compression + base64 encoding
  - 60-80% size reduction compared to URL-encoded deeplinks
  - Perfect for large commands, rules, and prompts
  - No 8,000 character URL limit
- **Dual CodeLens**: Files now show both sharing options
  - "Share as Deeplink" — Traditional cursor:// format
  - "Share as CursorToys" — New compressed format
- **New Commands**:
  - `cursor-toys.shareAsCursorToysCommand`: Generate CursorToys shareable for commands
  - `cursor-toys.shareAsCursorToysRule`: Generate CursorToys shareable for rules
  - `cursor-toys.shareAsCursorToysPrompt`: Generate CursorToys shareable for prompts
- **Automatic Format Detection**: Import command now automatically detects and handles both formats
  - Supports `cursor://` and `https://cursor.com/link/` deeplinks
  - Supports `cursortoys://` compressed shareables
  - Single import command works for all formats
- **New Shareable Generator**: `src/shareableGenerator.ts`
  - Compresses file content using gzip
  - Encodes to base64 for safe transmission
  - Validates file size (50MB limit for safety)
  - Builds shareable URL in CursorToys format
- **New Shareable Importer**: `src/shareableImporter.ts`
  - Parses CursorToys protocol URLs
  - Decompresses gzip content
  - Decodes base64 data
  - Creates files with proper naming and location
  - Supports personal and project locations

### Changed
- **Import Command Enhanced**: `cursor-toys.import` now accepts both deeplink and CursorToys formats
  - Updated prompt text to reflect dual format support
  - Updated validation to accept both URL schemes
  - Automatic routing to appropriate importer based on URL format
- **CodeLens Provider Updated**: Shows two action buttons instead of one
  - First button: "Share as Deeplink" (traditional format)
  - Second button: "Share as CursorToys" (compressed format)
  - Both buttons appear on line 0 of command/rule/prompt files
- **Command Titles Updated**: More descriptive command names
  - "Generate Command Share Link" → "Share as Deeplink (Command)"
  - "Generate Rule Share Link" → "Share as Deeplink (Rule)"
  - "Generate Prompt Share Link" → "Share as Deeplink (Prompt)"
  - Added new "Share as CursorToys" variants for each type
- **Context Menu Enhanced**: Added CursorToys sharing options
  - Right-click menu now includes both deeplink and CursorToys options
  - Organized by file type (command, rule, prompt)
- **Removed Generic Command**: Removed `cursor-toys.generate` command
  - Users now choose specific type directly from context menu or CodeLens
  - Cleaner UX with explicit action names

### Technical Details

#### New Files
- **`src/shareableGenerator.ts`**: Complete shareable generation system
  - `generateShareable()`: Main function to create CursorToys shareables
  - `compressAndEncode()`: Gzip compression + base64 encoding
  - `buildShareableUrl()`: URL construction for CursorToys protocol
  - File validation and size checks
  - Content compression with best compression level
- **`src/shareableImporter.ts`**: Complete shareable import system
  - `importShareable()`: Main function to import CursorToys shareables
  - `parseShareableUrl()`: URL parsing and validation
  - `decodeAndDecompress()`: Base64 decode + gzip decompression
  - `getDestinationPath()`: Determine file location (personal vs project)
  - Type detection (COMMAND, RULE, PROMPT)
  - File overwrite confirmation

#### Enhanced Files
- **`src/extension.ts`**:
  - Added `generateShareableWithValidation()` helper function
  - Registered three new shareable commands
  - Enhanced import command to handle both formats
  - Added shareable disposables to subscriptions
  - Removed generic generate command
- **`src/codelensProvider.ts`**:
  - Refactored to show two CodeLens actions per file
  - Added deeplink and shareable command pairs
  - Updated labels for clarity
  - Both CodeLens appear on line 0
- **`package.json`**:
  - Added three new shareable commands to contributions
  - Added activation events for shareable commands
  - Added shareable commands to context menus
  - Removed generic generate command
  - Updated command titles for consistency

#### Dependencies
- Uses Node.js built-in `zlib` module for compression/decompression
- No new external dependencies required

### Format Comparison

| Aspect | Deeplink | CursorToys Shareable |
|:-------|:---------|:--------------------|
| **Protocol** | `cursor://` or `https://cursor.com/link/` | `cursortoys://` |
| **Encoding** | URL encoding | Gzip + Base64 |
| **Size Limit** | 8,000 characters | No limit (practical limit: 50MB) |
| **Compression** | None | 60-80% reduction |
| **Best For** | Small files, quick sharing | Large files, team distribution |

### Use Cases

**Use Deeplinks when:**
- File is small (< 2KB)
- Sharing in platforms with URL support
- Need clickable links in documentation

**Use CursorToys when:**
- File is large (> 5KB)
- Deeplink exceeds URL length limit
- Team sharing via private channels
- Need maximum compression

## [Unreleased]

### Added
- New configuration `cursorToys.baseFolder` to customize base folder name for all resources
  - Applies to commands, rules, prompts, and HTTP files
  - Allows using `.vscode`, `.ai`, or any custom folder name instead of `.cursor`
  - Default remains `cursor` for backward compatibility
  - Enables better VS Code integration and organizational flexibility
- VS Code compatibility documentation in README
  - Detailed feature compatibility matrix
  - Workarounds for Cursor-specific features
  - Setup guide for VS Code users
  - Clarification about rules and prompts being Cursor-specific
- Support for custom folder names in menu contexts and CodeLens
  - Updated regex patterns to accept multiple folder names
  - Supports `.cursor`, `.claude`, `.vscode`, `.ai` and other custom names
- Backward compatibility for prompts folder
  - Shows both configured folder and `.cursor` folder if different
  - Ensures users can access legacy prompts after changing base folder

### Changed
- `baseFolder` configuration now affects ALL resources consistently
  - Commands, rules, prompts, and HTTP all respect the same base folder
  - More intuitive and predictable behavior
  - Rules and prompts remain Cursor-specific features (may not work in VS Code)
- Menu contexts now support multiple folder names dynamically
- All path handling updated to use helper functions from `utils.ts`
  - `getBaseFolderName()`: Get configured base folder
  - `getRulesPath()`: Get rules folder path (uses base folder)
  - `getPromptsPath()`: Get prompts folder path (uses base folder)
  - `getHttpPath()`: Get HTTP folder path
  - `getEnvironmentsPath()`: Get environments folder path
- Updated development guidelines in AGENTS.md
  - Added documentation about folder customization
  - Emphasized using helper functions instead of hardcoded paths
  - Clarified that rules/prompts are Cursor-specific but use base folder

### Documentation
- Added comprehensive VS Code compatibility section to README
- Updated AGENTS.md with base folder configuration guidelines
- Clarified which features work in VS Code vs Cursor
- Added note that rules and prompts use base folder but are Cursor-specific features

## [1.0.0] - 2025-12-31

### 🎉 Major Release: Complete Productivity Toolkit

**⚠️ BREAKING CHANGES**: This is a major version update with breaking changes. Users will need to:
- Uninstall `cursor-deeplink` and install `cursor-toys`
- Update configuration keys from `cursorDeeplink.*` to `cursorToys.*`
- Update any custom keybindings from `cursor-deeplink.*` to `cursor-toys.*`

### Added

#### 🗜️ **File Minification System**
- **Minify Files**: New command to minify files directly in the editor
  - Support for multiple file types: JSON, HTML, XML, CSS, SVG, JavaScript, TypeScript
  - One-click minification via context menu or editor title
  - Automatic detection of file type by extension
  - Creates minified versions with configurable suffix (default: `.min`)
  - Shows detailed statistics: original size, minified size, and savings percentage
- **Clipboard Minification**: New commands to minify clipboard content
  - `cursor-toys.trimClipboard`: Auto-detect and minify clipboard content
  - `cursor-toys.trimClipboardWithPrompt`: Select content type manually before minifying
  - Smart content type detection (JSON, HTML, XML, CSS, SVG, JavaScript, TypeScript, Text)
  - Shows savings statistics after minification
  - Preserves clipboard history
- **Minification Features**:
  - JSON: Remove whitespace, compact structure
  - HTML/XML: Remove comments, excess whitespace, and line breaks
  - CSS: Remove comments, whitespace, and unnecessary semicolons
  - SVG: Remove metadata, comments, and optimize structure
  - JavaScript/TypeScript: Remove comments and excess whitespace (basic minification)
  - Text: Normalize whitespace and remove excessive line breaks
- **Configuration Options**:
  - `cursorToys.minify.preserveComments`: Preserve comments when minifying (future feature)
  - `cursorToys.minify.outputSuffix`: Customize minified file suffix (default: `.min`)

#### 🌍 **HTTP Environment Variables**
- **Environment Management**: Complete system for managing HTTP request environments
  - Store environment variables in `.cursor/http/environments/` folder
  - Support for multiple environments: `.env`, `.env.dev`, `.env.staging`, `.env.prod`, etc.
  - Variable substitution using `{{variableName}}` syntax in request files
  - Case-insensitive variable matching
- **Environment Commands**:
  - `cursor-toys.selectEnvironment`: Switch between available environments
  - `cursor-toys.openEnvironments`: Open environments folder in file explorer
  - `cursor-toys.createEnvironment`: Create new environment with template
  - `cursor-toys.initializeEnvironments`: Create default environment structure
- **Environment Features**:
  - Automatic environment detection from file structure
  - Real-time variable substitution in HTTP requests
  - Validation of unresolved variables before request execution
  - Environment caching for better performance
  - Support for default environment (`.env` file)
- **Environment File Format**:
  ```env
  # Comment
  BASE_URL=http://localhost:3000
  API_KEY=your-api-key-here
  TIMEOUT=10000
  ```
- **Usage in Requests**:
  ```http
  ## Get Users
  GET {{BASE_URL}}/api/users
  Authorization: Bearer {{API_KEY}}
  ```
- **Automatic Initialization**:
  - Creates `.cursor/http/environments/` folder on first use
  - Generates `.env` (default environment)
  - Creates `.env.example` with documentation and examples
  - Adds `.gitignore` to protect sensitive data
- **Environment Status Bar**: Shows current active environment in status bar
- **Configuration**:
  - `cursorToys.httpDefaultEnvironment`: Set default environment name (default: `dev`)

#### 📝 **Clipboard Processing System**
- **Smart Content Detection**: Automatically detects content type from clipboard
  - Recognizes JSON, HTML, XML, CSS, SVG, and other formats
  - Suggests detected type with option to override
- **Content Normalization**: Intelligent whitespace and formatting cleanup
  - Preserves code structure while removing excess whitespace
  - Removes duplicate line breaks (maintains maximum of one blank line)
  - Trims leading/trailing whitespace from lines
- **Minification Statistics**: Detailed feedback on processing results
  - Shows original and final sizes in KB
  - Displays savings in bytes and percentage
  - Warns if no savings detected with option to continue
- **Clipboard Utilities**:
  - `readClipboard()`: Read clipboard content safely
  - `writeClipboard()`: Write to clipboard with error handling
  - `getClipboardStats()`: Get clipboard statistics without modifying
  - `copyToClipboard()`: Copy with confirmation message

### Changed
- **Package Name**: `cursor-deeplink` → `cursor-toys`
- **Display Name**: "Cursor Commands Toys" → "CursorToys"
- **Command Namespace**: `cursor-deeplink.*` → `cursor-toys.*`
- **Configuration Namespace**: `cursorDeeplink.*` → `cursorToys.*`
- **View IDs**: `cursor-deeplink.*` → `cursor-toys.*`
- **URI Handlers**: `godrix.cursor-deeplink` → `godrix.cursor-toys`
- **Repository**: GitHub repository updated to `cursor-toys`
- **HTTP Request Execution**: Enhanced with environment variable support
  - Requests now support `{{variableName}}` variable substitution
  - Environment variables loaded from `.cursor/http/environments/` folder
  - Active environment can be switched via command palette
  - Unresolved variables are validated before execution
- **Editor Context Menu**: Added minify command for supported file types
- **Editor Title Menu**: Added minify icon for quick access

### Migration Guide

If you're upgrading from `cursor-deeplink`:

1. **Uninstall old extension**: Remove `cursor-deeplink` from VS Code
2. **Install new extension**: Install `cursor-toys`
3. **Update settings** (in `.vscode/settings.json` or user settings):
   ```json
   // Old
   "cursorDeeplink.linkType": "web"
   
   // New
   "cursorToys.linkType": "web"
   ```
4. **Update keybindings** (if customized):
   ```json
   // Old
   "cursor-deeplink.import"
   
   // New
   "cursor-toys.import"
   ```

### Technical Details

#### New Files
- **`src/minifier.ts`**: Complete minification system
  - File type detection by extension and content
  - Specialized minification functions for each supported type
  - Size calculation and statistics generation
  - Result formatting utilities
- **`src/clipboardProcessor.ts`**: Clipboard processing utilities
  - Read/write clipboard with error handling
  - Content type detection from clipboard
  - Whitespace normalization
  - Minification with user prompts
  - Statistics generation
- **`src/environmentManager.ts`**: Environment variable management
  - Singleton pattern for global access
  - Environment file parsing (.env format)
  - Variable substitution with `{{variable}}` syntax
  - Cache management for performance
  - Validation of unresolved variables
  - Environment creation and initialization
- **`src/httpEnvironmentProviders.ts`**: Environment UI providers
  - Status bar item showing active environment
  - Quick pick menu for environment selection
  - Environment folder management

#### Enhanced Files
- **`src/extension.ts`**: 
  - Registered minification commands
  - Registered clipboard processing commands
  - Registered environment management commands
  - Added minify context menu items
  - Integrated environment manager with HTTP requests
  - Added status bar integration for environment display
- **`src/httpRequestExecutor.ts`**:
  - Enhanced with environment variable substitution
  - Added validation for unresolved variables
  - Improved error messages for missing variables
- **`src/utils.ts`**:
  - Added file type detection utilities
  - Added minification helper functions
- **`package.json`**:
  - Added minification commands
  - Added clipboard processing commands
  - Added environment management commands
  - Added minify configuration options
  - Added context menu contributions
  - Added activation events for new commands

#### New Commands
- `cursor-toys.minifyFile`: Minify current file and save with suffix
- `cursor-toys.trimClipboard`: Auto-detect and minify clipboard
- `cursor-toys.trimClipboardWithPrompt`: Select type and minify clipboard
- `cursor-toys.selectEnvironment`: Switch HTTP environment
- `cursor-toys.openEnvironments`: Open environments folder
- `cursor-toys.createEnvironment`: Create new environment file
- `cursor-toys.initializeEnvironments`: Initialize environment structure

#### Configuration Options Added
- `cursorToys.minify.preserveComments`: Preserve comments (default: `false`)
- `cursorToys.minify.outputSuffix`: Minified file suffix (default: `.min`)
- `cursorToys.httpDefaultEnvironment`: Default environment name (default: `dev`)

### Keywords Added
- `cursor-toys`, `rest`, `minify`, `clipboard`, `environment`, `variables` for better discoverability
- Enhanced description highlighting productivity features

---

## [0.9.0] - 2025-12-27

### Added
- **Personal Prompts Support**: Complete functionality to manage personal prompts in `~/.cursor/prompts/`, mirroring the Personal Commands system
  - New "Personal Prompts" view in Explorer sidebar to browse and manage prompts from `~/.cursor/prompts/`
  - Import prompts via deeplink with option to save as Personal (default) or Project prompt
  - Personal prompts are available across all projects
  - Project prompts remain workspace-specific in `workspace/.cursor/prompts/`
- **Save as User Prompt**: New command to copy prompts from workspace to personal prompts folder
  - Available via context menu for files in `.cursor/prompts/`
  - Asks for confirmation before overwriting existing files
  - Option to remove original file after copying
  - Automatically opens the saved file
- **Personal Prompts Management Commands**: Full set of management commands for personal prompts
  - Open prompt file
  - Generate deeplink for prompt
  - Rename prompt
  - Delete prompt
  - Reveal prompt in file system
  - Refresh tree view
- **Personal Prompts Tree View Features**:
  - Hierarchical folder structure support
  - Drag and drop functionality between folders
  - Alphabetical sorting of folders and files
  - Automatic tree refresh on file changes
  - Context menu with all management options

### Changed
- **Deeplink Import Flow for Prompts**: When importing a prompt deeplink, user is now asked if they want to save as Personal (default) or Project prompt
  - Personal prompts saved to `~/.cursor/prompts/`
  - Project prompts saved to `workspace/.cursor/prompts/`
  - Maintains consistency with command import behavior
- **File Type Detection**: Updated `getFileTypeFromPath()` to properly detect prompts in both workspace and user home directory

### Technical Details
- **New Files**:
  - `src/userPromptsTreeProvider.ts`: Complete tree provider for personal prompts with drag-and-drop support
- **Enhanced Files**:
  - `src/utils.ts`: Added `getPromptsPath()` and `getPersonalPromptsPaths()` utility functions
  - `src/deeplinkImporter.ts`: Updated import logic to support personal prompts with user choice
  - `src/extension.ts`: Added all prompt management commands, tree view, and file watchers
  - `package.json`: Added personal prompts view, commands, menus, and activation events
- **New Commands**:
  - `cursor-toys.save-as-user-prompt`: Save workspace prompt as personal prompt
  - `cursor-toys.openUserPrompt`: Open personal prompt file
  - `cursor-toys.generateUserPromptDeeplink`: Generate deeplink for personal prompt
  - `cursor-toys.deleteUserPrompt`: Delete personal prompt
  - `cursor-toys.revealUserPrompt`: Reveal personal prompt in file system
  - `cursor-toys.renameUserPrompt`: Rename personal prompt
  - `cursor-toys.refreshUserPrompts`: Refresh personal prompts tree view
- **New View**:
  - `cursor-toys.userPrompts`: Personal Prompts tree view in Explorer sidebar
- **File System Watchers**: Added automatic monitoring of `~/.cursor/prompts/` for real-time updates

### Architecture
- Personal prompts follow the same architecture as Personal Commands
- Prompts always use `.cursor` folder (not `.claude`)
- Respects `allowedExtensions` configuration
- Automatic directory creation when needed
- Cross-platform compatibility (Windows, Mac, Linux)

## [0.8.4] - 2025-12-25

### Added
- **Drag and Drop Support**: Personal Commands tree view now supports drag and drop functionality
  - Drag files between folders within the same source (.cursor or .claude)
  - Drag files between different sources (.cursor and .claude)
  - Confirmation prompt before overwriting existing files
  - Automatic tree view refresh after moving files
- **Hierarchical Folder Structure**: Tree view now displays folders and subfolders in a hierarchical structure
  - Collapsible folders with proper folder icons
  - Files grouped by their parent folders
  - Source categories (.cursor and .claude) when viewing both
  - Alphabetical sorting of folders and files
- **Improved Tree View Organization**: Better visual organization of personal commands
  - Root files displayed directly under source category
  - Subfolder files grouped under their respective folders
  - Clear separation between .cursor and .claude commands when viewing both

### Changed
- **Tree View Structure**: Refactored tree view to support hierarchical folder display instead of flat list
- **Drag and Drop Controller**: Implemented `TreeDragAndDropController` interface for file management
- **Item Types**: Added folder and file type distinction in tree view items

### Technical Details
- **Enhanced Files**:
  - `src/userCommandsTreeProvider.ts`: Complete refactor to support hierarchical structure and drag-and-drop
  - `src/extension.ts`: Added `dragAndDropController` to tree view registration
- **New Features**:
  - `handleDrag()`: Manages drag operation initialization
  - `handleDrop()`: Handles file moving and folder operations
  - `groupFilesByFolder()`: Creates hierarchical folder structure
  - `createSourceCategory()`: Creates top-level source categories (.cursor/.claude)
  - `getBasePath()`: Helper to determine source folder from file path

## [0.8.3] - 2025-12-25

### Changed
- **Build Configuration**: Updated `.gitignore` and `.vscodeignore` for better package management
  - Exclude internal documentation files from extension package
  - Add analytics local files to .gitignore
  - Reorganize .vscodeignore entries for clarity

### Documentation
- **AGENTS.md**: Added comprehensive telemetry documentation
  - Document telemetry system architecture
  - Add activation event clarification (onStartupFinished)
  - Add code examples for TelemetryManager usage
  - Add reference to ANALYTICS.md

## [0.8.2] - 2025-12-25

### Changed
- **Version Bump**: Updated extension version to 0.8.2 for maintenance release

## [0.8.1] - 2025-12-25

### Fixed
- **Extension Activation**: Fixed issue where commands were not being found after installing the VSIX
  - Changed activation event from individual `onCommand` to `onStartupFinished` 
  - Ensures extension is fully loaded before commands are executed
  - Resolves "command not found" errors for all commands

## [0.7.0] - 2025-12-25

### Added
- **HTTP Request Execution**: New feature to execute HTTP requests directly from your editor
  - Create `.req` or `.request` files in `.cursor/http/` folder with curl commands or JSON format
  - Execute requests with a single click via CodeLens "Send Request" links
  - Support for multiple requests in a single file using markdown sections (## Section Title)
  - Each section gets its own "Send Request" CodeLens for individual execution
  - Automatic response handling with formatted output
  - Responses saved to `.res` or `.response` files (or shown in preview mode)
  - Full syntax highlighting for both HTTP request and response files
  - Execution time tracking displayed in response tabs
  - Flexible request formats: curl commands and structured JSON
  - Smart response formatting: automatically formats JSON and XML responses
- **HTTP Request Configuration**: New settings for HTTP request behavior
  - `cursorToys.httpRequestTimeout`: Timeout in seconds for HTTP requests (default: 10)
  - `cursorToys.httpRequestSaveFile`: Save HTTP response to file or show preview only (default: false)
- **Language Support**: New language definitions and syntax highlighting
  - `http-request` language for `.req` and `.request` files
  - `http-response` language for `.res` and `.response` files
  - TextMate grammar files for proper syntax highlighting
- **New Command**: `cursor-toys.sendHttpRequest` to execute HTTP requests from files
- **HTTP CodeLens Provider**: Dedicated CodeLens provider for HTTP request files
  - Shows "Send Request" links at the top of request files
  - Shows "Send Request: [Section Title]" links for each markdown section in multi-request files
  - Only active for files in `.cursor/http/` folder
- **Custom Response Tab Titles**: Response tabs display execution time in the title (e.g., "response (1.23s).res")

### Changed
- **Version**: Bumped to 0.7.0 to reflect major new feature addition
- **Activation Events**: Added `onCommand:cursor-toys.sendHttpRequest` activation event
- **README**: Extensive documentation updates
  - Added "What's New" section highlighting HTTP Request Execution feature
  - Added comprehensive HTTP Request Execution section with examples and usage instructions
  - Added file location requirements for `.cursor/http/` folder
  - Added configuration documentation for HTTP request settings
  - Updated feature list to include HTTP request testing capabilities
  - Added real-world use case: "API Development Workflow"
  - Updated available commands table with HTTP request command
  - Added curl requirement note
  - Updated configuration options table

### Technical Details
- **New Files**:
  - `src/httpCodeLensProvider.ts`: CodeLens provider for HTTP request files
  - `src/httpRequestExecutor.ts`: Core HTTP request execution logic with curl integration
  - `syntaxes/http-request.tmLanguage.json`: Syntax highlighting for request files
  - `syntaxes/http-response.tmLanguage.json`: Syntax highlighting for response files
- **Enhanced Files**:
  - `src/extension.ts`: Added HTTP request command registration and providers
  - `src/utils.ts`: Added utility functions for HTTP request file detection
  - `package.json`: Added language definitions, grammars, and new configuration options

### Requirements
- `curl` command-line tool must be installed and available in system PATH

## [0.6.0] - 2025-12-06

### Added
- **Chat Integration**: New commands to send code and text directly to Cursor chat
  - `cursor-toys.sendToChat`: Send custom text to Cursor chat
  - `cursor-toys.sendSelectionToChat`: Send selected code to Cursor chat with context
  - `cursor-toys.copySelectionAsPrompt`: Copy selected code as prompt deeplink with file context
- **Annotation Panel**: New Webview Panel that opens via deeplinks (similar to Datadog extension)
  - Opens via `cursor://godrix.cursor-toys/annotation?...` or `vscode://godrix.cursor-toys/annotation?...` deeplinks
  - Displays code, errors, and context in a formatted view
  - "Fix in Chat" button to send content directly to Cursor chat
- **URI Handler**: Registered custom protocol handler for `cursor://godrix.cursor-toys/*` and `vscode://godrix.cursor-toys/*`
- **Editor Context Menu**: New submenu "Cursor Toys" when text is selected with options:
  - Send Selection to Chat
  - Copy as Prompt Deeplink (includes file path, language, and line numbers in context)
- **Context Information**: Copy command now includes file context (relative path, language, line numbers) when copying code as prompt deeplink

### Changed
- **Extension Rebranding**: Renamed extension from "Cursor Commands Share" to "Cursor Sidekick", and later to "Cursor Toys"
- **Command IDs**: All command IDs updated from `cursor-sidekick.*` to `cursor-toys.*` for consistency
- Updated all user-facing text, command titles, and documentation to reflect the new name "Cursor Toys"
- Removed "Send to Chat" command from Command Palette (now only available via context menu)
- CodeLens labels updated to show "Generate Cursor Toys" instead of "Generate Cursor Sidekick"
- Annotation Panel titles updated to "Cursor Toys - Annotation"

## [0.5.1] - 2025-12-02

### Added
- **Configurable Personal Commands View**: New `cursorToys.personalCommandsView` setting to choose which command folders to display in the Personal Commands tree view
  - `both`: Show commands from both `.cursor/commands/` and `.claude/commands/` folders (default)
  - `cursor`: Show commands from `.cursor/commands/` folder only
  - `claude`: Show commands from `.claude/commands/` folder only

### Changed
- **Enhanced Tree View**: Personal Commands tree view now supports displaying commands from multiple folders simultaneously
- **Improved File Watchers**: File system watchers now monitor all configured command folders for real-time updates
- **Fixed Reveal Command**: Changed `revealInExplorer` to `revealFileInOS` for better cross-platform compatibility
- Tree view no longer auto-creates folders that aren't configured to be shown

## [0.5.0] - 2025-12-02

### Changed
- **Extension Rebranding**: Renamed extension from "Cursor Deeplink" to "Cursor Commands Share" to better reflect its purpose of sharing and managing Cursor configurations
- Updated all user-facing text, command titles, and documentation to reflect the new name
- Maintained backward compatibility with existing command IDs and configuration keys

## [0.4.0] - 2025-12-02

### Added
- **Personal Commands Tree View**: New "Personal Commands" view in the Explorer sidebar to browse and manage user commands from `~/.cursor/commands/` or `~/.claude/commands/`
- **User Commands Management**: New commands to manage personal commands directly from the tree view:
  - Open command file
  - Generate deeplink for command
  - Rename command
  - Delete command
  - Reveal command in Explorer
  - Refresh tree view
- **AGENTS.md Documentation**: Added comprehensive development guide with coding conventions, architecture patterns, and best practices
- Tree view automatically creates user commands folder if it doesn't exist
- Tree view filters files by allowed extensions from configuration
- Commands sorted alphabetically in tree view

### Changed
- Enhanced user commands management with visual tree view interface
- Improved organization of personal commands with dedicated sidebar view

## [0.3.0] - 2025-11-27

### Added
- **User Commands Support**: When importing commands, choose between saving as "Project commands" (workspace-specific) or "Personal commands" (saved to `~/.cursor/commands/` or `~/.claude/commands/` and available across all projects)
- **Save as User Command**: New command to move existing project commands to personal commands folder via context menu
- **Organized Context Menu**: All Cursor Commands Share commands are now organized in a submenu for better user experience
- **Claude Commands Compatibility**: Support for `.claude/commands/` folder in addition to `.cursor/commands/`
- **Configurable Commands Folder**: New `cursorToys.commandsFolder` setting to choose between `cursor` (default) or `claude` for where to save imported commands
- Context menu and CodeLens now work for both `.cursor/commands/` and `.claude/commands/` folders
- Generate deeplinks from files in either `.cursor/commands/` or `.claude/commands/` folders

### Changed
- Import flow now prompts for command location (project vs personal) when importing command deeplinks
- Context menu structure improved with submenu organization
- Import flow now respects the `commandsFolder` configuration when saving imported commands
- `save-as-user-command` command now uses the configured commands folder (workspace or user level)
- Updated validation to accept both `.cursor/commands/` and `.claude/commands/` folders

### Notes
- Only the `commands` folder is configurable; `rules` and `prompts` continue to use `.cursor/` folder
- Configuration supports both workspace and user-level settings
- Default behavior remains `.cursor/commands/` for backward compatibility

## [0.2.0] - 2025-11-25

### Added
- **Custom Base URL Support**: Added `"custom"` option to `cursorToys.linkType` configuration
- **Custom URL Configuration**: New `cursorToys.customBaseUrl` setting to specify your own base URL for deeplinks
- URL validation for custom base URLs (supports http://, https://, and custom protocols)
- Automatic trailing slash handling for custom URLs

### Changed
- Enhanced link type configuration to support three formats: deeplink, web, and custom
- Improved error messages for invalid custom URL configurations

## [0.1.0] - 2025-11-24

### Added
- Generate deeplinks for Cursor commands, rules, and prompts
- Import deeplinks to automatically create files in appropriate directories
- Support for both `cursor://` deeplink and `https://cursor.com/link/` web link formats
- CodeLens integration for quick deeplink generation directly in files
- Context menu options for generating deeplinks
- Configurable file extensions (default: md, mdc)
- Configurable link type (deeplink or web)
- Automatic file type detection based on directory structure
- URL length validation (8000 character limit)
- Support for MDC format for rules with metadata

### Features
- Right-click context menu for quick deeplink generation
- Command palette integration
- Keyboard shortcut for importing deeplinks (Ctrl+Shift+I / Cmd+Shift+I)
- Automatic file creation with proper naming and extension handling

