import * as https from 'https';
import { sanitizeFileName } from './utils';

interface ParsedGitHubSkillFolderUrl {
  owner: string;
  repo: string;
  branch: string;
  folderPath: string;
  suggestedSkillName: string;
}

interface GitHubFileResponse {
  type?: string;
  content?: string;
  encoding?: string;
  download_url?: string;
  message?: string;
}

interface GitHubContentItem {
  type?: string;
  path?: string;
  name?: string;
  download_url?: string;
  url?: string;
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

/**
 * Validates if a URL is a supported GitHub skill folder URL.
 */
export function validateGitHubSkillFolderUrl(input: string): string | null {
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
  if (segments.length < 5) {
    return 'URL must point to a GitHub folder path';
  }

  if (segments[2] !== 'tree') {
    return 'URL must use /tree/{branch}/{folder} format';
  }

  if (!segments[3]) {
    return 'Missing branch name in URL';
  }

  if (segments.slice(4).length === 0) {
    return 'URL must point to a folder that contains SKILL.md';
  }

  return null;
}

/**
 * Imports a full skill folder from a GitHub folder URL.
 */
export async function importRemoteSkillFromGitHubFolderUrl(url: string): Promise<RemoteSkillImportResult> {
  const parsed = parseGitHubSkillFolderUrl(url);
  const files = await fetchSkillFolderFiles(parsed);

  const hasSkillFile = files.some((file) => file.path === 'SKILL.md');
  if (!hasSkillFile) {
    throw new Error('SKILL.md not found at the root of the provided folder URL');
  }

  return {
    skillName: parsed.suggestedSkillName,
    files
  };
}

function parseGitHubSkillFolderUrl(url: string): ParsedGitHubSkillFolderUrl {
  const validationError = validateGitHubSkillFolderUrl(url);
  if (validationError) {
    throw new Error(validationError);
  }

  const parsedUrl = new URL(url.trim());
  const segments = parsedUrl.pathname.split('/').filter(Boolean);

  const owner = decodeURIComponent(segments[0]);
  const repo = decodeURIComponent(segments[1]);
  const branch = decodeURIComponent(segments[3]);
  const folderSegments = segments.slice(4).map((segment) => decodeURIComponent(segment));
  const folderPath = folderSegments.join('/');
  const folderName = folderSegments[folderSegments.length - 1] || 'imported-skill';
  const suggestedSkillName = sanitizeFileName(folderName);

  return {
    owner,
    repo,
    branch,
    folderPath,
    suggestedSkillName: suggestedSkillName || 'imported-skill'
  };
}

async function fetchSkillFolderFiles(parsed: ParsedGitHubSkillFolderUrl): Promise<Array<{ path: string; content: string }>> {
  const files = await fetchSkillFilesFromTree(parsed);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function fetchSkillFilesFromTree(parsed: ParsedGitHubSkillFolderUrl): Promise<Array<{ path: string; content: string }>> {
  const apiUrl = new URL(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(parsed.branch)}`
  );
  apiUrl.searchParams.set('recursive', '1');

  const response = await requestText(apiUrl.toString());

  if (response.statusCode === 404) {
    throw new Error('The provided GitHub folder URL was not found');
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

  const folderPrefix = `${parsed.folderPath}/`;
  const treeItems = tree as GitHubTreeItem[];
  const fileItems = treeItems
    .filter((item) => {
      if (item.type !== 'blob' || typeof item.path !== 'string') {
        return false;
      }

      return item.path === `${parsed.folderPath}/SKILL.md` || item.path.startsWith(folderPrefix);
    });

  if (fileItems.length === 0) {
    throw new Error('The provided GitHub folder URL does not contain files');
  }

  const output: Array<{ path: string; content: string }> = [];
  for (const item of fileItems) {
    if (!item.path) {
      continue;
    }

    const relativePath = getRelativeSkillPath(item.path, parsed.folderPath);
    if (!relativePath) {
      continue;
    }

    const content = await fetchRawFileContent(parsed, item.path);
    output.push({ path: relativePath, content });
  }

  return output;
}

function getRelativeSkillPath(fullPath: string, rootFolderPath: string): string {
  if (fullPath === rootFolderPath) {
    return '';
  }

  const prefix = `${rootFolderPath}/`;
  if (fullPath.startsWith(prefix)) {
    return fullPath.substring(prefix.length);
  }

  return '';
}

async function fetchRawFileContent(parsed: ParsedGitHubSkillFolderUrl, fullPath: string): Promise<string> {
  const encodedPath = encodeGitHubPath(fullPath);
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(parsed.branch)}/${encodedPath}`;
  const response = await requestText(rawUrl);

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

function requestText(url: string): Promise<HttpResponseData> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'cursor-toys',
          Accept: 'application/vnd.github+json'
        },
        timeout: 10000
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
            body
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Network timeout while fetching SKILL.md'));
    });

    request.on('error', (error: Error) => {
      reject(error);
    });

    request.end();
  });
}
