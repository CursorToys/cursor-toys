/**
 * Skills Manager for CursorToys
 * Manages skills fetching from Tech Leads Club registry
 */

import * as vscode from 'vscode';
import * as https from 'https';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  path: string;
  files?: string[];
  author?: string;
  version?: string;
}

export interface SkillCategory {
  name: string;
  description: string;
}

export interface SkillsRegistry {
  version: string;
  categories: Record<string, SkillCategory>;
  skills: SkillItem[];
}

export interface SkillsConfig {
  registryUrl: string;
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
   * Busca todas as skills do registro
   */
  public async getAllSkills(): Promise<SkillsRegistry | null> {
    const config = this.getConfig();

    if (!config.enabled) {
      return null;
    }

    return await this.loadSkillsRegistry(config);
  }

  /**
   * Carrega skills do registro remoto (Tech Leads Club)
   */
  private async loadSkillsRegistry(
    config: SkillsConfig
  ): Promise<SkillsRegistry | null> {
    const cacheKey = 'skills_registry';

    // Verificar cache em memória
    const memCache = this.memoryCache.get(cacheKey);
    if (memCache && Date.now() - memCache.timestamp < this.MEMORY_CACHE_TTL) {
      return memCache.data;
    }

    // Verificar cache em disco
    const diskCache = this.context.globalState.get<{
      data: SkillsRegistry;
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
      const registry = await this.fetchSkillsRegistry(config.registryUrl);

      if (registry) {
        // Salvar em ambos os caches
        const cacheData = { data: registry, timestamp: Date.now() };
        this.memoryCache.set(cacheKey, cacheData);
        await this.context.globalState.update(cacheKey, cacheData);
      }

      return registry;
    } catch (error) {
      console.error('Error loading skills registry:', error);
      
      // Retornar cache expirado se disponível
      if (diskCache) {
        return diskCache.data;
      }
      
      return null;
    }
  }

  /**
   * Busca registro de skills de uma URL
   */
  private async fetchSkillsRegistry(url: string): Promise<SkillsRegistry | null> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed: SkillsRegistry = JSON.parse(data);
            
            // Add ID to each skill (use name as ID)
            if (parsed.skills) {
              parsed.skills = parsed.skills.map((skill, index) => ({
                ...skill,
                id: skill.name || `skill-${index}`
              }));
            }
            
            resolve(parsed);
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
   * Limpa cache
   */
  public async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await this.context.globalState.update('skills_registry', undefined);
    vscode.window.showInformationMessage('Skills cache cleared');
  }

  /**
   * Obtém configurações de skills
   */
  private getConfig(): SkillsConfig {
    const config = vscode.workspace.getConfiguration('cursorToys');
    return {
      registryUrl: config.get<string>('skillsRegistryUrl', 'https://raw.githubusercontent.com/tech-leads-club/agent-skills/refs/heads/main/packages/skills-catalog/skills-registry.json'),
      enabled: config.get<boolean>('recommendationsEnabled', true)
    };
  }

  /**
   * Busca todas as recomendações (mantido para compatibilidade)
   * @deprecated Use getAllSkills() instead
   */
  public async getAllRecommendations(): Promise<any[]> {
    const registry = await this.getAllSkills();
    if (!registry) {
      return [];
    }
    
    // Retornar em formato compatível (será usado pelo painel)
    return [{
      id: 'tech-leads-club',
      name: 'Tech Leads Club Skills',
      description: 'Agent Skills from Tech Leads Club',
      context: {},
      items: registry.skills.map((skill, index) => ({
        id: skill.name || `skill-${index}`,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        path: skill.path,
        author: skill.author,
        version: skill.version,
        tags: [],
        type: 'skill' as const
      }))
    }];
  }
}

