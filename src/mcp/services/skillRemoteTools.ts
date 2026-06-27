import { GistManager } from '../../gistManager';
import { discoverRemoteSkillsFromGitHubUrl } from '../../skillRemoteImporter';
import {
  importDiscoveredRemoteSkills,
  type RemoteSkillImportScope,
} from '../../skillRemoteImportFlow';
import type { McpHostContext } from '../types';

async function getGitHubToken(ctx: McpHostContext): Promise<string | null> {
  try {
    return await GistManager.getInstance(ctx.extensionContext).getGitHubToken();
  } catch {
    return null;
  }
}

export function buildSkillRemoteToolHandlers(
  ctx: McpHostContext
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    skill_remote_discover: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!url) {
        throw new Error('url is required');
      }

      const githubToken = await getGitHubToken(ctx);
      const discovery = await discoverRemoteSkillsFromGitHubUrl(url, githubToken);
      return {
        owner: discovery.repo.owner,
        repo: discovery.repo.repo,
        branch: discovery.repo.branch,
        folderPrefix: discovery.folderPrefix,
        skills: discovery.skills,
      };
    },
    skill_remote_import: async (args) => {
      const url = String(args.url ?? '').trim();
      const scope = args.scope as RemoteSkillImportScope;
      const folderPathsRaw = args.folderPaths;

      if (!url) {
        throw new Error('url is required');
      }
      if (scope !== 'personal' && scope !== 'project') {
        throw new Error('scope must be "personal" or "project"');
      }
      if (args.confirm !== true) {
        return {
          requiresConfirm: true,
          message:
            'Call skill_remote_import again with confirm: true to import the selected remote skills.',
        };
      }

      const githubToken = await getGitHubToken(ctx);
      const discovery = await discoverRemoteSkillsFromGitHubUrl(url, githubToken);
      const requestedPaths = normalizeFolderPaths(folderPathsRaw);

      let skills = discovery.skills;
      if (requestedPaths.length > 0) {
        const requestedSet = new Set(requestedPaths);
        skills = discovery.skills.filter((skill) => requestedSet.has(skill.folderPath));
        if (skills.length === 0) {
          throw new Error('None of the requested folderPaths match discovered skills');
        }
      }

      if (skills.length === 0) {
        throw new Error('No skills found in the provided GitHub URL');
      }

      return importDiscoveredRemoteSkills({
        repo: discovery.repo,
        skills,
        scope,
        githubToken,
        overwrite: args.overwrite === true,
        confirmOverwrite: false,
      });
    },
  };
}

function normalizeFolderPaths(folderPathsRaw: unknown): string[] {
  if (Array.isArray(folderPathsRaw)) {
    return folderPathsRaw.map((value) => String(value));
  }

  if (typeof folderPathsRaw === 'string' && folderPathsRaw.trim().length > 0) {
    return folderPathsRaw.split(',').map((value) => value.trim());
  }

  return [];
}