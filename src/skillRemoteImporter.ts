import * as https from 'https';
import * as path from 'path';

export interface ParsedGitHubRepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface ParsedGitHubRepoUrl extends ParsedGitHubRepoRef {
  folderPrefix?: string;
}

export interface DiscoveredRemoteSkill {
  folderPath: string;
  suggestedName: string;
}

interface GitHubTreeItem {
  path?: string;
  type?: string;
}

interface HttpResponseData {
  statusCode: number;
  body: string;
}

export interface RemoteSkillImportResult {
  skillName: string;
  files: Array<{ path: string; content: string }>;
}

export interface DiscoverRemoteSkillsResult {
  repo: ParsedGitHubRepoRef;
  folderPrefix?: string;
  skills: DiscoveredRemoteSkill[];
}

/**
 * Validates a GitHub repository URL (repo root, branch, or folder under /tree/).
 */
export function validateGitHubRepoUrl(input: string): string | null {
  if (!input || input.trim().length === 0) {
    return 'Please enter a repository URL';
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.trim());
  } catch {
    return 'Invalid URL format';
  }

  if (parsedUrl.protocol !== 'https:') {
    return 'Only HTTPS URLs are supported';
  }

  if (parsedUrl.hostname !== 'github.com') {
    return 'Only github.com URLs are supported in this version';
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return 'URL must include owner and repository name';
  }

  if (segments.length >= 3 && segments[2] === 'tree' && !segments[3]) {
    return 'Missing branch name in URL';
  }

  return null;
}

/**
 * Validates if a URL is a supported GitHub skill folder URL.
 */
export function validateGitHubSkillFolderUrl(input: string): string | null {
  const repoError = validateGitHubRepoUrl(input);
  if (repoError) {
    return repoError;
  }

  const parsedUrl = new URL(input.trim());
  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length < 5) {
    return 'URL must point to a GitHub folder path';
  }

  if (segments[2] !== 'tree') {
    return 'URL must use /tree/{branch}/{folder} format';
  }

  if (segments.slice(4).length === 0) {
    return 'URL must point to a folder that contains SKILL.md';
  }

  return null;
}

/**
 * Parses a GitHub repository URL into owner, repo, optional branch, and optional folder prefix.
 */
export function parseGitHubRepoUrl(url: string): ParsedGitHubRepoUrl {
  const validationError = validateGitHubRepoUrl(url);
  if (validationError) {
    throw new Error(validationError);
  }

  const parsedUrl = new URL(url.trim());
  const segments = parsedUrl.pathname.split('/').filter(Boolean);

  const owner = decodeURIComponent(segments[0]);
  const repo = decodeURIComponent(segments[1]);

  if (segments.length >= 3 && segments[2] === 'tree') {
    const branch = decodeURIComponent(segments[3]);
    const folderSegments = segments.slice(4).map((segment) => decodeURIComponent(segment));
    const folderPrefix = folderSegments.length > 0 ? folderSegments.join('/') : undefined;
    return { owner, repo, branch, folderPrefix };
  }

  return { owner, repo, branch: '' };
}

/**
 * Finds skill folders (directories containing SKILL.md) in a GitHub tree listing.
 */
export function discoverSkillsInTree(
  tree: GitHubTreeItem[],
  folderPrefix?: string
): DiscoveredRemoteSkill[] {
  const seen = new Set<string>();
  const skills: DiscoveredRemoteSkill[] = [];

  for (const item of tree) {
    if (item.type !== 'blob' || typeof item.path !== 'string') {
      continue;
    }

    const skillMdPath = item.path;
    if (skillMdPath.startsWith('.git/') || skillMdPath.includes('/.git/')) {
      continue;
    }

    if (!isSkillMarkdownPath(skillMdPath)) {
      continue;
    }

    if (!matchesFolderPrefix(skillMdPath, folderPrefix)) {
      continue;
    }

    const folderPath = getSkillFolderPathFromSkillMdPath(skillMdPath);
    if (seen.has(folderPath)) {
      continue;
    }

    seen.add(folderPath);
    skills.push({
      folderPath,
      suggestedName: getSuggestedSkillName(folderPath),
    });
  }

  skills.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  return skills;
}

