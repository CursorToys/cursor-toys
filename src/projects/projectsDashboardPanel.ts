import * as vscode from 'vscode';
import { buildProjectsDashboardHtml, buildProjectsDashboardState } from './projectsDashboardHtml';
import { ProjectRegistry } from './projectRegistry';
import { openProjectEntry } from './projectsCommands';
import { trackProjectsEvent } from './projectsTelemetry';

const PANEL_VIEW_TYPE = 'cursorToysProjectsDashboard';

interface DashboardInboundMessage {
  type: 'open' | 'pin' | 'unpin' | 'refresh';
  id?: string;
}

export class ProjectsDashboardPanel {
  private static currentPanel: ProjectsDashboardPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly registry: ProjectRegistry
  ) {
    this.panel.webview.options = { enableScripts: true };
    this.pushState();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: DashboardInboundMessage) => void this.handleMessage(message),
      null,
      this.disposables
    );
    this.disposables.push(
      registry.onDidChange(() => this.pushState())
    );
  }

  static async createOrShow(): Promise<void> {
    const registry = ProjectRegistry.getInstance();
    await registry.initialize();

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ProjectsDashboardPanel.currentPanel) {
      ProjectsDashboardPanel.currentPanel.panel.reveal(column);
      ProjectsDashboardPanel.currentPanel.pushState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      'Projects Dashboard',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ProjectsDashboardPanel.currentPanel = new ProjectsDashboardPanel(panel, registry);
    trackProjectsEvent('projects_dashboard_open');
  }

  private pushState(): void {
    const state = buildProjectsDashboardState(
      this.registry.getPinned(),
      this.registry.getRecent()
    );
    this.panel.webview.html = buildProjectsDashboardHtml(state);
    this.panel.webview.postMessage({
      type: 'state',
      projects: state.projects,
    });
  }

  private async handleMessage(message: DashboardInboundMessage): Promise<void> {
    switch (message.type) {
      case 'refresh':
        this.pushState();
        break;
      case 'open': {
        if (!message.id) {
          return;
        }
        const entry = this.registry.findById(message.id);
        if (entry) {
          await openProjectEntry(entry);
        }
        break;
      }
      case 'pin': {
        if (!message.id) {
          return;
        }
        const entry = this.registry.findById(message.id);
        if (entry) {
          await vscode.commands.executeCommand('cursor-toys.projects.pinEntry', entry);
        }
        break;
      }
      case 'unpin': {
        if (!message.id) {
          return;
        }
        await this.registry.unpinProject(message.id);
        break;
      }
      default:
        break;
    }
  }

  private dispose(): void {
    ProjectsDashboardPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }
}
