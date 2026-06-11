import * as assert from 'assert';
import { MCP_PROMPT_DEFINITIONS } from './promptCatalog';
import { MCP_RESOURCE_DEFINITIONS } from './resourceCatalog';
import { MCP_TOOL_DEFINITIONS } from './toolSchemaCatalog';
import { McpPromptHost } from './prompts/promptHost';

function runTests(): void {
  assert.ok(MCP_TOOL_DEFINITIONS.length >= 150, 'expected 150+ MCP tools');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'mcp_install_skill'), 'mcp_install_skill tool');
  assert.ok(MCP_RESOURCE_DEFINITIONS.length >= 10, 'expected MCP resources catalog');
  assert.ok(MCP_PROMPT_DEFINITIONS.length >= 6, 'expected MCP prompts catalog');

  const names = new Set(MCP_TOOL_DEFINITIONS.map((t) => t.name));
  assert.strictEqual(names.size, MCP_TOOL_DEFINITIONS.length, 'duplicate tool names');

  const staticResources = MCP_RESOURCE_DEFINITIONS.filter((r) => r.kind === 'static');
  const templates = MCP_RESOURCE_DEFINITIONS.filter((r) => r.kind === 'template');
  assert.ok(staticResources.some((r) => r.uri === 'cursortoys://config'));
  assert.ok(templates.some((r) => r.uriTemplate.includes('kanban/{status}')));

  const promptHost = new McpPromptHost();
  const listed = promptHost.listPrompts();
  assert.strictEqual(listed.length, MCP_PROMPT_DEFINITIONS.length);

  const kanbanPrompt = promptHost.getPrompt('kanban-workflow', { focus: 'backlog' });
  assert.ok(kanbanPrompt.messages[0]?.content.text.includes('kanban_list'));
  assert.ok(kanbanPrompt.messages[0]?.content.text.includes('backlog'));

  const unknown = () => promptHost.getPrompt('does-not-exist');
  assert.throws(unknown, /Unknown prompt/);

  console.log('mcpWave4: tools=%d resources=%d prompts=%d', MCP_TOOL_DEFINITIONS.length, MCP_RESOURCE_DEFINITIONS.length, MCP_PROMPT_DEFINITIONS.length);
  console.log('All mcp/mcpWave4 tests passed.');
}

runTests();