/**
 * Resolves the default branch for a GitHub repository.
 */
export async function resolveDefaultBranch(
  owner: string,
  repo: string,
  githubToken?: string | null
): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const response = await requestText(apiUrl, githubToken);

  if (response.statusCode === 404) {
    throw new Error('The provided GitHub repository was not found');
  }

  if (response.statusCode === 403) {
    throw new Error('GitHub API request was forbidden (possible rate limit). Please try again later.');
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Failed to fetch repository metadata from GitHub (HTTP ${response.statusCode})`);
  }

  const parsedResponse = parseJsonObject(response.body);
  const defaultBranch = parsedResponse.default_branch;
  if (typeof defaultBranch !== 'string' || defaultBranch.length === 0) {
    throw new Error('Unable to determine default branch for repository');
  }

  return defaultBranch;
}

/**
 * Fetches the recursive git tree for a repository branch.
 */
export async function fetchRepoTree(
  repo: ParsedGitHubRepoRef,
  githubToken?: string | null
): Promise<GitHubTreeItem[]> {
  const apiUrl = new URL(
    `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(repo.branch)}`
  );
  apiUrl.searchParams.set('recursive', '1');

  const response = await requestText(apiUrl.toString(), githubToken);

  if (response.statusCode === 404) {
    throw new Error('The provided GitHub repository or branch was not found');
  }

  if (response.statusCode === 403) {
    throw new Error('GitHub API request was forbidden (possible rate limit). Please try again later.');
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Failed to fetch repository tree from GitHub (HTTP ${response.statusCode})`);
  }

  const parsedResponse = parseJsonObject(response.body);
  const tree = parsedResponse.tree;
  if (!Array.isArray(tree)) {
    throw new Error('Unable to read repository tree from GitHub API');
  }

  return tree as GitHubTreeItem[];
}

/**
 * Discovers skills in a GitHub repository URL.
 */
export async function discoverRemoteSkillsFromGitHubUrl(
  url: string,
  githubToken?: string | null
): Promise<DiscoverRemoteSkillsResult> {
  const parsed = parseGitHubRepoUrl(url);
  const branch = parsed.branch || (await resolveDefaultBranch(parsed.owner, parsed.repo, githubToken));
  const repo: ParsedGitHubRepoRef = {
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
  };

  const tree = await fetchRepoTree(repo, githubToken);
  const skills = discoverSkillsInTree(tree, parsed.folderPrefix);

  return {
    repo,
    folderPrefix: parsed.folderPrefix,
    skills,
  };
}

/**
 * Imports a full skill folder from a GitHub folder URL.
 */
export async function importRemoteSkillFromGitHubFolderUrl(
  url: string,
  githubToken?: string | null
): Promise<RemoteSkillImportResult> {
  const parsed = parseGitHubRepoUrl(url);
  if (!parsed.folderPrefix) {
    throw new Error('URL must point to a GitHub folder path');
  }

  const branch = parsed.branch || (await resolveDefaultBranch(parsed.owner, parsed.repo, githubToken));
  return importRemoteSkillFromFolder(
    { owner: parsed.owner, repo: parsed.repo, branch },
    parsed.folderPrefix,
    githubToken
  );
}

/**
 * Imports a skill folder from a resolved repository reference and folder path.
 */
export async function importRemoteSkillFromFolder(
  repo: ParsedGitHubRepoRef,
  folderPath: string,
  githubToken?: string | null
): Promise<RemoteSkillImportResult> {
  const files = await fetchSkillFolderFiles(repo, folderPath, githubToken);

  const hasSkillFile = files.some((file) => file.path === 'SKILL.md');
  if (!hasSkillFile) {
    throw new Error('SKILL.md not found at the root of the provided folder path');
  }

  return {
    skillName: getSuggestedSkillName(folderPath),
    files,
  };
}

