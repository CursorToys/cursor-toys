import * as fs from 'fs';
import { logDebug, logWarn } from './logger';

const STREAM_THRESHOLD_BYTES = 8 * 1024 * 1024;
const CHUNK_SIZE = 4 * 1024 * 1024;
const SCAN_WINDOW = 8192;
const JWT_REGEX = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/;

/**
 * Reads ItemTable string values by scanning SQLite file bytes (no native/sql.js).
 */
export function readItemTableValue(dbPath: string, key: string): string | null {
  const paths = [dbPath, `${dbPath}-wal`];
  for (const filePath of paths) {
    const value = readValueFromFile(filePath, key);
    if (value) {
      if (filePath.endsWith('-wal')) {
        logDebug('Resolved key from state.vscdb-wal');
      }
      return value;
    }
  }
  return null;
}

function readValueFromFile(filePath: string, key: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) {
      return null;
    }
    if (stat.size > STREAM_THRESHOLD_BYTES) {
      return streamScanForKey(filePath, stat.size, key);
    }
    return scanBufferForKey(fs.readFileSync(filePath), key);
  } catch {
    logWarn(`Could not read ${filePath}`);
    return null;
  }
}

function streamScanForKey(filePath: string, fileSize: number, key: string): string | null {
  const keyBuf = Buffer.from(key, 'utf8');
  const overlap = keyBuf.length + SCAN_WINDOW;
  const fd = fs.openSync(filePath, 'r');
  let leftover = Buffer.alloc(0);
  let offset = 0;

  try {
    while (offset < fileSize) {
      const toRead = Math.min(CHUNK_SIZE, fileSize - offset);
      const chunk = Buffer.alloc(toRead);
      fs.readSync(fd, chunk, 0, toRead, offset);
      const combined = Buffer.concat([leftover, chunk]);
      const value = scanBufferForKey(combined, key);
      if (value) {
        return value;
      }
      leftover =
        combined.length > overlap
          ? combined.subarray(combined.length - overlap)
          : combined;
      offset += toRead;
    }
    if (leftover.length > 0) {
      return scanBufferForKey(leftover, key);
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}

function scanBufferForKey(buffer: Buffer, key: string): string | null {
  const keyBuf = Buffer.from(key, 'utf8');
  let idx = 0;
  while (idx < buffer.length) {
    const found = buffer.indexOf(keyBuf, idx);
    if (found === -1) {
      break;
    }
    const value = extractValueNearKey(buffer, found + keyBuf.length, key);
    if (value) {
      return value;
    }
    idx = found + 1;
  }

  if (key.includes('accessToken')) {
    const jwt = buffer.toString('latin1').match(JWT_REGEX);
    if (jwt) {
      return jwt[0];
    }
  }
  return null;
}

function extractValueNearKey(buffer: Buffer, offset: number, key: string): string | null {
  const windowEnd = Math.min(buffer.length, offset + SCAN_WINDOW);
  const slice = buffer.subarray(offset, windowEnd);
  const text = slice.toString('utf8', 0, slice.length);

  if (key.includes('accessToken') || key.includes('refreshToken')) {
    const jwt = text.match(JWT_REGEX);
    if (jwt) {
      return jwt[0];
    }
    const jsonValue =
      extractJsonStringField(text, 'accessToken') ?? extractJsonStringField(text, 'token');
    if (jsonValue && JWT_REGEX.test(jsonValue)) {
      return jsonValue;
    }
    const latin = slice.toString('latin1');
    const jwtLatin = latin.match(JWT_REGEX);
    if (jwtLatin) {
      return jwtLatin[0];
    }
  }

  if (key.includes('Email') || key.includes('email')) {
    const email = text.match(EMAIL_REGEX);
    if (email) {
      return email[0];
    }
  }

  return null;
}

function extractJsonStringField(text: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`);
  const match = text.match(re);
  return match?.[1] ?? null;
}
