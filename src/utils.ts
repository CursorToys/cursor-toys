import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

/**
 * Sanitizes the file name to use only letters, numbers, dots, hyphens, and underscores
 */
export function sanitizeFileName(name: string): string {
  // Remove file extension
  const nameWithoutExt = path.parse(name).name;
  // Remove invalid characters, keeping only letters, numbers, dots, hyphens, and underscores
  return nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Validates if the URL has less than 8000 characters
 */
export function validateUrlLength(url: string): boolean {
  return url.length < 8000;
}

/**
 * Detects the file type based on the path
 */
export function getFileTypeFromPath(filePath: string): 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill' | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const baseFolderName = getBaseFolderName();
  const environmentsFolderName = getEnvironmentsFolderName();
  
  // Hooks file (hooks.json)
  if (normalizedPath.endsWith('/hooks.json') && 
      (normalizedPath.includes('/.cursor/') || 
       normalizedPath.includes(`/.${baseFolderName}/`))) {
    return 'hooks';
  }
  // Commands can be in .cursor/commands/, .claude/commands/, or custom base folder
  if (normalizedPath.includes('/.cursor/commands/') || 
      normalizedPath.includes('/.claude/commands/') ||
      normalizedPath.includes(`/.${baseFolderName}/commands/`)) {
    return 'command';
  }
  // Rules can use custom base folder or legacy .cursor
  if (normalizedPath.includes(`/.${baseFolderName}/rules/`) || 
      normalizedPath.includes('/.cursor/rules/')) {
    return 'rule';
  }
  // Prompts can use custom base folder or legacy .cursor
  if (normalizedPath.includes(`/.${baseFolderName}/prompts/`) || 
      normalizedPath.includes('/.cursor/prompts/')) {
    return 'prompt';
  }
  // Notepads can use custom base folder or legacy .cursor
  if (normalizedPath.includes(`/.${baseFolderName}/notepads/`) || 
      normalizedPath.includes('/.cursor/notepads/')) {
    return 'notepad';
  }
  // Plans can be in personal folder (~/.cursor/plans/) or workspace folder
  // Check personal folder first (home directory)
  const homePath = getUserHomePath();
  const normalizedHomePath = homePath.replace(/\\/g, '/');
  if (normalizedPath.includes(`${normalizedHomePath}/.cursor/plans/`) || 
      normalizedPath.includes(`${normalizedHomePath}/.${baseFolderName}/plans/`)) {
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.plan.md')) {
      return 'plan';
    }
  }
  // Check workspace folder
  if (normalizedPath.includes(`/.${baseFolderName}/plans/`) || 
      normalizedPath.includes('/.cursor/plans/')) {
    // Plans must have .plan.md extension
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.plan.md')) {
      return 'plan';
    }
  }
  // HTTP requests in .{baseFolder}/http/ folder (but not in environments folder)
  if ((normalizedPath.includes(`/.${baseFolderName}/http/`) || 
       normalizedPath.includes('/.cursor/http/')) &&
      !normalizedPath.includes(`/${environmentsFolderName}/`) &&
      !normalizedPath.includes('/environments/')) {
    const ext = getFileExtension(filePath).toLowerCase();
    if (ext === 'req' || ext === 'request') {
      return 'http';
    }
  }
  // Environment files in .{baseFolder}/http/{environmentsFolder}/ folder
  if (normalizedPath.includes(`/.${baseFolderName}/http/${environmentsFolderName}/`) || 
      normalizedPath.includes(`/.cursor/http/${environmentsFolderName}/`) ||
      normalizedPath.includes(`/.${baseFolderName}/http/environments/`) || 
      normalizedPath.includes('/.cursor/http/environments/')) {
    const fileName = path.basename(filePath);
    if (fileName.startsWith('.env')) {
      return 'env';
    }
  }
  // Skills can be in .cursor/skills/, .claude/skills/, or custom base folder
  // Check personal folder first (home directory)
  if (normalizedPath.includes(`${normalizedHomePath}/.cursor/skills/`) || 
      normalizedPath.includes(`${normalizedHomePath}/.claude/skills/`) ||
      normalizedPath.includes(`${normalizedHomePath}/.${baseFolderName}/skills/`)) {
    const fileName = path.basename(filePath);
    if (fileName === 'SKILL.md') {
      return 'skill';
    }
  }
  // Check workspace folder
  if (normalizedPath.includes(`/.cursor/skills/`) || 
      normalizedPath.includes(`/.claude/skills/`) ||
      normalizedPath.includes(`/.${baseFolderName}/skills/`)) {
    const fileName = path.basename(filePath);
    if (fileName === 'SKILL.md') {
      return 'skill';
    }
  }
  
  return null;
}

