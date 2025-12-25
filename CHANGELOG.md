# Change Log

All notable changes to the "Cursor Toys" extension will be documented in this file.

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
  - `cursorDeeplink.httpRequestTimeout`: Timeout in seconds for HTTP requests (default: 10)
  - `cursorDeeplink.httpRequestSaveFile`: Save HTTP response to file or show preview only (default: false)
- **Language Support**: New language definitions and syntax highlighting
  - `http-request` language for `.req` and `.request` files
  - `http-response` language for `.res` and `.response` files
  - TextMate grammar files for proper syntax highlighting
- **New Command**: `cursor-commands-toys.sendHttpRequest` to execute HTTP requests from files
- **HTTP CodeLens Provider**: Dedicated CodeLens provider for HTTP request files
  - Shows "Send Request" links at the top of request files
  - Shows "Send Request: [Section Title]" links for each markdown section in multi-request files
  - Only active for files in `.cursor/http/` folder
- **Custom Response Tab Titles**: Response tabs display execution time in the title (e.g., "response (1.23s).res")

### Changed
- **Version**: Bumped to 0.7.0 to reflect major new feature addition
- **Activation Events**: Added `onCommand:cursor-commands-toys.sendHttpRequest` activation event
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
  - `cursor-commands-toys.sendToChat`: Send custom text to Cursor chat
  - `cursor-commands-toys.sendSelectionToChat`: Send selected code to Cursor chat with context
  - `cursor-commands-toys.copySelectionAsPrompt`: Copy selected code as prompt deeplink with file context
- **Annotation Panel**: New Webview Panel that opens via deeplinks (similar to Datadog extension)
  - Opens via `cursor://godrix.cursor-deeplink/annotation?...` or `vscode://godrix.cursor-deeplink/annotation?...` deeplinks
  - Displays code, errors, and context in a formatted view
  - "Fix in Chat" button to send content directly to Cursor chat
- **URI Handler**: Registered custom protocol handler for `cursor://godrix.cursor-deeplink/*` and `vscode://godrix.cursor-deeplink/*`
- **Editor Context Menu**: New submenu "Cursor Toys" when text is selected with options:
  - Send Selection to Chat
  - Copy as Prompt Deeplink (includes file path, language, and line numbers in context)
- **Context Information**: Copy command now includes file context (relative path, language, line numbers) when copying code as prompt deeplink

### Changed
- **Extension Rebranding**: Renamed extension from "Cursor Commands Share" to "Cursor Sidekick", and later to "Cursor Toys"
- **Command IDs**: All command IDs updated from `cursor-sidekick.*` to `cursor-commands-toys.*` for consistency
- Updated all user-facing text, command titles, and documentation to reflect the new name "Cursor Toys"
- Removed "Send to Chat" command from Command Palette (now only available via context menu)
- CodeLens labels updated to show "Generate Cursor Toys" instead of "Generate Cursor Sidekick"
- Annotation Panel titles updated to "Cursor Toys - Annotation"

## [0.5.1] - 2025-12-02

### Added
- **Configurable Personal Commands View**: New `cursorDeeplink.personalCommandsView` setting to choose which command folders to display in the Personal Commands tree view
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
- **Configurable Commands Folder**: New `cursorDeeplink.commandsFolder` setting to choose between `cursor` (default) or `claude` for where to save imported commands
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
- **Custom Base URL Support**: Added `"custom"` option to `cursorDeeplink.linkType` configuration
- **Custom URL Configuration**: New `cursorDeeplink.customBaseUrl` setting to specify your own base URL for deeplinks
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

