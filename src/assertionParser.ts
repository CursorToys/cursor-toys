import { Assertion, AssertionOperator } from './assertionTypes';

/**
 * Extracts assertions from HTTP request file content.
 * Looks for comment blocks containing @assert() annotations.
 * @param content The file content
 * @returns Array of assertions
 */
export function extractAssertions(content: string): Assertion[] {
  const assertions: Assertion[] = [];
  
  // Find all /* ... */ blocks
  const blockRegex = /\/\*[\s\S]*?\*\//g;
  let match: RegExpExecArray | null;
  
  while ((match = blockRegex.exec(content)) !== null) {
    const blockContent = match[0];
    const blockStartIndex = match.index;
    
    // Parse assertions from this block
    const blockAssertions = parseAssertionBlock(blockContent, blockStartIndex, content);
    assertions.push(...blockAssertions);
  }
  
  return assertions;
}

/**
 * Parses assertions from a single comment block.
 * @param blockContent The comment block content
 * @param blockStartIndex Starting index of the block in original content
 * @param fullContent Full file content (for line number calculation)
 * @returns Array of assertions found in the block
 */
function parseAssertionBlock(
  blockContent: string,
  blockStartIndex: number,
  fullContent: string
): Assertion[] {
  const assertions: Assertion[] = [];
  const lines = blockContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip lines that don't contain @assert
    if (!line.includes('@assert')) {
      continue;
    }
    
    // Remove leading * if present
    const cleanLine = line.replace(/^\*\s*/, '');
    
    // Try to parse the assertion
    const assertion = parseAssertionLine(cleanLine);
    if (assertion) {
      // Calculate line number in original file
      const lineNumber = calculateLineNumber(fullContent, blockStartIndex + blockContent.indexOf(lines[i]));
      assertion.line = lineNumber;
      assertion.raw = cleanLine;
      assertions.push(assertion);
    }
  }
  
  return assertions;
}

/**
 * Parses a single @assert() line
 * Supports multiple formats:
 * - @assert("description", "expression", "operator", value) - 4 params with description
 * - @assert("expression", "operator", value) - 3 params
 * - @assert("expression", "operator") - 2 params (no value)
 * @param line The line to parse
 * @returns Parsed assertion or null if invalid
 */
function parseAssertionLine(line: string): Assertion | null {
  // Try 4-parameter format first: @assert("description", "expression", "operator", value)
  // Use non-greedy matching for quoted strings to support quotes inside values
  const assertRegex4Params = /@assert\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*(.+?)\s*\)\s*$/;
  const match4 = line.match(assertRegex4Params);
  
  if (match4) {
    const description = match4[1].trim();
    const expression = match4[2].trim();
    const operator = match4[3].trim() as AssertionOperator;
    const expectedRaw = match4[4].trim();
    const expected = parseExpectedValue(expectedRaw);
    
    return {
      description,
      expression,
      operator,
      expected,
    };
  }
  
  // Try 3-parameter format: @assert("expression", "operator", value)
  // IMPORTANT: Test this BEFORE the 3-param with description to avoid false matches
  // Use non-greedy matching for the value part
  const assertRegexWithValue = /@assert\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*(.+?)\s*\)\s*$/;
  const matchWithValue = line.match(assertRegexWithValue);
  
  if (matchWithValue) {
    const expression = matchWithValue[1].trim();
    const operator = matchWithValue[2].trim() as AssertionOperator;
    const expectedRaw = matchWithValue[3].trim();
    const expected = parseExpectedValue(expectedRaw);
    
    return {
      expression,
      operator,
      expected,
    };
  }
  
  // Try 3-parameter format with description: @assert("description", "expression", "operator")
  // This will only match if the third param is NOT followed by a comma
  const assertRegex3ParamsDesc = /@assert\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)\s*$/;
  const match3Desc = line.match(assertRegex3ParamsDesc);
  
  if (match3Desc) {
    const description = match3Desc[1].trim();
    const expression = match3Desc[2].trim();
    const operator = match3Desc[3].trim() as AssertionOperator;
    
    return {
      description,
      expression,
      operator,
      expected: null,
    };
  }
  
  // Try 2-parameter format: @assert("expression", "operator")
  const assertRegexNoValue = /@assert\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)\s*$/;
  const matchNoValue = line.match(assertRegexNoValue);
  
  if (matchNoValue) {
    const expression = matchNoValue[1].trim();
    const operator = matchNoValue[2].trim() as AssertionOperator;
    
    return {
      expression,
      operator,
      expected: null,
    };
  }
  
  return null;
}

/**
 * Parses the expected value from assertion
 * Supports: numbers (200), booleans (true/false), strings ("text"), null, regex (/pattern/), arrays ([1,2,3])
 * @param value Raw value string
 * @returns Parsed value
 */
function parseExpectedValue(value: string): string | number | boolean | null | RegExp | any[] {
  const trimmed = value.trim();
  
  // null
  if (trimmed === 'null') {
    return null;
  }
  
  // boolean
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  
  // array: [1, 2, 3] or ["a", "b"]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      // Use JSON.parse to handle arrays properly
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Invalid array format, continue to fallback
    }
  }
  
  // number (integer or float)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  
  // regex: /pattern/ or /pattern/flags
  const regexMatch = trimmed.match(/^\/(.+)\/([gimsuvy]*)$/);
  if (regexMatch) {
    try {
      return new RegExp(regexMatch[1], regexMatch[2]);
    } catch {
      // Invalid regex, treat as string
    }
  }
  
  // string: "text" or 'text' - remove quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  
  // fallback: treat as string
  return trimmed;
}

/**
 * Calculates the line number (1-based) for a given position in the content
 * @param content Full content
 * @param position Character position
 * @returns Line number (1-based)
 */
function calculateLineNumber(content: string, position: number): number {
  const upToPosition = content.substring(0, position);
  const lines = upToPosition.split('\n');
  return lines.length;
}

/**
 * Validates assertion syntax (for error reporting)
 * @param content File content
 * @returns Array of syntax errors with line numbers
 */
export function validateAssertionSyntax(content: string): Array<{ line: number; error: string }> {
  const errors: Array<{ line: number; error: string }> = [];
  
  const blockRegex = /\/\*[\s\S]*?\*\//g;
  let match: RegExpExecArray | null;
  
  while ((match = blockRegex.exec(content)) !== null) {
    const blockContent = match[0];
    const blockStartIndex = match.index;
    const lines = blockContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line.includes('@assert')) {
        continue;
      }
      
      const cleanLine = line.replace(/^\*\s*/, '');
      const assertion = parseAssertionLine(cleanLine);
      
      if (!assertion && cleanLine.includes('@assert')) {
        const lineNumber = calculateLineNumber(content, blockStartIndex + blockContent.indexOf(lines[i]));
        errors.push({
          line: lineNumber,
          error: `Invalid @assert syntax: ${cleanLine}`,
        });
      }
    }
  }
  
  return errors;
}

/**
 * Removes assertion comment blocks from content
 * @param content The file content
 * @returns Content with assertion blocks removed
 */
export function removeAssertionBlocks(content: string): string {
  // Remove all /* ... */ blocks that contain @assert
  const blockRegex = /\/\*[\s\S]*?@assert[\s\S]*?\*\//g;
  return content.replace(blockRegex, '').trim();
}
