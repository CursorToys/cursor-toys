/**
 * Types and interfaces for HTTP request assertions
 */

/**
 * Supported assertion operators
 */
export type AssertionOperator =
  // Comparison
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  // String
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'notMatches'
  // Type checks
  | 'isNull'
  | 'isNotNull'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isDefined'
  | 'isUndefined'
  // Value checks
  | 'isTruthy'
  | 'isFalsy'
  | 'isNumber'
  | 'isString'
  | 'isBoolean'
  | 'isArray'
  | 'isJson'
  // Other
  | 'in'
  | 'notIn'
  | 'between'
  | 'length';

/**
 * Assertion definition extracted from @assert() annotation
 */
export interface Assertion {
  description?: string;  // Optional description of what is being tested
  expression: string;  // e.g., "res.status", "res.body.userId"
  operator: AssertionOperator;
  expected: string | number | boolean | null | RegExp | any[];
  line?: number;  // Original line number in the file
  raw?: string;   // Raw assertion text for debugging
}

/**
 * Result of assertion validation
 */
export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actualValue?: any;
  error?: string;
}

/**
 * HTTP response data structure for assertion evaluation
 */
export interface ResponseData {
  status: number;
  headers: Record<string, string>;
  body: any;  // Parsed JSON or raw string
}
