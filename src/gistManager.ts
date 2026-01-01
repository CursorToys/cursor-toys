import * as vscode from 'vscode';
import * as https from 'https';

/**
 * Interface para resposta da API do GitHub Gist
 */
export interface GistFile {
  filename: string;
  type: string;
  language: string;
  raw_url: string;
  size: number;
  content?: string;
}

export interface GistResponse {
  id: string;
  url: string;
  html_url: string;
  public: boolean;
  description: string;
  files: { [key: string]: GistFile };
  created_at: string;
  updated_at: string;
}

/**
 * Interface para metadata do CursorToys em Gists
 */
export interface CursorToysMetadata {
  cursortoys: {
    version: string;
    type: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'bundle';
    bundleType?: 'command_bundle' | 'rule_bundle' | 'prompt_bundle' | 'notepad_bundle' | 'http_bundle' | 'project_bundle';
    created: string;
    fileCount: number;
    files: Array<{
      name: string;
      type: string;
      size: number;
    }>;
  };
}

/**
 * Gerenciador de integração com GitHub Gist
 */
export class GistManager {
  private static instance: GistManager;
  private context: vscode.ExtensionContext;
  private readonly GITHUB_API_BASE = 'https://api.github.com';
  private readonly TOKEN_KEY = 'cursorToys.githubToken';
  private readonly MAX_GIST_SIZE = 100 * 1024 * 1024; // 100MB

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Obtém a instância singleton do GistManager
   */
  public static getInstance(context?: vscode.ExtensionContext): GistManager {
    if (!GistManager.instance && context) {
      GistManager.instance = new GistManager(context);
    }
    return GistManager.instance;
  }

  /**
   * Obtém o token do GitHub armazenado
   */
  public async getGitHubToken(): Promise<string | null> {
    try {
      const token = await this.context.secrets.get(this.TOKEN_KEY);
      return token || null;
    } catch (error) {
      console.error('Error retrieving GitHub token:', error);
      return null;
    }
  }

  /**
   * Armazena o token do GitHub de forma segura
   */
  public async setGitHubToken(token: string): Promise<void> {
    try {
      await this.context.secrets.store(this.TOKEN_KEY, token);
    } catch (error) {
      console.error('Error storing GitHub token:', error);
      throw new Error('Failed to store GitHub token');
    }
  }

  /**
   * Remove o token do GitHub armazenado
   */
  public async removeGitHubToken(): Promise<void> {
    try {
      await this.context.secrets.delete(this.TOKEN_KEY);
    } catch (error) {
      console.error('Error removing GitHub token:', error);
      throw new Error('Failed to remove GitHub token');
    }
  }

