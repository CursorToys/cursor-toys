# Change Log

All notable changes to the "Cursor Deeplink" extension will be documented in this file.

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

