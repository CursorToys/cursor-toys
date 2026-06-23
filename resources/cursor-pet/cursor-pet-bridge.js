#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const EVENT_CATEGORY = {
  beforeSubmitPrompt: 'chat',
  afterAgentResponse: 'chat',
  afterFileEdit: 'code',
  afterTabFileEdit: 'code',
  afterShellExecution: 'code',
  stop: 'code',
  petFeed: 'code',
  petPlay: 'chat',
  petTreat: 'code',
  petClean: 'code',
  petMedicine: 'explore',
  petDiscipline: 'chat',
  petLightsOff: 'heartbeat',
  postToolUse: 'explore',
  afterMCPExecution: 'explore',
  subagentStart: 'explore',
  subagentStop: 'explore',
  sessionStart: 'heartbeat',
  sessionEnd: 'heartbeat',
};

function getActivityFilePath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.cursortoys', 'cursor-pet', 'activity.ndjson');
}

function appendActivity(eventName) {
  const category = EVENT_CATEGORY[eventName];
  if (!category) {
    return;
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event: eventName,
    category,
    weight: 1,
  });
  const filePath = getActivityFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function drainStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) {
      resolve(data);
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 50);
  });
}

async function main() {
  const eventName = process.argv[2];
  const weightArg = Number(process.argv[3]);
  const weight = Number.isFinite(weightArg) && weightArg > 0 ? weightArg : 1;
  await drainStdin();
  if (eventName) {
    const category = EVENT_CATEGORY[eventName];
    if (!category) {
      process.stdout.write('{}');
      process.exit(0);
      return;
    }
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event: eventName,
      category,
      weight,
    });
    const filePath = getActivityFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  }
  process.stdout.write('{}');
  process.exit(0);
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});
