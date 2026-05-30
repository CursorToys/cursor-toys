/** Autocomplete entries for {{@helper(...)}} placeholders in the request editor. */
export interface HttpVariableHelperSuggestion {
  insert: string;
  label: string;
  description: string;
  kind: 'helper';
}

export const HTTP_VARIABLE_HELPERS: HttpVariableHelperSuggestion[] = [
  { insert: '{{@uuid()}}', label: '@uuid()', description: 'Random UUID v4', kind: 'helper' },
  { insert: '{{@datetime}}', label: '@datetime', description: 'Current ISO date/time', kind: 'helper' },
  { insert: '{{@datetime("date")}}', label: '@datetime("date")', description: 'Current date (YYYY-MM-DD)', kind: 'helper' },
  { insert: '{{@prompt("Label")}}', label: '@prompt("Label")', description: 'Prompt user at run time', kind: 'helper' },
  { insert: '{{@randomIn(1, 10)}}', label: '@randomIn(min, max)', description: 'Random integer in range', kind: 'helper' },
  { insert: '{{@randomString(8)}}', label: '@randomString(n)', description: 'Random alphanumeric string', kind: 'helper' },
  { insert: '{{@randomFrom("a", "b")}}', label: '@randomFrom(...)', description: 'Pick random argument', kind: 'helper' },
  { insert: '{{@userAgent()}}', label: '@userAgent()', description: 'Random user agent', kind: 'helper' },
  { insert: '{{@ip()}}', label: '@ip()', description: 'Random IP address', kind: 'helper' },
  { insert: '{{@lorem(5)}}', label: '@lorem(n)', description: 'Lorem ipsum words', kind: 'helper' },
];