/**
 * Decodes a URL parameter
 */
export function decodeUrlParam(param: string): string {
  try {
    // First replace + with spaces, then decode
    const withSpaces = param.replace(/\+/g, ' ');
    return decodeURIComponent(withSpaces);
  } catch (error) {
    // If it fails, try to decode in smaller parts or return as is
    try {
      // Try to decode character by character for very long URLs
      return param.replace(/\+/g, ' ').replace(/%([0-9A-F]{2})/gi, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    } catch {
      // If it still fails, return the parameter with + replaced by spaces
      return param.replace(/\+/g, ' ');
    }
  }
}

/**
 * Checks if the file extension is in the allowed extensions list
 */
export function isAllowedExtension(filePath: string, allowedExtensions: string[]): boolean {
  const ext = getFileExtension(filePath);
  return allowedExtensions.includes(ext.toLowerCase());
}

/**
 * Extracts the file extension (without the dot)
 */
export function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.substring(1) : ext;
}

/**
 * Gets the file name without the extension
 */
export function getFileNameWithoutExtension(filePath: string): string {
  return path.parse(filePath).name;
}

/**
 * Gets the user home directory path (cross-platform)
 */
export function getUserHomePath(): string {
  return os.homedir();
}

/**
 * Gets the base folder name based on configuration
 * @returns Base folder name (e.g., 'cursor', 'vscode', 'ai')
 */
export function getBaseFolderName(): string {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const folderName = config.get<string>('baseFolder', 'cursor');
  return folderName.toLowerCase();
}

/**
 * Gets the commands folder name based on configuration ('cursor' or 'claude')
 */
export function getCommandsFolderName(): 'cursor' | 'claude' {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const folderName = config.get<string>('commandsFolder', 'cursor');
  return folderName === 'claude' ? 'claude' : 'cursor';
}

/**
 * Gets the full path to the commands folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getCommandsPath(workspacePath?: string, isUser: boolean = false): string {
  const folderName = getCommandsFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${folderName}`, 'commands');
  }
  
  // For workspace commands, use baseFolder if configured
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'commands');
}

/**
 * Gets the paths to the command folders to show in Personal Commands view
 * @returns Array of folder paths based on personalCommandsView configuration
 */
export function getPersonalCommandsPaths(): string[] {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const viewMode = config.get<string>('personalCommandsView', 'both');
  const homePath = getUserHomePath();
  
  const paths: string[] = [];
  
  if (viewMode === 'both' || viewMode === 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'commands'));
  }
  
  if (viewMode === 'both' || viewMode === 'claude') {
    paths.push(path.join(homePath, '.claude', 'commands'));
  }
  
  return paths;
}

/**
 * Gets the full path to the rules folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getRulesPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'rules');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'rules');
}

/**
 * Gets the full path to the prompts folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getPromptsPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'prompts');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'prompts');
}

/**
 * Gets the paths to the prompt folders to show in Personal Prompts view
 * @returns Array of folder paths based on baseFolder configuration
 */
export function getPersonalPromptsPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [];
  
  // Use configured base folder
  paths.push(path.join(homePath, `.${baseFolderName}`, 'prompts'));
  
  // Also include .cursor if different (for backward compatibility)
  if (baseFolderName !== 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'prompts'));
  }
  
  return paths;
}

/**
 * Gets the full path to the notepads folder
 * @param workspacePath Workspace path (required for notepads - they are workspace-specific)
 * @param isUser Deprecated - notepads are always workspace-specific
 */
export function getNotepadsPath(workspacePath: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'notepads');
}

/**
 * Gets the full path to the plans folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getPlansPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'plans');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'plans');
}

/**
 * Gets the paths to the plan folders to show in Personal Plans view
 * @returns Array of folder paths based on baseFolder configuration
 */
export function getPersonalPlansPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [];
  
  // Use configured base folder
  paths.push(path.join(homePath, `.${baseFolderName}`, 'plans'));
  
  // Also include .cursor if different (for backward compatibility)
  if (baseFolderName !== 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'plans'));
  }
  
  return paths;
}

/**
 * Checks if a file has the .plan.md extension
 * @param filePath The file path to check
 * @returns true if the file has .plan.md extension
 */
