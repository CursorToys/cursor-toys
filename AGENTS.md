# AGENTS.md - Guia de Desenvolvimento

## Visão Geral do Projeto

Extensão VS Code/Cursor desenvolvida em TypeScript para gerar e importar deeplinks de comandos, regras e prompts do Cursor. Facilita o compartilhamento e colaboração através de links compartilháveis.

**Tecnologias Principais:**
- TypeScript (strict mode)
- VS Code Extension API
- Node.js (CommonJS modules)

## Estrutura de Diretórios

```
src/              # Código fonte TypeScript
  ├── extension.ts           # Ponto de entrada, registro de comandos
  ├── deeplinkGenerator.ts   # Geração de deeplinks
  ├── deeplinkImporter.ts    # Importação de deeplinks
  ├── codelensProvider.ts    # Provider de CodeLens
  ├── userCommandsTreeProvider.ts  # Tree Provider para comandos pessoais
  ├── telemetry.ts           # Sistema de analytics e telemetria
  └── utils.ts               # Funções utilitárias
out/              # Código compilado (gerado automaticamente)
resources/        # Recursos estáticos (ícones, etc.)
ANALYTICS.md      # Documentação completa do sistema de analytics
```

## Convenções de Código

### Nomenclatura
- **Arquivos**: camelCase (ex: `deeplinkGenerator.ts`)
- **Funções**: camelCase (ex: `generateDeeplink`, `getFileTypeFromPath`)
- **Classes**: PascalCase (ex: `DeeplinkCodeLensProvider`)
- **Constantes**: UPPER_SNAKE_CASE (ex: `MAX_URL_LENGTH`)
- **Tipos/Interfaces**: PascalCase (ex: `DeeplinkParams`)

### Formatação e Estilo
- TypeScript strict mode habilitado
- Target: ES2020
- Módulos: CommonJS
- Sempre usar tipos explícitos em funções exportadas
- Comentários JSDoc para funções públicas e complexas
- **Idioma**:
  - **SEMPRE** usar inglês para:
    - Nomes de funções, variáveis, classes e tipos
    - Comentários no código (inclusive JSDoc)
    - Mensagens de commit
    - Documentação técnica (README.md, CHANGELOG.md, etc.)
    - Strings de mensagens ao usuário
  - Código e documentação em inglês garantem melhor colaboração internacional
  - Nunca misturar inglês e português no código
- **Emojis**: Nunca usar emojis no código, mensagens de usuário ou comentários, exceto:
  - Se explicitamente solicitado pelo usuário
  - Em arquivos de documentação (README.md, CHANGELOG.md, etc.)

### Estrutura de Funções
```typescript
/**
 * Descrição clara da função
 * @param param Descrição do parâmetro
 * @returns Descrição do retorno
 */
export async function functionName(param: Type): Promise<ReturnType> {
  // Validações primeiro
  // Lógica principal
  // Tratamento de erros
}
```

## Arquitetura e Padrões

### Separação de Responsabilidades
- **extension.ts**: Registro de comandos e ativação da extensão
- **deeplinkGenerator.ts**: Lógica de geração de deeplinks
- **deeplinkImporter.ts**: Lógica de importação e criação de arquivos
- **codelensProvider.ts**: Implementação do CodeLens
- **userCommandsTreeProvider.ts**: Tree Provider para visualização de comandos pessoais
- **telemetry.ts**: Sistema de analytics e rastreamento de uso (ver ANALYTICS.md)
- **utils.ts**: Funções utilitárias reutilizáveis

### Tratamento de Erros
- Sempre mostrar mensagens de erro ao usuário via `vscode.window.showErrorMessage()`
- Validar entradas antes de processar
- Usar try-catch em operações assíncronas
- Retornar `null` ou `undefined` em caso de erro (não lançar exceções não tratadas)

### Validações
- Validar extensões de arquivo permitidas antes de processar
- Validar comprimento de URL (limite de 8000 caracteres)
- Validar formato de URLs customizadas
- Verificar existência de arquivos antes de operações

### Configurações
- Usar `vscode.workspace.getConfiguration('cursorToys')` para acessar configurações
- Suportar configurações em nível de workspace e usuário
- Valores padrão sempre definidos
- Validar configurações antes de usar

