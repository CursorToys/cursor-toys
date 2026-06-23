#!/usr/bin/env node
'use strict';

/**
 * Standalone feed hook for Cursor Pet.
 * Usage: node cursor-pet-feed.js [weight]
 * Example hooks.json entry:
 *   { "command": "node ./hooks/cursor-pet-feed.js" }
 */

const { spawnSync } = require('child_process');
const path = require('path');

const weight = process.argv[2] || '1';
const bridgePath = path.join(__dirname, 'cursor-pet-bridge.js');
const result = spawnSync(process.execPath, [bridgePath, 'petFeed', weight], {
  stdio: 'inherit',
});

process.exit(result.status === null ? 0 : result.status);