export function isPlanFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName.endsWith('.plan.md');
}

/**
 * Checks if a file is an HTTP request file (.req or .request) in .{baseFolder}/http/ folder
 * @param filePath The file path to check
 * @returns true if the file is an HTTP request file
 */
export function isHttpRequestFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check if file is in any base folder's http/ directory
  const baseFolderName = getBaseFolderName();
  if (!normalizedPath.includes(`/.${baseFolderName}/http/`) && 
      !normalizedPath.includes('/.cursor/http/')) {
    return false;
  }
  
  // Check if extension is .req or .request
  const ext = getFileExtension(filePath).toLowerCase();
  return ext === 'req' || ext === 'request';
}

/**
 * Gets the response file path for a given request file path
 * @param requestPath The path to the .req or .request file
 * @returns The path to the corresponding .res or .response file
 */
export function getHttpResponsePath(requestPath: string): string {
  const ext = getFileExtension(requestPath).toLowerCase();
  const dir = path.dirname(requestPath);
  const baseName = getFileNameWithoutExtension(requestPath);
  
  // Replace .req with .res or .request with .response
  // .res naturally sorts after .req alphabetically
  const responseExt = ext === 'req' ? 'res' : 'response';
  return path.join(dir, `${baseName}.${responseExt}`);
}

/**
 * Gets the environments folder name based on configuration
 * @returns Environments folder name (e.g., '.environments', 'environments', '__environments__', '_env')
 */
export function getEnvironmentsFolderName(): string {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const folderName = config.get<string>('environmentsFolder', '.environments');
  return folderName;
}

/**
 * Gets the path to the environments folder
 * @param workspacePath Workspace path
 * @returns Path to .{baseFolder}/http/{environmentsFolder}/
 */
export function getEnvironmentsPath(workspacePath: string): string {
  const baseFolderName = getBaseFolderName();
  const environmentsFolderName = getEnvironmentsFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'http', environmentsFolderName);
}

/**
 * Gets the path to the HTTP folder
 * @param workspacePath Workspace path
 * @returns Path to .{baseFolder}/http/
 */
export function getHttpPath(workspacePath: string): string {
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'http');
}

/**
 * Checks if a file is an environment file (.env*)
 * @param filePath The file path to check
 * @returns true if the file is an environment file
 */
export function isEnvironmentFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName.startsWith('.env');
}

/**
 * Checks if a file is an HTTP or ENV file that can be shared
 * @param filePath The file path to check
 * @returns true if the file is HTTP request or ENV file
 */
export function isHttpOrEnvFile(filePath: string): boolean {
  const fileType = getFileTypeFromPath(filePath);
  return fileType === 'http' || fileType === 'env';
}

/**
 * Parses simple YAML frontmatter from file content
 * Helper function that uses the frontmatterParser module
 * @param content File content
 * @returns Parsed frontmatter data or null if none found
 */
export function parseYAMLFrontmatter(content: string): Record<string, any> | null {
  // Import is done dynamically to avoid circular dependencies
  const { parseFrontmatter } = require('./frontmatterParser');
  
  try {
    const parsed = parseFrontmatter(content);
    return parsed.hasFrontmatter ? parsed.metadata : null;
  } catch (error) {
    console.error('Error parsing YAML frontmatter:', error);
    return null;
  }
}

/**
 * Extracts description from YAML frontmatter
 * @param content File content
 * @returns Description string or empty string
 */
export function extractDescriptionFromFrontmatter(content: string): string {
  const frontmatter = parseYAMLFrontmatter(content);
  return frontmatter?.description || '';
}

/**
 * Extracts tags from YAML frontmatter
 * @param content File content
 * @returns Array of tags
 */
export function extractTagsFromFrontmatter(content: string): string[] {
  const frontmatter = parseYAMLFrontmatter(content);
  if (frontmatter?.tags && Array.isArray(frontmatter.tags)) {
    return frontmatter.tags.map((tag: string) => tag.toLowerCase().trim()).filter((tag: string) => tag.length > 0);
  }
  return [];
}

/**
 * Gets the path to hooks.json file
 * @param workspacePath Workspace root path
 * @param isPersonal If true, returns personal hooks path (~/.cursor/hooks.json)
 * @returns Path to hooks.json
 */
export function getHooksPath(workspacePath: string, isPersonal: boolean): string {
  if (isPersonal) {
    return getPersonalHooksPath();
  }
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'hooks.json');
}