## Desenvolvimento

### Workflow
1. Desenvolver em `src/` usando TypeScript
2. Compilar com `npm run compile` (gera `out/`)
3. Testar localmente instalando o `.vsix`
4. Atualizar `CHANGELOG.md` com mudanças
5. Publicar com `npm run publish`

### Comandos Disponíveis
- `npm run compile`: Compila TypeScript
- `npm run watch`: Compilação em modo watch
- `npm run package`: Cria arquivo `.vsix`
- `npm run publish`: Publica no marketplace

### Registro de Comandos
- Registrar todos os comandos em `activate()`
- Adicionar disposables ao `context.subscriptions`
- Usar prefixo `cursor-toys.` para todos os comandos

### CodeLens
- Implementar `vscode.CodeLensProvider`
- Atualizar CodeLens quando configurações mudarem
- Mostrar apenas em arquivos válidos nas pastas configuradas
- Usar `getFileTypeFromPath()` para detectar tipo de arquivo
- Validar extensões permitidas antes de exibir
- Suporta pasta base customizável (`.cursor/`, `.vscode/`, etc.)

### Tree Provider
- Implementar `vscode.TreeDataProvider` para comandos pessoais
- Atualizar tree quando arquivos mudarem (usar FileSystemWatcher)
- Filtrar arquivos por extensões permitidas
- Ordenar itens alfabeticamente
- Criar diretórios automaticamente se não existirem
- Suportar múltiplas pastas baseado em configuração (`personalCommandsView`)

## Padrões de Integração

### Suporte a Múltiplos Formatos
- **Deeplink**: `cursor://godrix.cursor-toys/`
- **Web**: `https://cursor.com/link/`
- **Custom**: Configurável via `cursorToys.customBaseUrl`

### Pastas Suportadas

A extensão suporta customização da pasta base através da configuração `cursorToys.baseFolder`:

- **Commands**: `.{baseFolder}/commands/` (configurável via `cursorToys.baseFolder` e `cursorToys.commandsFolder`)
  - Suporta `.cursor/commands/`, `.claude/commands/`, `.vscode/commands/`, etc.
  - Para comandos pessoais: `~/.cursor/commands/` ou `~/.claude/commands/`
  - Para comandos de projeto: `{workspace}/.{baseFolder}/commands/`
- **Rules**: `.{baseFolder}/rules/` (configurável via `cursorToys.baseFolder`)
  - **Nota:** Rules são específicos do Cursor AI e podem não funcionar no VS Code
- **Prompts**: `.{baseFolder}/prompts/` (configurável via `cursorToys.baseFolder`)
  - **Nota:** Prompts são específicos do Cursor AI e podem não funcionar no VS Code
- **HTTP**: `.{baseFolder}/http/` (configurável via `cursorToys.baseFolder`)
  - Suporta `.cursor/http/`, `.vscode/http/`, `.ai/http/`, etc.

**Importante:** Sempre usar funções helper de `utils.ts` para construir paths:
- `getBaseFolderName()`: Obtém pasta base configurada
- `getCommandsPath()`: Path para pasta de comandos
- `getRulesPath()`: Path para pasta de rules
- `getPromptsPath()`: Path para pasta de prompts
- `getHttpPath()`: Path para pasta HTTP
- `getProjectEnvRoot()` / `getProjectEnvFilePath()`: Project-root `.env*` paths for HTTP

**Nunca** usar paths hardcoded como `.cursor/` diretamente no código.

### Comandos Pessoais vs Projeto
- Comandos pessoais: `~/.cursor/commands/` ou `~/.claude/commands/`
- Comandos de projeto: `{workspace}/.cursor/commands/` ou `{workspace}/.claude/commands/`
- Sempre perguntar ao usuário ao importar comandos

## Qualidade

### Validações Obrigatórias
- Verificar extensão de arquivo permitida
- Validar comprimento de URL (máximo 8000 caracteres)
- Verificar existência de arquivos antes de operações
- Validar formato de URLs customizadas
- Sanitizar nomes de arquivos

### Mensagens ao Usuário
- Usar `showInformationMessage()` para sucesso
- Usar `showErrorMessage()` para erros
- Usar `showWarningMessage()` para confirmações
- Mensagens devem ser claras e acionáveis

