import type { AssertionOperator } from './assertionTypes';

/** All supported @assert operators (for editor autocomplete). */
export const ASSERT_OPERATORS: AssertionOperator[] = [
  'equals',
  'notEquals',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'matches',
  'notMatches',
  'isNull',
  'isNotNull',
  'isEmpty',
  'isNotEmpty',
  'isDefined',
  'isUndefined',
  'isTruthy',
  'isFalsy',
  'isNumber',
  'isString',
  'isBoolean',
  'isArray',
  'isJson',
  'in',
  'notIn',
  'between',
  'length',
];

/** Common assertion expressions (autocomplete hints). */
export const ASSERT_EXPRESSIONS: string[] = [
  'res.status',
  'res.statusText',
  'res.headers',
  'res.headers.content-type',
  'res.body',
  'res.body.id',
  'res.body.name',
  'res.body.error',
  'res.body.message',
  'res.body.data',
  'res.body.length',
  'res.body.items',
];

/** Operators that typically need no expected value. */
export const ASSERT_OPERATORS_NO_VALUE = new Set<string>([
  'isNull',
  'isNotNull',
  'isEmpty',
  'isNotEmpty',
  'isDefined',
  'isUndefined',
  'isTruthy',
  'isFalsy',
  'isNumber',
  'isString',
  'isBoolean',
  'isArray',
  'isJson',
]);
