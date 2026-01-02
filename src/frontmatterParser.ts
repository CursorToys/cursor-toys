/**
 * Frontmatter Parser for CursorToys
 * Parses YAML frontmatter from .md/.mdc files
 */

export interface FrontmatterMetadata {
  description?: string;
  tags?: string[];
  category?: string;
  author?: string;
  version?: string;
  [key: string]: any; // Allow additional fields
}

export interface ParsedContent {
  metadata: FrontmatterMetadata;
  content: string; // Content without frontmatter
  hasFrontmatter: boolean;
}

/**
 * Parses YAML frontmatter from markdown content
 * @param content File content as string
 * @returns Parsed metadata and content
 */
export function parseFrontmatter(content: string): ParsedContent {
  const result: ParsedContent = {
    metadata: {},
    content: content,
    hasFrontmatter: false
  };

  if (!content || typeof content !== 'string') {
    return result;
  }

  // Check if content starts with ---
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('---')) {
    return result;
  }

  // Find the closing ---
  const lines = trimmedContent.split('\n');
  let endIndex = -1;
  
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing delimiter found
    return result;
  }

  // Extract YAML content (between the two ---)
  const yamlLines = lines.slice(1, endIndex);
  const yamlContent = yamlLines.join('\n');

  // Parse YAML manually (simple parser, no external dependencies)
  try {
    const metadata = parseSimpleYAML(yamlContent);
    result.metadata = metadata;
    result.hasFrontmatter = true;
    
    // Extract content after frontmatter
    const contentLines = lines.slice(endIndex + 1);
    result.content = contentLines.join('\n').trim();
  } catch (error) {
    console.error('Error parsing frontmatter:', error);
    // Return original content if parsing fails
    return result;
  }

  return result;
}

/**
 * Simple YAML parser for frontmatter
 * Supports: strings, arrays (- format), simple key-value pairs
 * Does not support: nested objects, complex YAML features
 */
function parseSimpleYAML(yamlContent: string): FrontmatterMetadata {
  const metadata: FrontmatterMetadata = {};
  const lines = yamlContent.split('\n');
  
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (let line of lines) {
    line = line.trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Check if it's an array item
    if (line.startsWith('-')) {
      const value = line.substring(1).trim();
      if (currentKey && value) {
        currentArray.push(value);
      }
      continue;
    }

    // If we were processing an array, save it
    if (currentKey && currentArray.length > 0) {
      metadata[currentKey] = currentArray;
      currentArray = [];
      currentKey = null;
    }

    // Check for key-value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (value) {
        // Has value on same line
        metadata[key] = parseValue(value);
        currentKey = null;
      } else {
        // Might be followed by array or multiline value
        currentKey = key;
        currentArray = [];
      }
    }
  }

  // Save any remaining array
  if (currentKey && currentArray.length > 0) {
    metadata[currentKey] = currentArray;
  }

  return metadata;
}

/**
 * Parse a YAML value (handles strings, numbers, booleans)
 */
function parseValue(value: string): any {
  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.substring(1, value.length - 1);
  }

  // Check for boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Check for number
  const num = Number(value);
  if (!isNaN(num) && value !== '') {
    return num;
  }

  // Return as string
  return value;
}

/**
 * Validates frontmatter metadata for recommendations
 * @param metadata Parsed metadata
 * @returns True if valid for recommendations
 */
export function validateRecommendationMetadata(metadata: FrontmatterMetadata): boolean {
  // At minimum, should have description or tags
  return !!(metadata.description || (metadata.tags && metadata.tags.length > 0));
}

/**
 * Extracts tags from metadata, normalizes them
 * @param metadata Parsed metadata
 * @returns Array of normalized tags
 */
export function extractTags(metadata: FrontmatterMetadata): string[] {
  if (!metadata.tags || !Array.isArray(metadata.tags)) {
    return [];
  }

  return metadata.tags
    .map(tag => tag.toLowerCase().trim())
    .filter(tag => tag.length > 0);
}

/**
 * Creates default metadata from filename
 * @param filename File name without extension
 * @returns Default metadata
 */
export function createDefaultMetadata(filename: string): FrontmatterMetadata {
  return {
    description: `${filename} command/prompt/rule`,
    tags: [],
    category: 'general',
    version: '1.0.0'
  };
}