/**
 * Gets the personal hooks.json path (~/.cursor/hooks.json)
 * @returns Path to personal hooks.json
 */
export function getPersonalHooksPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.cursor', 'hooks.json');
}

/**
 * Gets the full path to the skills folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getSkillsPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'skills');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'skills');
}

/**
 * Gets the paths to the skills folders to show in Personal Skills view
 * @returns Array of folder paths (includes both .cursor and .claude for compatibility)
 */
export function getPersonalSkillsPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [];
  
  // Always include .cursor and .claude for skills (both are supported)
  paths.push(path.join(homePath, '.cursor', 'skills'));
  paths.push(path.join(homePath, '.claude', 'skills'));
  
  // Also include configured base folder if different
  if (baseFolderName !== 'cursor' && baseFolderName !== 'claude') {
    paths.push(path.join(homePath, `.${baseFolderName}`, 'skills'));
  }
  
  return paths;
}

/**
 * Checks if a folder contains a SKILL.md file
 * @param folderPath The folder path to check
 * @returns true if the folder contains SKILL.md
 */
export async function isSkillFolder(folderPath: string): Promise<boolean> {
  try {
    const skillFilePath = path.join(folderPath, 'SKILL.md');
    const skillUri = vscode.Uri.file(skillFilePath);
    await vscode.workspace.fs.stat(skillUri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates llms.txt file in HTTP folder with instructions on how to use HTTP requests
 * @param httpFolderPath Path to the HTTP folder
 * @param overwrite If true, overwrite existing llms.txt; if false, skip when file exists
 */
export async function createHttpLlmsFile(httpFolderPath: string, overwrite?: boolean): Promise<void> {
  const llmsFilePath = path.join(httpFolderPath, 'llms.txt');
  const llmsUri = vscode.Uri.file(llmsFilePath);

  if (!overwrite) {
    try {
      await vscode.workspace.fs.stat(llmsUri);
      return;
    } catch {
      // File doesn't exist, create it
    }
  }

  const baseFolderName = getBaseFolderName();
  const environmentsFolderName = getEnvironmentsFolderName();

  const llmsContent = `---
description: CursorToys HTTP Requests - In-Editor API Testing
alwaysApply: true
applyTo: "**/*.{req,request}"
version: 1.6.0
---

# CursorToys HTTP Requests

Test HTTP requests without leaving Cursor/VS Code. This folder contains HTTP request files that can be executed directly from the editor.

## File Location

Create \`.req\` or \`.request\` files in this folder (.\`${baseFolderName}/http/\`).

## Supported Formats

### cURL Commands
Full cURL syntax support:

\`\`\`http
## Get All Users
curl --request GET \\
  --url https://api.example.com/users \\
  --header 'Authorization: Bearer {{API_KEY}}'
\`\`\`

### REST Client Format
\`METHOD URL\` with headers and body (similar to VS Code REST Client extension):

\`\`\`http
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
\`\`\`

## Multiple Requests

Use markdown sections (\`## Section Title\`) to organize multiple requests in one file. Each section gets its own "Send Request" CodeLens link.

## Environment Variables

Store variables in \`.\`${baseFolderName}/http/${environmentsFolderName}/\` folder:
- Files: \`.env\`, \`.env.dev\`, \`.env.staging\`, \`.env.prod\`, etc.
- Use \`{{variableName}}\` syntax in requests
- Switch environments via Command Palette: "CursorToys: Select HTTP Environment"
- Status bar shows current active environment

## Inline Variables

Define variables directly in request files: \`# @var VAR_NAME=value\`
- Global variables (before first \`##\` section) apply to all sections
- Section-specific variables override global variables
- Cascading behavior: section variables inherit from previous section or global

## Helper Functions

- \`{{@prompt("label")}}\` - Prompt user for input value
- \`{{@randomIn(min, max)}}\` - Generate random integer between min and max (inclusive)
- \`{{@datetime}}\` or \`{{@datetime("format")}}\` - Current date/time (format: ISO, timestamp, date, time)
- \`{{@uuid()}}\` - Generate random UUID v4
- \`{{@randomString(length)}}\` - Generate random alphanumeric string
- \`{{@userAgent()}}\` - Generate random browser User-Agent string
- \`{{@ip()}}\` - Generate random IPv4 address
- \`{{@lorem(count)}}\` - Generate Lorem Ipsum text (1 to 100 words; default 5)
- \`{{@randomFrom("a", "b", "c")}}\` - Pick a random item from the list of arguments

## Environment Decorators

Use \`# @env environmentName\` before sections to specify environment:

\`\`\`http
# @env prod

## Request 1
GET {{BASE_URL}}/api/users
# Uses 'prod' environment

# @env dev
## Request 2
POST {{BASE_URL}}/api/users
# Uses 'dev' environment (explicit)

## Request 3
GET {{BASE_URL}}/api/posts
# Uses 'dev' environment (inherited from previous section)
\`\`\`

## Response Handling

- Responses saved to \`.res\` or \`.response\` files (or preview-only mode)
- Automatic JSON and XML formatting
- Execution time displayed in response tab title
- Syntax highlighting for both request and response files

## Configuration

- \`cursorToys.httpRequestTimeout\`: Timeout in seconds (default: 10)
- \`cursorToys.httpRequestSaveFile\`: Save response to file or preview only (default: false)
- \`cursorToys.httpDefaultEnvironment\`: Default environment name (default: "dev")
- \`cursorToys.environmentsFolder\`: Folder name for environments (default: "${environmentsFolderName}")

## Usage

1. Create a \`.req\` or \`.request\` file in this folder
2. Write your HTTP request using cURL or REST Client format
3. Click "Send Request" CodeLens link that appears above the request
4. Response opens in a new tab with formatted output

## Examples

### Example 1: Simple GET Request
\`\`\`http
## Get User
GET https://api.github.com/users/octocat
\`\`\`

### Example 2: Using Environment Variables
1. Create \`${environmentsFolderName}/.env.dev\`:
\`\`\`env
BASE_URL=http://localhost:3000
API_KEY=dev-key-123
\`\`\`
2. Create request file:
\`\`\`http
## Get Users
GET {{BASE_URL}}/api/users
Authorization: Bearer {{API_KEY}}
\`\`\`
3. Switch environment via Command Palette: "CursorToys: Select HTTP Environment"
4. Select \`dev\` environment
5. Click "Send Request" - variables are automatically substituted

### Example 3: Using Inline Variables
\`\`\`http
# @var API_BASE=https://api.example.com
# @var USER_ID=12345

## Get User
GET {{API_BASE}}/users/{{USER_ID}}

# @var USER_ID=67890
## Get Another User
GET {{API_BASE}}/users/{{USER_ID}}
\`\`\`

### Example 4: Using Helper Functions
\`\`\`http
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
\`\`\`

### Example 5: Using userAgent, ip, lorem and randomFrom
\`\`\`http
## Request with random helpers
GET {{BASE_URL}}/api/items
User-Agent: {{@userAgent()}}
X-Forwarded-For: {{@ip()}}
X-Request-Type: {{@randomFrom("internal", "external", "test")}}

POST {{BASE_URL}}/api/feedback
Content-Type: application/json

{
  "summary": "{{@lorem(10)}}",
  "source": "{{@randomFrom("web", "mobile", "api")}}"
}
\`\`\`

## Best Practices

1. **Organize requests by feature** - use markdown sections (\`## Feature Name\`)
2. **Use environment variables** - avoid hardcoding URLs and keys
3. **Create multiple environments** - dev, staging, prod
4. **Use inline variables for request-specific values** - \`# @var\` decorators
5. **Use helper functions for dynamic data** - \`@uuid()\`, \`@datetime\`, etc.
6. **Use environment decorators** - \`# @env\` for section-specific environments

## Troubleshooting

### HTTP Request Not Executing
- Verify \`curl\` is installed and in PATH
- Check file is in \`.\`${baseFolderName}/http/\` folder
- Verify file extension is \`.req\` or \`.request\`

### Environment Variables Not Resolving
- Verify environment file exists in \`.\`${baseFolderName}/http/${environmentsFolderName}/\`
- Check environment name matches (case-insensitive)
- Verify variable name matches exactly (case-insensitive)
- Check active environment in status bar
- Use \`# @env\` decorator for section-specific environments

### CodeLens Not Showing
- Verify file is in correct folder (\`.\`${baseFolderName}/http/\`)
- Check file extension is \`.req\` or \`.request\`
- Reload window: \`Cmd+Shift+P\` → "Developer: Reload Window"
`;

  try {
    const contentBuffer = Buffer.from(llmsContent, 'utf8');
    await vscode.workspace.fs.writeFile(llmsUri, contentBuffer);
  } catch (error) {
    console.error(`Failed to create llms.txt in HTTP folder: ${httpFolderPath}`, error);
  }
}
