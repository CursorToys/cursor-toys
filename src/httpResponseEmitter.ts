import * as vscode from 'vscode';
import type { HttpResponseEvent } from './httpResponseTypes';

/**
 * Broadcasts HTTP response payloads to inline editor subscribers.
 */
export class HttpResponseEmitter {
  private static instance: HttpResponseEmitter | undefined;

  static getInstance(): HttpResponseEmitter {
    if (!HttpResponseEmitter.instance) {
      HttpResponseEmitter.instance = new HttpResponseEmitter();
    }
    return HttpResponseEmitter.instance;
  }

  private readonly _onDidEmit = new vscode.EventEmitter<HttpResponseEvent>();
  readonly onDidEmit = this._onDidEmit.event;

  fire(event: HttpResponseEvent): void {
    this._onDidEmit.fire(event);
  }
}
