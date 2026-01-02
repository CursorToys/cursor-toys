/**
 * Recommendations Manager for CursorToys
 * Manages project context detection, recommendations fetching, and filtering
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { parseFrontmatter, FrontmatterMetadata, extractTags } from './frontmatterParser';
import { GistManager } from './gistManager';

export interface ProjectContext {
  languages: string[];
  frameworks: string[];
  files: string[];
  hasFolder: string[];
}

export interface RecommendationItem {
  id: string;
  name: string;
  description: string;
  type: 'command' | 'prompt' | 'rule';
  tags: string[];
  category?: string;
  author?: string;
  version?: string;
  gistId?: string;
  cursortoysUrl?: string;
  previewUrl?: string;
}

export interface RecommendationSet {
  id: string;
  name: string;
  description: string;
  context: Partial<ProjectContext>;
  items: RecommendationItem[];
}

export interface RecommendationsIndex {
  version: string;
  lastUpdated: string;
  indexUrl?: string;
  recommendations: RecommendationSet[];
}

export interface RecommendationsConfig {
  indexUrl?: string;
  indexGistId?: string;
  checkOnStartup: boolean;
  suggestInterval: number;
  enabled: boolean;
}

export class RecommendationsManager {
  private static instance: RecommendationsManager;
  private context: vscode.ExtensionContext;
  private memoryCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly MEMORY_CACHE_TTL = 3600000; // 1 hour
  private readonly DISK_CACHE_TTL = 86400000; // 24 hours

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static getInstance(context?: vscode.ExtensionContext): RecommendationsManager {
    if (!RecommendationsManager.instance && context) {
      RecommendationsManager.instance = new RecommendationsManager(context);
    }
    return RecommendationsManager.instance;
  }

  /**
   * Detecta contexto do projeto atual
   */
  public async detectProjectContext(): Promise<ProjectContext> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return { languages: [], frameworks: [], files: [], hasFolder: [] };
    }

    const context: ProjectContext = {
      languages: [],
      frameworks: [],
      files: [],
      hasFolder: []
    };

    const workspacePath = workspaceFolder.uri.fsPath;

    // Mapa de detecção de linguagens por arquivos
    const detectionMap: Record<string, string> = {
      'package.json': 'javascript',
      'tsconfig.json': 'typescript',
      'requirements.txt': 'python',
      'pyproject.toml': 'python',
      'setup.py': 'python',
      'Cargo.toml': 'rust',
      'go.mod': 'go',
      'pom.xml': 'java',
      'build.gradle': 'java',
      'build.gradle.kts': 'kotlin',
      'composer.json': 'php',
      'Gemfile': 'ruby',
      'mix.exs': 'elixir',
      'Pipfile': 'python',
      'poetry.lock': 'python'
    };

    // Detectar arquivos e linguagens
    for (const [file, lang] of Object.entries(detectionMap)) {
      const filePath = path.join(workspacePath, file);
      if (fs.existsSync(filePath)) {
        if (!context.files.includes(file)) {
          context.files.push(file);
        }
        if (!context.languages.includes(lang)) {
          context.languages.push(lang);
        }
      }
    }

    // Detectar frameworks via package.json
    if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8')
        );
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        const frameworkMap: Record<string, string> = {
          'react': 'react',
          'next': 'nextjs',
          'vue': 'vue',
          '@angular/core': 'angular',
          'svelte': 'svelte',
          'express': 'express',
          '@nestjs/core': 'nestjs',
          'fastify': 'fastify',
          'jest': 'jest',
          'vitest': 'vitest',
          '@playwright/test': 'playwright',
          'cypress': 'cypress'
        };

        for (const [dep, framework] of Object.entries(frameworkMap)) {
          if (deps[dep] && !context.frameworks.includes(framework)) {
            context.frameworks.push(framework);
          }
        }
      } catch (error) {
        console.error('Error parsing package.json:', error);
      }
    }

    // Detectar pastas especiais
    const specialFolders = [
      '.git',
      '.github',
      'docker',
      'kubernetes',
      'terraform',
      '.vscode',
      '.cursor'
    ];

    for (const folder of specialFolders) {
      if (fs.existsSync(path.join(workspacePath, folder))) {
        context.hasFolder.push(folder);
      }
    }

    return context;
  }

  /**
   * Busca recomendações baseadas no contexto
   */
  public async getRecommendationsForContext(
    context: ProjectContext
  ): Promise<RecommendationSet[]> {
    const config = this.getConfig();

    if (!config.enabled) {
      return [];
    }

    // Buscar apenas recomendações remotas
    const remoteRecs = await this.loadRemoteRecommendations(config);

    // Filtrar por contexto
    return this.filterByContext(remoteRecs, context);
  }

  /**
   * Carrega recomendações de índice remoto (Gist ou URL)
   */
  private async loadRemoteRecommendations(
    config: RecommendationsConfig
  ): Promise<RecommendationSet[]> {
    const cacheKey = 'remote_recommendations';

    // Verificar cache em memória
    const memCache = this.memoryCache.get(cacheKey);
    if (memCache && Date.now() - memCache.timestamp < this.MEMORY_CACHE_TTL) {
      return memCache.data;
    }

    // Verificar cache em disco
    const diskCache = this.context.globalState.get<{
      data: RecommendationSet[];
      timestamp: number;
    }>(cacheKey);

    if (diskCache && Date.now() - diskCache.timestamp < this.DISK_CACHE_TTL) {
      // Atualizar cache em memória
      this.memoryCache.set(cacheKey, {
        data: diskCache.data,
        timestamp: diskCache.timestamp
      });
      return diskCache.data;
    }

    // Buscar do remoto
    try {
      let recommendations: RecommendationSet[] = [];

      if (config.indexUrl) {
        recommendations = await this.fetchFromUrl(config.indexUrl);
      } else if (config.indexGistId) {
        recommendations = await this.fetchFromGist(config.indexGistId);
      }

      if (recommendations.length > 0) {
        // Salvar em ambos os caches
        const cacheData = { data: recommendations, timestamp: Date.now() };
        this.memoryCache.set(cacheKey, cacheData);
        await this.context.globalState.update(cacheKey, cacheData);
      }

      return recommendations;
    } catch (error) {
      console.error('Error loading remote recommendations:', error);
      
      // Retornar cache expirado se disponível
      if (diskCache) {
        return diskCache.data;
      }
      
      return [];
    }
  }

  /**
   * Busca índice de recomendações de uma URL
   */
  private async fetchFromUrl(url: string): Promise<RecommendationSet[]> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed: RecommendationsIndex = JSON.parse(data);
            resolve(parsed.recommendations || []);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Busca índice de recomendações de um Gist
   */
  private async fetchFromGist(gistId: string): Promise<RecommendationSet[]> {
    try {
      // Parse gistId (pode ser "username/gistid" ou apenas "gistid")
      const parts = gistId.split('/');
      const actualGistId = parts.length > 1 ? parts[1] : gistId;

      // Construir URL do Gist raw
      const url = `https://gist.githubusercontent.com/raw/${actualGistId}/recommendations-index.json`;
      
      return await this.fetchFromUrl(url);
    } catch (error) {
      console.error('Error fetching from Gist:', error);
      return [];
    }
  }

  /**
   * Filtra recomendações por contexto
   */
  private filterByContext(
    recommendations: RecommendationSet[],
    context: ProjectContext
  ): RecommendationSet[] {
    return recommendations.filter((rec) => {
      const recContext = rec.context;

      // Recomendações sem contexto são genéricas (sempre incluir)
      if (!recContext || Object.keys(recContext).length === 0) {
        return true;
      }

      // Verificar linguagens
      if (recContext.languages && recContext.languages.length > 0) {
        const hasLanguage = recContext.languages.some((lang) =>
          context.languages.includes(lang)
        );
        if (!hasLanguage) {
          return false;
        }
      }

      // Verificar frameworks
      if (recContext.frameworks && recContext.frameworks.length > 0) {
        const hasFramework = recContext.frameworks.some((fw) =>
          context.frameworks.includes(fw)
        );
        if (!hasFramework) {
          return false;
        }
      }

      // Verificar arquivos
      if (recContext.files && recContext.files.length > 0) {
        const hasFile = recContext.files.some((file) =>
          context.files.includes(file)
        );
        if (!hasFile) {
          return false;
        }
      }

      // Verificar pastas
      if (recContext.hasFolder && recContext.hasFolder.length > 0) {
        const hasFolder = recContext.hasFolder.some((folder) =>
          context.hasFolder.includes(folder)
        );
        if (!hasFolder) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Verifica se deve mostrar recomendações
   */
  public async shouldShowRecommendations(): Promise<boolean> {
    const config = this.getConfig();

    if (!config.enabled || !config.checkOnStartup) {
      return false;
    }

    // Verificar última vez que mostrou
    const lastShown = this.context.globalState.get<number>(
      'lastRecommendationShown',
      0
    );
    const now = Date.now();
    const intervalMs = config.suggestInterval * 24 * 60 * 60 * 1000;

    return now - lastShown > intervalMs;
  }

  /**
   * Marca que recomendações foram mostradas
   */
  public async markRecommendationsShown(): Promise<void> {
    await this.context.globalState.update('lastRecommendationShown', Date.now());
  }

  /**
   * Limpa cache
   */
  public async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await this.context.globalState.update('remote_recommendations', undefined);
    vscode.window.showInformationMessage('Recommendations cache cleared');
  }

  /**
   * Obtém configurações de recomendações
   */
  private getConfig(): RecommendationsConfig {
    const config = vscode.workspace.getConfiguration('cursorToys');
    return {
      indexUrl: config.get<string>('recommendationsIndexUrl', ''),
      indexGistId: config.get<string>('recommendationsIndexGistId', ''),
      checkOnStartup: config.get<boolean>('recommendationsCheckOnStartup', true),
      suggestInterval: config.get<number>('recommendationsSuggestInterval', 7),
      enabled: config.get<boolean>('recommendationsEnabled', true)
    };
  }

  /**
   * Parseia frontmatter de um arquivo e cria RecommendationItem
   */
  public async parseFileToRecommendation(
    filePath: string,
    type: 'command' | 'prompt' | 'rule'
  ): Promise<RecommendationItem | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatter(content);
      const filename = path.basename(filePath, path.extname(filePath));

      return {
        id: filename,
        name: filename.replace(/-/g, ' ').replace(/_/g, ' '),
        description: parsed.metadata.description || `${type} file`,
        type,
        tags: extractTags(parsed.metadata),
        category: parsed.metadata.category,
        author: parsed.metadata.author,
        version: parsed.metadata.version
      };
    } catch (error) {
      console.error('Error parsing file to recommendation:', error);
      return null;
    }
  }

  /**
   * Busca todas as recomendações (sem filtro de contexto)
   */
  public async getAllRecommendations(): Promise<RecommendationSet[]> {
    const config = this.getConfig();

    if (!config.enabled) {
      return [];
    }

    // Apenas recomendações remotas
    const remoteRecs = await this.loadRemoteRecommendations(config);

    return remoteRecs;
  }
}

