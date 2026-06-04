#!/usr/bin/env node
/**
 * Extract release notes for a package.json version from CHANGELOG.md.
 * Matches headings like "## v2026.6.4-1" or "## v2026.6.4 - Title".
 */
'use strict';

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node extract-changelog.js <version>');
  process.exit(1);
}

const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error('CHANGELOG.md not found');
  process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, 'utf8');
const lines = changelog.split('\n');

/** @param {string} v */
function versionPrefixes(v) {
  const prefixes = [`v${v}`];
  const withoutBuild = v.replace(/-\d+$/, '');
  if (withoutBuild !== v) {
    prefixes.push(`v${withoutBuild}`);
  }
  return prefixes;
}

/** @param {string} headingLine */
function matchesVersionHeading(headingLine, prefixes) {
  const heading = headingLine.replace(/^##\s+/, '').trim();
  return prefixes.some((prefix) => {
    if (heading === prefix) {
      return true;
    }
    return (
      heading.startsWith(`${prefix} `) ||
      heading.startsWith(`${prefix} -`) ||
      heading.startsWith(`${prefix} —`)
    );
  });
}

const prefixes = versionPrefixes(version);
let startIdx = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('## ') || line.startsWith('### ')) {
    continue;
  }
  if (matchesVersionHeading(line, prefixes)) {
    startIdx = i + 1;
    break;
  }
}

if (startIdx < 0) {
  console.error(
    `No CHANGELOG section found for version ${version} (tried: ${prefixes.join(', ')})`
  );
  process.exit(1);
}

const body = [];
for (let i = startIdx; i < lines.length; i++) {
  const line = lines[i];
  if (/^## v[\d]/.test(line)) {
    break;
  }
  body.push(line);
}

const notes = body.join('\n').trim();
if (!notes) {
  console.error(`CHANGELOG section for ${version} is empty`);
  process.exit(1);
}

process.stdout.write(notes);
