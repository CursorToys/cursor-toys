import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getEnvironmentsPath, getHttpPath } from './utils';

/**
 * Environment Manager - Gerencia variáveis de environment através de arquivos .env
 * Singleton pattern para uso global na extensão
 */
export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private activeEnvironment: string = 'dev';
  private environmentsCache: Map<string, Map<string, string>> = new Map();
  private _onDidChangeEnvironment: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public readonly onDidChangeEnvironment: vscode.Event<string> = this._onDidChangeEnvironment.event;
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private workspacePaths: Set<string> = new Set();

  private constructor() {
    // File watchers will be set up when extension activates
  }

  /**
   * Obtém a instância única do EnvironmentManager
   */
  public static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  /**
   * Obtém o environment ativo atual
   */
  public getActiveEnvironment(): string {
    return this.activeEnvironment;
  }

  /**
   * Define o environment ativo
   */
  public setActiveEnvironment(name: string): void {
    this.activeEnvironment = name;
    this._onDidChangeEnvironment.fire(name);
  }

  /**
   * Carrega variáveis de um environment específico
   * @param envName Nome do environment (ex: 'dev', 'prod')
   * @param workspacePath Caminho do workspace
   * @returns Map com as variáveis do environment ou null se não encontrado
   */
  public loadEnvironment(envName: string, workspacePath: string): Map<string, string> | null {
    // Verificar cache primeiro
    const cacheKey = `${workspacePath}:${envName}`;
    if (this.environmentsCache.has(cacheKey)) {
      return this.environmentsCache.get(cacheKey)!;
    }

    const envDir = getEnvironmentsPath(workspacePath);
    
    // Tentar carregar .env.{nome}
    let envFilePath = path.join(envDir, `.env.${envName}`);
    
    if (!fs.existsSync(envFilePath)) {
      // Fallback: tentar .env
      envFilePath = path.join(envDir, '.env');
      
      if (!fs.existsSync(envFilePath)) {
        return null;
      }
    }

    try {
      const content = fs.readFileSync(envFilePath, 'utf8');
      const variables = this.parseEnvFile(content);
      
      // Salvar no cache
      this.environmentsCache.set(cacheKey, variables);
      
      return variables;
    } catch (error) {
      console.error(`Failed to load environment file: ${envFilePath}`, error);
      return null;
    }
  }

  /**
   * Parseia o conteúdo de um arquivo .env
   * @param content Conteúdo do arquivo .env
   * @returns Map com as variáveis parseadas
   */
  private parseEnvFile(content: string): Map<string, string> {
    const variables = new Map<string, string>();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Ignorar linhas vazias e comentários
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Parsear linha no formato KEY=VALUE
      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.substring(0, separatorIndex).trim();
      let value = trimmedLine.substring(separatorIndex + 1).trim();

      // Remover aspas se presentes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }

      if (key) {
        // Armazenar com key em lowercase para matching case-insensitive
        variables.set(key.toLowerCase(), value);
      }
    }

    return variables;
  }

  /**
   * Substitui variáveis no formato {{varName}} no texto
   * @param text Texto com variáveis
   * @param envName Nome do environment
   * @param workspacePath Caminho do workspace
   * @returns Texto com variáveis substituídas
   */
  public replaceVariables(text: string, envName: string, workspacePath: string): string {
    const variables = this.loadEnvironment(envName, workspacePath);
    
    if (!variables) {
      return text;
    }

    let result = text;

    // Substituir todas as ocorrências de {{variableName}}
    // Excluir variáveis com @ ({{@VAR_NAME}}) que são processadas via prompt
    // Usar regex para encontrar todas as variáveis
    const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    
    result = result.replace(variableRegex, (match, varName) => {
      const varNameLower = varName.toLowerCase();
      const value = variables.get(varNameLower);
      
      if (value !== undefined) {
        return value;
      }
      
      // Se não encontrar a variável, manter o placeholder
      return match;
    });

    return result;
  }

  /**
   * Valida se há variáveis não resolvidas no texto
   * @param text Texto para validar
   * @param envName Nome do environment
   * @param workspacePath Caminho do workspace
   * @returns Array com nomes das variáveis não resolvidas
   */
  public validateVariables(text: string, envName: string, workspacePath: string): string[] {
    const variables = this.loadEnvironment(envName, workspacePath);
    
    if (!variables) {
      // Se não conseguiu carregar o environment, considerar todas as variáveis como não resolvidas
      const allVars: string[] = [];
      const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
      let match;
      
      while ((match = variableRegex.exec(text)) !== null) {
        if (!allVars.includes(match[1])) {
          allVars.push(match[1]);
        }
      }
      
      return allVars;
    }

    const unresolved: string[] = [];
    const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      const varName = match[1];
      const varNameLower = varName.toLowerCase();
      
      if (!variables.has(varNameLower) && !unresolved.includes(varName)) {
        unresolved.push(varName);
      }
    }

    return unresolved;
  }

  /**
   * Lista todos os environments disponíveis no workspace
   * @param workspacePath Caminho do workspace
   * @returns Array com nomes dos environments disponíveis
   */
  public getAvailableEnvironments(workspacePath: string): string[] {
    const envDir = getEnvironmentsPath(workspacePath);
    
    if (!fs.existsSync(envDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(envDir);
      const envNames: string[] = [];

      for (const file of files) {
        if (file.startsWith('.env')) {
          if (file === '.env') {
            envNames.push('default');
          } else if (file.startsWith('.env.')) {
            // Extrair nome do environment (.env.dev -> dev)
            const envName = file.substring(5); // Remove '.env.'
            envNames.push(envName);
          }
        }
      }

      return envNames.sort();
    } catch (error) {
      console.error(`Failed to read environments directory: ${envDir}`, error);
      return [];
    }
  }

  /**
   * Limpa o cache de environments
   */
  public clearCache(): void {
    this.environmentsCache.clear();
  }

  /**
   * Limpa o cache de um environment específico
   * @param envName Nome do environment
   * @param workspacePath Caminho do workspace
   */
  public clearEnvironmentCache(envName: string, workspacePath: string): void {
    const cacheKey = `${workspacePath}:${envName}`;
    this.environmentsCache.delete(cacheKey);
  }

  /**
   * Limpa o cache de todos os environments de um workspace
   * @param workspacePath Caminho do workspace
   */
  public clearWorkspaceCache(workspacePath: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.environmentsCache.keys()) {
      if (key.startsWith(`${workspacePath}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.environmentsCache.delete(key));
  }

  /**
   * Configura file watchers para monitorar mudanças nos arquivos .env
   * Deve ser chamado na ativação da extensão
   */
  public setupFileWatchers(): void {
    // Watch for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.updateFileWatchers();
    });

    // Watch for file changes in existing workspaces
    this.updateFileWatchers();
  }

  /**
   * Atualiza os file watchers para todos os workspaces
   */
  private updateFileWatchers(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    // Remove watchers for workspaces that no longer exist
    const currentPaths = new Set(workspaceFolders.map(f => f.uri.fsPath));
    for (const [path, watcher] of this.fileWatchers.entries()) {
      if (!currentPaths.has(path)) {
        watcher.dispose();
        this.fileWatchers.delete(path);
        this.workspacePaths.delete(path);
      }
    }

    // Add watchers for new workspaces
    for (const folder of workspaceFolders) {
      const workspacePath = folder.uri.fsPath;
      if (!this.workspacePaths.has(workspacePath)) {
        this.workspacePaths.add(workspacePath);
        this.createFileWatcher(workspacePath);
      }
    }
  }

  /**
   * Cria um file watcher para um workspace específico
   * @param workspacePath Caminho do workspace
   */
  private createFileWatcher(workspacePath: string): void {
    const envDir = getEnvironmentsPath(workspacePath);
    const httpPath = getHttpPath(workspacePath);
    
    // Create HTTP folder and llms.txt if needed
    if (!fs.existsSync(httpPath)) {
      try {
        fs.mkdirSync(httpPath, { recursive: true });
      } catch (error) {
        console.warn(`Failed to create HTTP directory: ${httpPath}`, error);
      }
    }
    
    // Create directory if it doesn't exist (watcher needs it to exist)
    if (!fs.existsSync(envDir)) {
      try {
        fs.mkdirSync(envDir, { recursive: true });
      } catch (error) {
        // Directory creation failed, but continue anyway
        console.warn(`Failed to create environments directory: ${envDir}`, error);
      }
    }
    
    // Watch for changes in .env files
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(envDir),
      '.env*'
    );

    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    watcher.onDidChange((uri) => {
      // File was modified - clear cache for this workspace
      this.clearWorkspaceCache(workspacePath);
      
      // Extract environment name from file path
      const fileName = path.basename(uri.fsPath);
      let envName: string;
      if (fileName === '.env') {
        envName = 'default';
      } else if (fileName.startsWith('.env.')) {
        envName = fileName.substring(5); // Remove '.env.'
      } else {
        return;
      }
      
      // Fire event to notify listeners
      this._onDidChangeEnvironment.fire(envName);
    });

    watcher.onDidCreate((uri) => {
      // New .env file created - clear cache to force reload
      this.clearWorkspaceCache(workspacePath);
    });

    watcher.onDidDelete((uri) => {
      // .env file deleted - clear cache
      this.clearWorkspaceCache(workspacePath);
    });

    this.fileWatchers.set(workspacePath, watcher);
  }

  /**
   * Limpa todos os file watchers (usado na desativação da extensão)
   */
  public dispose(): void {
    for (const watcher of this.fileWatchers.values()) {
      watcher.dispose();
    }
    this.fileWatchers.clear();
    this.workspacePaths.clear();
    this.environmentsCache.clear();
  }

  /**
   * Cria um novo arquivo de environment com template
   * @param envName Nome do environment
   * @param workspacePath Caminho do workspace
   * @returns true se criado com sucesso
   */
  public async createEnvironment(envName: string, workspacePath: string): Promise<boolean> {
    const envDir = getEnvironmentsPath(workspacePath);
    const httpPath = getHttpPath(workspacePath);
    
    // Create HTTP folder and llms.txt if needed
    if (!fs.existsSync(httpPath)) {
      fs.mkdirSync(httpPath, { recursive: true });
    }
    
    // Criar diretório se não existir
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    const fileName = envName === 'default' ? '.env' : `.env.${envName}`;
    const filePath = path.join(envDir, fileName);

    // Verificar se já existe
    if (fs.existsSync(filePath)) {
      return false;
    }

    // Template padrão
    const template = `# Environment: ${envName}
# Add your environment variables below in the format KEY=VALUE

BASE_URL=http://localhost:3000
API_KEY=your-api-key-here
TIMEOUT=10000
`;

    try {
      fs.writeFileSync(filePath, template, 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to create environment file: ${filePath}`, error);
      return false;
    }
  }

  /**
   * Inicializa environments padrão no workspace se não existirem
   * @param workspacePath Caminho do workspace
   */
  public async initializeDefaultEnvironments(workspacePath: string): Promise<void> {
    const envDir = getEnvironmentsPath(workspacePath);
    const httpPath = getHttpPath(workspacePath);
    
    // Create HTTP folder and llms.txt if needed
    if (!fs.existsSync(httpPath)) {
      fs.mkdirSync(httpPath, { recursive: true });
    }
    
    // Verificar se diretório já existe e tem arquivos
    if (fs.existsSync(envDir)) {
      const files = fs.readdirSync(envDir);
      if (files.some(f => f.startsWith('.env'))) {
        // Já tem arquivos .env, não criar
        return;
      }
    }

    // Criar diretório
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    // Criar .env (default environment usado quando decorator presente)
    const defaultEnvPath = path.join(envDir, '.env');
    if (!fs.existsSync(defaultEnvPath)) {
      const defaultContent = `# Default Environment Variables
# Usado quando # @env default ou quando .env.{nome} não existe

BASE_URL=http://localhost:3000
API_KEY=your-api-key-here
TIMEOUT=10000
`;
      fs.writeFileSync(defaultEnvPath, defaultContent, 'utf8');
    }

    // Criar .env.example (exemplo de como criar novos environments)
    const exampleEnvPath = path.join(envDir, '.env.example');
    if (!fs.existsSync(exampleEnvPath)) {
      const exampleContent = `# Example Environment File
# 
# Como usar:
# 1. Copie este arquivo e renomeie para .env.{nome}
#    Exemplo: .env.dev, .env.staging, .env.prod
# 
# 2. No arquivo .req, use o decorator:
#    # @env dev
#    ## Minha Request
#    curl --request GET \\
#      --url {{base_url}}/api/endpoint
#
# 3. As variáveis {{base_url}}, {{api_key}}, etc serão substituídas
#    pelos valores definidos aqui
#
# Sintaxe:
# - Uma variável por linha no formato: NOME=valor
# - Nomes em MAIÚSCULAS (por convenção)
# - Sem espaços ao redor do =
# - Linhas iniciadas com # são comentários
#
# Exemplos de variáveis:

BASE_URL=http://localhost:3000
API_KEY=your-api-key-here
TIMEOUT=10000
AUTH_TOKEN=your-auth-token
API_VERSION=v1

# Dicas:
# - Use .env para valores padrão
# - Crie .env.dev para desenvolvimento
# - Crie .env.prod para produção
# - Adicione .env.local ao .gitignore para valores pessoais
`;
      fs.writeFileSync(exampleEnvPath, exampleContent, 'utf8');
    }

    // Criar .gitignore no diretório environments
    const gitignorePath = path.join(envDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const gitignoreContent = `# Ignore local environment files
.env.local
*.local

# Keep example file
!.env.example
`;
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
    }
  }
}

