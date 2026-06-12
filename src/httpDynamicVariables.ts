import * as crypto from 'crypto';

export type DynamicVariableContext = {
  dotenvVariables?: Map<string, string>;
};

const DYNAMIC_VAR_RE = /\{\{\s*\$(\w+)(?:\s+([^}]*))?\s*\}\}/g;

type OffsetUnit = 'y' | 'M' | 'd' | 'h' | 'm' | 's';

const OFFSET_UNIT_MS: Record<OffsetUnit, number> = {
  y: 365 * 24 * 60 * 60 * 1000,
  M: 30 * 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
};

/**
 * Parses optional REST Client-style offset: `-1 d`, `+2 h`, etc.
 */
export function parseOffset(args: string[]): number {
  if (args.length < 2) {
    return 0;
  }
  const amount = parseInt(args[args.length - 2], 10);
  const unit = args[args.length - 1] as OffsetUnit;
  if (Number.isNaN(amount) || !(unit in OFFSET_UNIT_MS)) {
    return 0;
  }
  return amount * OFFSET_UNIT_MS[unit];
}

function formatRfc1123(date: Date): string {
  return date.toUTCString();
}

function formatIso8601(date: Date): string {
  return date.toISOString();
}

function formatLocalRfc1123(date: Date): string {
  return date.toString();
}

function formatLocalIso8601(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ms = pad(date.getMilliseconds()).padStart(3, '0');
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  const tzStr = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${ms}${tzStr}`
  );
}

function maybeEncode(value: string, encode: boolean): string {
  return encode ? encodeURIComponent(value) : value;
}

/**
 * Evaluates a single `$` dynamic variable expression body (without braces).
 */
export function evaluateDynamicVariable(
  name: string,
  argString: string | undefined,
  ctx: DynamicVariableContext = {}
): string {
  const args = (argString ?? '').trim().split(/\s+/).filter(Boolean);

  switch (name) {
    case 'guid':
      return crypto.randomUUID();

    case 'randomInt': {
      const min = parseInt(args[0] ?? '0', 10);
      const max = parseInt(args[1] ?? '100', 10);
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    }

    case 'timestamp': {
      const offset = parseOffset(args);
      return String(Date.now() + offset);
    }

    case 'datetime': {
      const format = (args[0] ?? 'iso8601').toLowerCase();
      const offsetArgs = format === 'rfc1123' || format === 'iso8601' ? args.slice(1) : args;
      const offset = parseOffset(offsetArgs);
      const date = new Date(Date.now() + offset);
      if (format === 'rfc1123') {
        return formatRfc1123(date);
      }
      return formatIso8601(date);
    }

    case 'localDatetime': {
      const format = (args[0] ?? 'iso8601').toLowerCase();
      const offsetArgs = format === 'rfc1123' || format === 'iso8601' ? args.slice(1) : args;
      const offset = parseOffset(offsetArgs);
      const date = new Date(Date.now() + offset);
      if (format === 'rfc1123') {
        return formatLocalRfc1123(date);
      }
      return formatLocalIso8601(date);
    }

    case 'processEnv': {
      const raw = args[0] ?? '';
      const encode = raw.startsWith('%');
      const key = encode ? raw.slice(1) : raw;
      const value = process.env[key] ?? '';
      return maybeEncode(value, encode);
    }

    case 'dotenv': {
      const raw = args[0] ?? '';
      const encode = raw.startsWith('%');
      const key = encode ? raw.slice(1) : raw;
      const lower = key.toLowerCase();
      let value = '';
      if (ctx.dotenvVariables) {
        value = ctx.dotenvVariables.get(lower) ?? ctx.dotenvVariables.get(key) ?? '';
      }
      return maybeEncode(value, encode);
    }

    default:
      return '';
  }
}

/**
 * Replaces all `{{$...}}` expressions in content.
 */
export function replaceDynamicVariables(
  content: string,
  ctx: DynamicVariableContext = {}
): string {
  return content.replace(DYNAMIC_VAR_RE, (_match, name: string, argString: string | undefined) => {
    const value = evaluateDynamicVariable(name, argString, ctx);
    return value !== '' ? value : _match;
  });
}

/** Known system dynamic variable names for completion. */
export const SYSTEM_DYNAMIC_VARIABLES: Array<{ name: string; insert: string; detail: string }> = [
  { name: '$guid', insert: '$guid', detail: 'Random UUID' },
  { name: '$randomInt', insert: '$randomInt 1 100', detail: 'Random integer in range' },
  { name: '$timestamp', insert: '$timestamp', detail: 'Unix timestamp (ms)' },
  { name: '$datetime', insert: '$datetime iso8601', detail: 'UTC datetime (rfc1123|iso8601)' },
  { name: '$localDatetime', insert: '$localDatetime iso8601', detail: 'Local datetime' },
  { name: '$processEnv', insert: '$processEnv VAR_NAME', detail: 'OS environment variable' },
  { name: '$dotenv', insert: '$dotenv VAR_NAME', detail: 'Active .env variable' },
];