async function fetchSkillFolderFiles(
  repo: ParsedGitHubRepoRef,
  folderPath: string,
  githubToken?: string | null
): Promise<Array<{ path: string; content: string }>> {
  const tree = await fetchRepoTree(repo, githubToken);
  const folderPrefix = `${folderPath}/`;
  const fileItems = tree.filter((item) => {
    if (item.type !== 'blob' || typeof item.path !== 'string') {
      return false;
    }

    return item.path === `${folderPath}/SKILL.md` || item.path.startsWith(folderPrefix);
  });

  if (fileItems.length === 0) {
    throw new Error('The provided folder path does not contain files');
  }

  const output: Array<{ path: string; content: string }> = [];
  for (const item of fileItems) {
    if (!item.path) {
      continue;
    }

    const relativePath = getRelativeSkillPath(item.path, folderPath);
    if (!relativePath) {
      continue;
    }

    const content = await fetchRawFileContent(repo, item.path, githubToken);
    output.push({ path: relativePath, content });
  }

  output.sort((a, b) => a.path.localeCompare(b.path));
  return output;
}

function isSkillMarkdownPath(filePath: string): boolean {
  return filePath === 'SKILL.md' || filePath.endsWith('/SKILL.md');
}

function getSkillFolderPathFromSkillMdPath(skillMdPath: string): string {
  if (skillMdPath === 'SKILL.md') {
    return '';
  }

  return skillMdPath.slice(0, -'/SKILL.md'.length);
}

function matchesFolderPrefix(skillMdPath: string, folderPrefix?: string): boolean {
  if (!folderPrefix) {
    return true;
  }

  const expectedSkillMdPath = `${folderPrefix}/SKILL.md`;
  return skillMdPath === expectedSkillMdPath || skillMdPath.startsWith(`${folderPrefix}/`);
}

function getSuggestedSkillName(folderPath: string): string {
  if (!folderPath) {
    return 'imported-skill';
  }

  const folderName = path.posix.basename(folderPath.replace(/\\/g, '/'));
  return sanitizeSkillFolderName(folderName) || 'imported-skill';
}

function sanitizeSkillFolderName(name: string): string {
  const nameWithoutExt = path.parse(name).name;
  return nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getRelativeSkillPath(fullPath: string, rootFolderPath: string): string {
  if (fullPath === rootFolderPath) {
    return '';
  }

  const prefix = `${rootFolderPath}/`;
  if (fullPath.startsWith(prefix)) {
    return fullPath.substring(prefix.length);
  }

  if (rootFolderPath === '' && fullPath === 'SKILL.md') {
    return 'SKILL.md';
  }

  return '';
}

async function fetchRawFileContent(
  repo: ParsedGitHubRepoRef,
  fullPath: string,
  githubToken?: string | null
): Promise<string> {
  const encodedPath = encodeGitHubPath(fullPath);
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${encodeURIComponent(repo.branch)}/${encodedPath}`;
  const response = await requestText(rawUrl, githubToken);

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.body;
  }

  throw new Error(`Failed to download file content for ${fullPath} (HTTP ${response.statusCode})`);
}

function encodeGitHubPath(filePath: string): string {
  return filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GitHub response is not a valid object');
  }
  return parsed as Record<string, unknown>;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Unable to parse GitHub API response');
  }
}

function requestText(url: string, githubToken?: string | null): Promise<HttpResponseData> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'cursor-toys',
      Accept: 'application/vnd.github+json',
    };

    if (githubToken && githubToken.trim().length > 0) {
      headers.Authorization = `Bearer ${githubToken.trim()}`;
    }

    const request = https.request(
      url,
      {
        method: 'GET',
        headers,
        timeout: 10000,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });

        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: response.statusCode ?? 0,
            body,
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Network timeout while fetching from GitHub'));
    });

    request.on('error', (error: Error) => {
      reject(error);
    });

    request.end();
  });
}
