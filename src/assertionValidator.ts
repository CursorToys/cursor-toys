import { Assertion, AssertionResult, ResponseData } from './assertionTypes';
import { HttpRequestResult } from './httpRequestExecutor';

/**
 * Validates assertions against HTTP response
 * @param assertions Array of assertions to validate
 * @param response HTTP response result
 * @returns Array of assertion results
 */
export function validateAssertions(
  assertions: Assertion[],
  response: HttpRequestResult
): AssertionResult[] {
  const results: AssertionResult[] = [];
  
  // Build response data structure
  const responseData: ResponseData = {
    status: response.statusCode,
    headers: response.headers,
    body: parseResponseBody(response.body),
  };
  
  for (const assertion of assertions) {
    try {
      const result = evaluateAssertion(assertion, responseData);
      results.push(result);
    } catch (error) {
      results.push({
        assertion,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return results;
}

/**
 * Parses response body to JSON if possible, otherwise returns raw string
 * @param body Response body string
 * @returns Parsed JSON object or raw string
 */
function parseResponseBody(body: string): any {
  if (!body || body.trim() === '') {
    return null;
  }
  
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/**
 * Evaluates a single assertion
 * @param assertion The assertion to evaluate
 * @param responseData Response data
 * @returns Assertion result
 */
function evaluateAssertion(
  assertion: Assertion,
  responseData: ResponseData
): AssertionResult {
  // Resolve the expression to get actual value
  const actualValue = resolveExpression(assertion.expression, responseData);
  
  // Evaluate based on operator
  const passed = evaluateOperator(
    assertion.operator,
    actualValue,
    assertion.expected
  );
  
  return {
    assertion,
    passed,
    actualValue,
  };
}

/**
 * Resolves an expression like "res.status" or "res.body.userId" to its actual value
 * @param expression Expression to resolve
 * @param responseData Response data
 * @returns Resolved value
 */
function resolveExpression(expression: string, responseData: ResponseData): any {
  // Split expression by dots, but handle bracket notation too
  // e.g., "res.body.users[0].name" -> ["res", "body", "users[0]", "name"]
  const parts = expression.split('.');
  
  let current: any = { res: responseData };
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Handle array indexing: "users[0]" -> access users then [0]
    const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const propName = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[propName];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Evaluates operator against actual and expected values
 * @param operator Assertion operator
 * @param actual Actual value from response
 * @param expected Expected value
 * @returns true if assertion passes, false otherwise
 */
function evaluateOperator(
  operator: string,
  actual: any,
  expected: any
): boolean {
  switch (operator) {
    // Comparison
    case 'equals':
      return actual === expected;
    
    case 'notEquals':
      return actual !== expected;
    
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    
    // String operations
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    
    case 'notContains':
      return typeof actual === 'string' && typeof expected === 'string' && !actual.includes(expected);
    
    case 'startsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    
    case 'endsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    
    case 'matches':
      if (expected instanceof RegExp) {
        return typeof actual === 'string' && expected.test(actual);
      }
      return false;
    
    case 'notMatches':
      if (expected instanceof RegExp) {
        return typeof actual === 'string' && !expected.test(actual);
      }
      return false;
    
    // Type checks
    case 'isNull':
      return actual === null;
    
    case 'isNotNull':
      return actual !== null;
    
    case 'isEmpty':
      if (typeof actual === 'string') return actual === '';
      if (Array.isArray(actual)) return actual.length === 0;
      if (typeof actual === 'object' && actual !== null) return Object.keys(actual).length === 0;
      return false;
    
    case 'isNotEmpty':
      if (typeof actual === 'string') return actual !== '';
      if (Array.isArray(actual)) return actual.length > 0;
      if (typeof actual === 'object' && actual !== null) return Object.keys(actual).length > 0;
      return false;
    
    case 'isDefined':
      return actual !== undefined && actual !== null;
    
    case 'isUndefined':
      return actual === undefined || actual === null;
    
    // Value checks
    case 'isTruthy':
      return !!actual;
    
    case 'isFalsy':
      return !actual;
    
    case 'isNumber':
      return typeof actual === 'number' && !isNaN(actual);
    
    case 'isString':
      return typeof actual === 'string';
    
    case 'isBoolean':
      return typeof actual === 'boolean';
    
    case 'isArray':
      return Array.isArray(actual);
    
    case 'isJson':
      if (typeof actual === 'string') {
        try {
          JSON.parse(actual);
          return true;
        } catch {
          return false;
        }
      }
      return typeof actual === 'object' && actual !== null;
    
    // Other operations
    case 'in':
      if (Array.isArray(expected)) {
        return expected.includes(actual);
      }
      return false;
    
    case 'notIn':
      if (Array.isArray(expected)) {
        return !expected.includes(actual);
      }
      return false;
    
    case 'between':
      // Expected should be array with [min, max]
      if (Array.isArray(expected) && expected.length === 2 && typeof actual === 'number') {
        const [min, max] = expected;
        return actual >= min && actual <= max;
      }
      return false;
    
    case 'length':
      if (typeof actual === 'string' || Array.isArray(actual)) {
        return actual.length === expected;
      }
      return false;
    
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Formats assertion results as text for display in .res files
 * @param results Assertion results
 * @returns Formatted text
 */
export function formatAssertionResults(results: AssertionResult[]): string {
  if (results.length === 0) {
    return '';
  }
  
  let output = '\n=== ASSERTIONS ===\n';
  
  for (const result of results) {
    const symbol = result.passed ? '✓' : '✗';
    const { expression, operator, expected } = result.assertion;
    
    let line = `${symbol} ${expression} ${operator}`;
    
    // Add expected value if operator needs it
    if (!['isDefined', 'isUndefined', 'isNull', 'isNotNull', 'isEmpty', 'isNotEmpty', 
          'isTruthy', 'isFalsy', 'isNumber', 'isString', 'isBoolean', 'isArray', 'isJson'].includes(operator)) {
      line += ` ${formatValue(expected)}`;
    }
    
    // Add error or actual value if failed
    if (!result.passed) {
      if (result.error) {
        line += ` (Error: ${result.error})`;
      } else if (result.actualValue !== undefined) {
        line += ` (actual: ${formatValue(result.actualValue)})`;
      }
    }
    
    output += line + '\n';
  }
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  output += `\n${passed}/${total} assertions passed`;
  
  return output;
}

/**
 * Formats a value for display
 * @param value Value to format
 * @returns Formatted string
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof RegExp) return value.toString();
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
