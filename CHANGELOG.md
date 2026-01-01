# Change Log

All notable changes to the "CursorToys" extension will be documented in this file.

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