  /**
   * Solicita ao usuário o token do GitHub
   */
  public async promptForToken(): Promise<string | null> {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your GitHub Personal Access Token',
      password: true,
      placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Token cannot be empty';
        }
        if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
          return 'Invalid token format. GitHub tokens start with "ghp_" or "github_pat_"';
        }
        return null;
      }
    });

    if (!token) {
      return null;
    }

    // Validar token fazendo uma chamada simples à API
    const isValid = await this.validateToken(token);
    if (!isValid) {
      vscode.window.showErrorMessage('Invalid GitHub token. Please check and try again.');
      return null;
    }

    // Salvar token
    await this.setGitHubToken(token);
    vscode.window.showInformationMessage('GitHub token configured successfully!');
    
    return token;
  }

  /**
   * Garante que o token está configurado, solicitando se necessário
   */
  public async ensureTokenConfigured(): Promise<boolean> {
    let token = await this.getGitHubToken();
    
    if (!token) {
      const shouldConfigure = await vscode.window.showInformationMessage(
        'GitHub token not configured. Would you like to configure it now?',
        'Yes',
        'No'
      );

      if (shouldConfigure !== 'Yes') {
        return false;
      }

      token = await this.promptForToken();
      if (!token) {
        return false;
      }
    }

    return true;
  }

  /**
   * Valida um token fazendo uma chamada à API do GitHub
   */
  public async validateToken(token: string): Promise<boolean> {
    try {
      const response = await this.makeHttpsRequest(
        'GET',
        '/user',
        null,
        { Authorization: `token ${token}` }
      );
      return response.statusCode === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cria um Gist no GitHub
   */
  public async createGist(
    files: { [filename: string]: { content: string } },
    description: string,
    isPublic: boolean
  ): Promise<string> {
    const token = await this.getGitHubToken();
    if (!token) {
      throw new Error('GitHub token not configured');
    }

    // Validar tamanho total
    const totalSize = Object.values(files).reduce(
      (sum, file) => sum + file.content.length,
      0
    );

    if (totalSize > this.MAX_GIST_SIZE) {
      throw new Error(
        `Total size (${(totalSize / 1024 / 1024).toFixed(2)} MB) exceeds GitHub limit of 100 MB`
      );
    }

    const payload = {
      description,
      public: isPublic,
      files
    };

    try {
      const response = await this.makeHttpsRequest(
        'POST',
        '/gists',
        payload,
        { Authorization: `token ${token}` }
      );

      if (response.statusCode === 201 && response.body) {
        const gist: GistResponse = JSON.parse(response.body);
        return gist.html_url;
      } else if (response.statusCode === 401) {
        throw new Error('Invalid or expired GitHub token. Please reconfigure.');
      } else if (response.statusCode === 403) {
        throw new Error('GitHub API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Failed to create gist: ${response.statusCode} ${response.body}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to create gist: ${error}`);
    }
  }

  /**
   * Busca um Gist pelo ID ou URL
   */
  public async fetchGist(gistIdOrUrl: string): Promise<GistResponse> {
    const gistId = this.parseGistUrl(gistIdOrUrl);
    if (!gistId) {
      throw new Error('Invalid Gist URL or ID');
    }

    try {
      const response = await this.makeHttpsRequest(
        'GET',
        `/gists/${gistId}`,
        null,
        {} // Não precisa de token para gists públicos
      );

      if (response.statusCode === 200 && response.body) {
        return JSON.parse(response.body);
      } else if (response.statusCode === 404) {
        throw new Error('Gist not found. Please check the URL or ID.');
      } else {
        throw new Error(`Failed to fetch gist: ${response.statusCode}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to fetch gist: ${error}`);
    }
  }

  /**
   * Extrai o ID do Gist de uma URL ou retorna o próprio ID
   */
  public parseGistUrl(input: string): string | null {
    const trimmed = input.trim();

    // Se já é um ID (apenas caracteres alfanuméricos)
    if (/^[a-f0-9]+$/i.test(trimmed)) {
      return trimmed;
    }

    // URL completa: https://gist.github.com/username/abc123...
    const urlMatch = trimmed.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
    if (urlMatch) {
      return urlMatch[1];
    }

    // URL raw: https://gist.githubusercontent.com/username/abc123/raw/...
    const rawMatch = trimmed.match(/gist\.githubusercontent\.com\/[^/]+\/([a-f0-9]+)/i);
    if (rawMatch) {
      return rawMatch[1];
    }

    return null;
  }

  /**
   * Valida se um Gist tem formato CursorToys
   */
  public validateGistFormat(gist: GistResponse): boolean {
    // Verificar se tem arquivo de metadata
    const metadataFile = gist.files['.cursortoys-metadata.json'];
    if (metadataFile && metadataFile.content) {
      try {
        const metadata: CursorToysMetadata = JSON.parse(metadataFile.content);
        return !!metadata.cursortoys;
      } catch {
        return false;
      }
    }

    // Fallback: aceitar gists sem metadata se tiverem arquivos com extensões válidas
    const fileNames = Object.keys(gist.files);
    return fileNames.some(name => 
      name.endsWith('.md') || 
      name.endsWith('.mdc') || 
      name.endsWith('.req') || 
      name.endsWith('.request') ||
      name.startsWith('.env')
    );
  }

  /**
   * Extrai metadata de um Gist (se existir)
   */
  public extractMetadata(gist: GistResponse): CursorToysMetadata | null {
    const metadataFile = gist.files['.cursortoys-metadata.json'];
    if (metadataFile && metadataFile.content) {
      try {
        return JSON.parse(metadataFile.content);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Constrói a descrição do Gist com metadata
   */
  public buildGistDescription(
    type: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'bundle',
    fileName: string,
    bundleType?: string
  ): string {
    const date = new Date().toISOString().split('T')[0];
    const typeLabel = type === 'bundle' ? bundleType || 'Bundle' : type.charAt(0).toUpperCase() + type.slice(1);
    return `CursorToys: ${typeLabel} - ${fileName} (${date})`;
  }

  /**
   * Cria metadata para um Gist
   */
  public buildMetadata(
    type: 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'bundle',
    files: Array<{ name: string; type: string; size: number }>,
    bundleType?: string
  ): CursorToysMetadata {
    return {
      cursortoys: {
        version: '1.2.0',
        type,
        bundleType: bundleType as any,
        created: new Date().toISOString(),
        fileCount: files.length,
        files
      }
    };
  }

  /**
   * Obtém a visibilidade padrão configurada
   */
  public async getDefaultVisibility(): Promise<'public' | 'private' | 'ask'> {
    const config = vscode.workspace.getConfiguration('cursorToys');
    return config.get<'public' | 'private' | 'ask'>('gistDefaultVisibility', 'ask');
  }

  /**
   * Pergunta ao usuário sobre a visibilidade do Gist
   */
  public async promptForVisibility(): Promise<boolean | null> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Public', description: 'Anyone can see this gist', value: true },
        { label: 'Private', description: 'Only you can see this gist', value: false }
      ],
      {
        placeHolder: 'Choose gist visibility'
      }
    );

    return choice ? choice.value : null;
  }

  /**
   * Determina a visibilidade do Gist baseado na configuração
   */
  public async determineVisibility(): Promise<boolean | null> {
    const defaultVisibility = await this.getDefaultVisibility();

    if (defaultVisibility === 'ask') {
      return await this.promptForVisibility();
    }

    return defaultVisibility === 'public';
  }

  /**
   * Faz uma requisição HTTPS para a API do GitHub
   */
  private makeHttpsRequest(
    method: 'GET' | 'POST',
    path: string,
    data: any = null,
    customHeaders: { [key: string]: string } = {}
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const postData = data ? JSON.stringify(data) : null;

      const options: https.RequestOptions = {
        hostname: 'api.github.com',
        port: 443,
        path,
        method,
        headers: {
          'User-Agent': 'CursorToys-VSCode-Extension',
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...customHeaders
        }
      };

      if (postData) {
        options.headers!['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }
}

