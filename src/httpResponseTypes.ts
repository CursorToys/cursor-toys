import type { AssertionResult } from './assertionTypes';

/** Shared HTTP response payload for panel and inline editor UI. */
export interface HttpResponsePayload {
  requestLabel: string;
  statusCode: number;
  statusText: string;
  executionTimeSeconds: string;
  envName?: string;
  headers: Record<string, string>;
  body: string;
  requestPayload?: string;
  assertionResults?: AssertionResult[];
  rawFormatted: string;
  savePath?: string;
}

export interface HttpResponseEvent {
  requestUri: string;
  blockKey: string;
  startLine?: number;
  payload: HttpResponsePayload;
}
