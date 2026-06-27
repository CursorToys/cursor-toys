import * as assert from 'assert';
import {
  discoverSkillsInTree,
  parseGitHubRepoUrl,
  validateGitHubRepoUrl,
  validateGitHubSkillFolderUrl,
} from './skillRemoteImporter';

function runTests(): void {
  assert.strictEqual(validateGitHubRepoUrl(''), 'Please enter a repository URL');
  assert.strictEqual(validateGitHubRepoUrl('https://gitlab.com/o/r'), 'Only github.com URLs are supported in this version');
  assert.strictEqual(validateGitHubRepoUrl('https://github.com/owner'), 'URL must include owner and repository name');
  assert.strictEqual(validateGitHubRepoUrl('https://github.com/owner/repo/tree/'), 'Missing branch name in URL');
  assert.strictEqual(validateGitHubRepoUrl('https://github.com/owner/repo'), null);
  assert.strictEqual(validateGitHubRepoUrl('https://github.com/owner/repo/tree/main'), null);
  assert.strictEqual(
    validateGitHubRepoUrl('https://github.com/owner/repo/tree/main/.cursor/skills/foo'),
    null
  );

  assert.strictEqual(
    validateGitHubSkillFolderUrl('https://github.com/owner/repo/tree/main'),
    'URL must point to a GitHub folder path'
  );
  assert.strictEqual(
    validateGitHubSkillFolderUrl('https://github.com/owner/repo/tree/main/.cursor/skills/foo'),
    null
  );

  const repoRoot = parseGitHubRepoUrl('https://github.com/acme/skills-repo');
  assert.deepStrictEqual(repoRoot, {
    owner: 'acme',
    repo: 'skills-repo',
    branch: '',
  });

  const branchRoot = parseGitHubRepoUrl('https://github.com/acme/skills-repo/tree/develop');
  assert.strictEqual(branchRoot.owner, 'acme');
  assert.strictEqual(branchRoot.repo, 'skills-repo');
  assert.strictEqual(branchRoot.branch, 'develop');
  assert.strictEqual(branchRoot.folderPrefix, undefined);

  const folderUrl = parseGitHubRepoUrl(
    'https://github.com/acme/skills-repo/tree/main/.cursor/skills/deep-spec'
  );
  assert.deepStrictEqual(folderUrl, {
    owner: 'acme',
    repo: 'skills-repo',
    branch: 'main',
    folderPrefix: '.cursor/skills/deep-spec',
  });

  const tree = [
    { type: 'blob', path: '.cursor/skills/alpha/SKILL.md' },
    { type: 'blob', path: '.cursor/skills/alpha/reference.md' },
    { type: 'blob', path: 'packages/beta/SKILL.md' },
    { type: 'blob', path: 'SKILL.md' },
    { type: 'blob', path: '.git/logs/SKILL.md' },
    { type: 'tree', path: '.cursor/skills/gamma' },
  ];

  const allSkills = discoverSkillsInTree(tree);
  assert.strictEqual(allSkills.length, 3);
  assert.deepStrictEqual(allSkills[0], {
    folderPath: '',
    suggestedName: 'imported-skill',
  });
  assert.deepStrictEqual(allSkills[1], {
    folderPath: '.cursor/skills/alpha',
    suggestedName: 'alpha',
  });
  assert.deepStrictEqual(allSkills[2], {
    folderPath: 'packages/beta',
    suggestedName: 'beta',
  });

  const prefixedSkills = discoverSkillsInTree(tree, '.cursor/skills');
  assert.strictEqual(prefixedSkills.length, 1);
  assert.strictEqual(prefixedSkills[0]?.folderPath, '.cursor/skills/alpha');

  const nestedPrefixSkills = discoverSkillsInTree(tree, '.cursor/skills/alpha');
  assert.strictEqual(nestedPrefixSkills.length, 1);
  assert.strictEqual(nestedPrefixSkills[0]?.folderPath, '.cursor/skills/alpha');

  const emptySkills = discoverSkillsInTree([{ type: 'blob', path: 'README.md' }]);
  assert.strictEqual(emptySkills.length, 0);

  const dedupedSkills = discoverSkillsInTree([
    { type: 'blob', path: '.cursor/skills/dup/SKILL.md' },
    { type: 'blob', path: '.cursor/skills/dup/SKILL.md' },
  ]);
  assert.strictEqual(dedupedSkills.length, 1);

  console.log('skillRemoteImporter: all tests passed.');
}

runTests();
