import * as assert from 'assert';
import {
  CURSOR_PET_MCP_TOOL_NAMES,
  filterPromptsForCursorPet,
  filterResourcesForCursorPet,
  filterToolsForCursorPet,
} from './cursorPetMcpCatalog';
import { MCP_PROMPT_DEFINITIONS } from './promptCatalog';
import { MCP_RESOURCE_DEFINITIONS } from './resourceCatalog';
import { MCP_TOOL_DEFINITIONS } from './toolSchemaCatalog';
import { McpPromptHost } from './prompts/promptHost';

function runTests(): void {
  assert.ok(MCP_TOOL_DEFINITIONS.length >= 150, 'expected 150+ MCP tools');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'mcp_install_skill'), 'mcp_install_skill tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'inline_annotation_list'), 'inline_annotation_list tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_status'), 'cursor_pet_status tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_clean'), 'cursor_pet_clean tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_medicine'), 'cursor_pet_medicine tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_play'), 'cursor_pet_play tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_discipline'), 'cursor_pet_discipline tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_lights_off'), 'cursor_pet_lights_off tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'cursor_pet_treat'), 'cursor_pet_treat tool');
  assert.strictEqual(CURSOR_PET_MCP_TOOL_NAMES.length, 13, 'cursor pet MCP tool count');

  const hiddenWhenDisabled = filterToolsForCursorPet(MCP_TOOL_DEFINITIONS, false);
  assert.ok(!hiddenWhenDisabled.some((t) => t.name === 'cursor_pet_status'), 'hide cursor pet tools when disabled');
  assert.strictEqual(
    filterResourcesForCursorPet(MCP_RESOURCE_DEFINITIONS, false).some(
      (r) => r.kind === 'static' && r.uri === 'cursortoys://cursor-pet'
    ),
    false,
    'hide cursor-pet resource when disabled'
  );
  assert.ok(
    !filterPromptsForCursorPet(MCP_PROMPT_DEFINITIONS, false).some((p) => p.name === 'cursor-pet-care'),
    'hide cursor-pet-care prompt when disabled'
  );
  assert.ok(MCP_RESOURCE_DEFINITIONS.some((r) => r.kind === 'static' && r.uri === 'cursortoys://inline-annotations'), 'inline-annotations resource');
  assert.ok(MCP_RESOURCE_DEFINITIONS.some((r) => r.kind === 'static' && r.uri === 'cursortoys://cursor-pet'), 'cursor-pet resource');
  assert.ok(MCP_PROMPT_DEFINITIONS.some((p) => p.name === 'inline-annotation-review'), 'inline-annotation-review prompt');
  assert.ok(MCP_PROMPT_DEFINITIONS.some((p) => p.name === 'cursor-pet-care'), 'cursor-pet-care prompt');
  assert.ok(MCP_RESOURCE_DEFINITIONS.length >= 10, 'expected MCP resources catalog');
  assert.ok(MCP_PROMPT_DEFINITIONS.length >= 8, 'expected MCP prompts catalog');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'agents_list'), 'agents_list tool');
  assert.ok(MCP_TOOL_DEFINITIONS.some((t) => t.name === 'sync_asset_to_workspace'), 'sync_asset_to_workspace tool');
  assert.ok(MCP_RESOURCE_DEFINITIONS.some((r) => r.kind === 'template' && r.uriTemplate === 'cursortoys://personal/{type}'), 'personal resource');
  assert.ok(MCP_PROMPT_DEFINITIONS.some((p) => p.name === 'global-user-ai-workflow'), 'global-user-ai-workflow prompt');

  const names = new Set(MCP_TOOL_DEFINITIONS.map((t) => t.name));
  assert.strictEqual(names.size, MCP_TOOL_DEFINITIONS.length, 'duplicate tool names');

  const staticResources = MCP_RESOURCE_DEFINITIONS.filter((r) => r.kind === 'static');
  const templates = MCP_RESOURCE_DEFINITIONS.filter((r) => r.kind === 'template');
  assert.ok(staticResources.some((r) => r.uri === 'cursortoys://config'));
  assert.ok(templates.some((r) => r.uriTemplate.includes('kanban/{status}')));
  assert.ok(templates.some((r) => r.uriTemplate === 'cursortoys://http/personal/{path}'), 'http personal resource template');

  const promptHost = new McpPromptHost();
  const listed = promptHost.listPrompts();
  assert.ok(listed.length > 0, 'prompt host lists prompts');
  assert.ok(listed.some((p) => p.name === 'kanban-workflow'), 'kanban-workflow prompt listed');

  const kanbanPrompt = promptHost.getPrompt('kanban-workflow', { focus: 'backlog' });
  assert.ok(kanbanPrompt.messages[0]?.content.text.includes('kanban_list'));
  assert.ok(kanbanPrompt.messages[0]?.content.text.includes('backlog'));

  const unknown = () => promptHost.getPrompt('does-not-exist');
  assert.throws(unknown, /Unknown prompt/);

  console.log('mcpWave4: tools=%d resources=%d prompts=%d', MCP_TOOL_DEFINITIONS.length, MCP_RESOURCE_DEFINITIONS.length, MCP_PROMPT_DEFINITIONS.length);
  console.log('All mcp/mcpWave4 tests passed.');
}

runTests();