### Extensões de Arquivo
- Padrão: `['md', 'mdc']`
- Configurável via `cursorToys.allowedExtensions`
- Para rules, preferir `.mdc` se disponível (suporta metadata)

## Boas Práticas

### Funções Utilitárias
- Manter funções puras quando possível
- Exportar funções reutilizáveis em `utils.ts`
- Documentar funções complexas com JSDoc
- Usar tipos explícitos

### Manipulação de Arquivos
- Usar `vscode.workspace.fs` para operações de arquivo
- Criar diretórios se não existirem
- Verificar existência antes de sobrescrever
- Perguntar confirmação antes de deletar

### Parsing de URLs
- Suportar ambos os formatos (`cursor://` e `https://`)
- Normalizar URLs antes de processar
- Decodificar parâmetros URL com tratamento de erros
- Validar estrutura de URL antes de extrair parâmetros

### Sanitização
- Sanitizar nomes de arquivos (remover caracteres inválidos)
- Manter apenas letras, números, pontos, hífens e underscores
- Remover extensão antes de sanitizar

## Configurações da Extensão

### Configurações Disponíveis
- `cursorToys.linkType`: Tipo de link (`deeplink`, `web`, `custom`)
- `cursorToys.customBaseUrl`: URL base customizada
- `cursorToys.allowedExtensions`: Extensões permitidas
- `cursorToys.baseFolder`: Pasta base para todos os recursos (ex: `cursor`, `vscode`, `ai`)
- `cursorToys.commandsFolder`: Pasta de comandos pessoais (`cursor` ou `claude`)
- `cursorToys.personalCommandsView`: Exibir comandos de (`both`, `cursor`, `claude`)

**Nota:** Configurar `baseFolder` afeta commands, rules, prompts e HTTP. Rules e prompts são específicos do Cursor AI.

### Ativação
- Ativar usando `onStartupFinished` para garantir que todos os comandos estejam disponíveis
  - **IMPORTANTE**: Usar `onStartupFinished` em vez de `onCommand` individual ou `*`
  - `onStartupFinished` ativa após o VS Code terminar de inicializar (melhor performance que `*`)
  - Garante que comandos não retornem "command not found" ao usar extensão instalada via VSIX
- Registrar CodeLens provider para todos os arquivos
- Registrar Tree Provider para visualização de comandos pessoais
- Comandos disponíveis via Command Palette e Context Menu
- FileSystemWatcher para atualizar tree quando arquivos mudarem
- Inicializar telemetria na ativação da extensão

## Analytics e Telemetria

A extensão possui um sistema completo de analytics que rastreia o uso de recursos pelos usuários.

### Características
- ✅ **Respeita privacidade**: Obedece automaticamente configurações do VS Code (`telemetry.telemetryLevel`)
- ✅ **Nativo**: Usa VS Code Telemetry API (prática recomendada)
- ✅ **Seguro**: Dados anonimizados e agregados, sem informações pessoais
- ✅ **Não invasivo**: Não impacta performance da extensão

### Eventos Rastreados
- Execução de comandos
- Geração e importação de deeplinks
- Cliques em CodeLens
- Ações em comandos pessoais (abrir, deletar, renomear, etc.)
- Envio de texto/seleção para chat
- Requisições HTTP
- Mudanças de configuração
- Erros e exceções

### Como Usar
```typescript
// Importar TelemetryManager
import { TelemetryManager } from './telemetry';

// Rastrear um comando
const telemetry = TelemetryManager.getInstance();
telemetry.trackCommand('nome-do-comando', { 
  propriedade: 'valor' 
});

// Rastrear geração de deeplink
telemetry.trackDeeplinkGeneration('command', 'deeplink', 'md', true);

// Rastrear erros
telemetry.trackError('TipoDeErro', 'Mensagem do erro', { 
  contexto: 'adicional' 
});
```

### Documentação Completa
Para detalhes completos sobre o sistema de analytics, incluindo:
- Lista completa de eventos rastreados
- Como visualizar analytics (Application Insights, backend customizado)
- Métricas importantes a monitorar
- Integração com Azure Application Insights
- Privacidade e GDPR
- Como adicionar novos eventos

**Consulte**: [`ANALYTICS.md`](./ANALYTICS.md)

