/* CursorToys Control — webview renderer. */
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  const I = {
    mark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/>' +
      '<rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.8 7.8 0 0 0 .1-3l1.7-1.3-1.8-3.1-2 .8a7.6 7.6 0 0 0-2.6-1.5l-.3-2.1H8.5l-.3 2.1c-1 .3-1.8.8-2.6 1.5l-2-.8L1.8 9.2l1.7 1.3a7.8 7.8 0 0 0 0 3l-1.7 1.3 1.8 3.1 2-.8c.8.7 1.6 1.2 2.6 1.5l.3 2.1h3.6l.3-2.1c1-.3 1.8-.8 2.6-1.5l2 .8 1.8-3.1z"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z"/></svg>',
    terminal:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l4 4-4 4"/><path d="M12 16h6"/></svg>',
    doc:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14a0 0 0 0 1 0 0H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15h6"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    bolt:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    gauge:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/></svg>',
    wand:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/></svg>',
    puzzle:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10 3a2 2 0 0 1 4 0c0 .5.5 1 1 1h2a1 1 0 0 1 1 1v2c0 .5.5 1 1 1a2 2 0 0 1 0 4c-.5 0-1 .5-1 1v3a1 1 0 0 1-1 1h-3c-.5 0-1-.5-1-1a2 2 0 0 0-4 0c0 .5-.5 1-1 1H6a1 1 0 0 1-1-1v-3c0-.5-.5-1-1-1a2 2 0 0 1 0-4c.5 0 1-.5 1-1V6a1 1 0 0 1 1-1h2c.5 0 1-.5 1-1z"/></svg>',
    bookmark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
    clippy:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>',
    grip:
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/></svg>',
  };

  const _state = vscode.getState() || {};
  let collapsed = Object.assign(
    {
      'cfg-shortcuts': false,
      'p-cmd': true,
      'p-prm': true,
      'p-skl': true,
      'p-note': true,
      'p-kanban': true,
      'p-plans': true,
      'p-hooks': true,
      'p-mcpb': true,
      'p-clip-hist': true,
      'p-clip-slots': true,
      'p-clip-global': true,
      'p-clip-ws': true,
      'p-projects': false,
      'p-anchors': true,
      'p-rules': true,
    },
    _state.collapsed || {}
  );
  const TABS = ['personal', 'project', 'usage', 'config'];
  let activeTab = TABS.includes(_state.activeTab) ? _state.activeTab : 'personal';

  function saveState() {
    vscode.setState({ collapsed, activeTab });
  }

  let currentModel = null;
  let searchQuery = '';
  let pollSeconds = 900;
  let dragState = null;

  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"'`]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c])
    );

  function secId(prefix, name) {
    return prefix + '-' + name;
  }

  function section(id, icon, title, count, bodyHtml) {
    const defaultCol = id.startsWith('cfg-') && id !== 'cfg-shortcuts';
    const isCol = collapsed[id] !== undefined ? !!collapsed[id] : defaultCol;
    return (
      `<div class="sec ${isCol ? 'collapsed' : ''}" data-secwrap="${id}">` +
      `<div class="sec-h" data-sec="${id}">` +
      `<span class="chev">${I.chevron}</span><span class="ic">${icon}</span>` +
      `<span class="nm">${esc(title)}</span>` +
      (count != null ? `<span class="ct">${count}</span>` : '') +
      `</div><div class="sec-b">${bodyHtml || '<div class="empty">Nothing here yet</div>'}</div></div>`
    );
  }

  function reorderHandle() {
    return `<span class="drag" draggable="true" title="Drag to reorder">${I.grip}</span>`;
  }

  function reorderAttrs(opts) {
    if (!opts || !opts.id || !opts.scope) return '';
    return ` data-reorder-id="${esc(opts.id)}" data-reorder-scope="${esc(opts.scope)}"`;
  }

  function isOpenCommand(commandId) {
    if (!commandId) return false;
    if (commandId === 'cursor-toys.settings.editSetting') return true;
    if (commandId === 'cursor-toys.goToAnchor') return true;
    if (commandId === 'cursor-toys.showReleaseNotes') return true;
    if (/configure/i.test(commandId)) return true;
    if (/\.open[A-Z]|\.open$|openDashboard|openTokenSetup|openMcpJson|openSettingsJson|openKanbanBoard|openUsageMonitor/i.test(commandId)) {
      return true;
    }
    return false;
  }

  function isCreateCommand(commandId) {
    if (!commandId) return false;
    return /create|new|save-as|install/i.test(commandId);
  }

  function openCommandIcon(commandId) {
    if (/settings|editSetting/i.test(commandId)) return I.gear;
    if (/mcp/i.test(commandId)) return I.puzzle;
    if (/Anchor|goTo/i.test(commandId)) return I.bookmark;
    if (/usageMonitor|spending|configure/i.test(commandId)) return I.gauge;
    if (/project/i.test(commandId)) return I.folder;
    return I.doc;
  }

  function toggleRow(id, label, on, settingKey, desc, reorderOpts) {
    return (
      `<div class="row ${on ? 'on' : ''}"${reorderAttrs(reorderOpts)}>` +
      (reorderOpts ? reorderHandle() : '') +
      `<span class="led ${on ? 'on' : ''}"></span>` +
      `<div class="body"><div class="l">${esc(label)}</div>` +
      (desc ? `<div class="d">${esc(desc)}</div>` : '') +
      `</div>` +
      `<div class="sw ${on ? 'on' : ''}" data-act="toggle" data-setting-key="${esc(settingKey)}"></div>` +
      `<span class="state">${on ? 'ON' : 'OFF'}</span></div>`
    );
  }

  function linkRow(icon, label, desc, filePath) {
    return (
      `<div class="row click" data-act="open" data-path="${esc(filePath)}">` +
      `<span class="ic">${icon}</span>` +
      `<div class="body"><div class="l">${esc(label)}</div>` +
      (desc ? `<div class="d">${esc(desc)}</div>` : '') +
      `</div><span class="go">${I.go}</span></div>`
    );
  }

  function actionRow(label, commandId, desc, args, reorderOpts) {
    const argsAttr =
      args != null ? ` data-command-args="${esc(JSON.stringify(args))}"` : '';
    const body =
      `<div class="body"><div class="l">${esc(label)}</div>` +
      (desc ? `<div class="d">${esc(desc)}</div>` : '') +
      `</div>`;

    if (isOpenCommand(commandId)) {
      return (
        `<div class="row click open-act" data-act="runCommand" data-command-id="${esc(commandId)}"${argsAttr}${reorderAttrs(reorderOpts)}>` +
        (reorderOpts ? reorderHandle() : '') +
        `<span class="ic">${openCommandIcon(commandId)}</span>` +
        body +
        `<span class="go">${I.go}</span></div>`
      );
    }

    if (isCreateCommand(commandId)) {
      return (
        `<div class="row click act" data-act="runCommand" data-command-id="${esc(commandId)}"${argsAttr}${reorderAttrs(reorderOpts)}>` +
        (reorderOpts ? reorderHandle() : '') +
        `<span class="ic">${I.plus}</span>` +
        body +
        `</div>`
      );
    }

    return (
      `<div class="row click" data-act="runCommand" data-command-id="${esc(commandId)}"${argsAttr}${reorderAttrs(reorderOpts)}>` +
      (reorderOpts ? reorderHandle() : '') +
      `<span class="ic">${I.bolt}</span>` +
      body +
      `</div>`
    );
  }

  function commandRows(list, emptyTxt) {
    if (!list || !list.length) return `<div class="empty">${esc(emptyTxt || 'Empty')}</div>`;
    return list.map((r) => actionRow(r.label, r.commandId, r.description, r.commandArgs)).join('');
  }

  function projectRows(list, emptyTxt) {
    if (!list || !list.length) return '';
    return list
      .map((p) => actionRow(p.label, 'cursor-toys.projects.open', p.description, [p.entry]))
      .join('');
  }

  function anchorRows(list) {
    if (!list || !list.length) return `<div class="empty">No anchors in workspace</div>`;
    return list
      .map((a) =>
        actionRow(`${a.fileName}:${a.line + 1}`, 'cursor-toys.goToAnchor', a.preview, [a.filePath, a.line])
      )
      .join('');
  }

  function fileRows(list, icon, emptyTxt) {
    if (!list.length) return `<div class="empty">${esc(emptyTxt || 'Empty')}</div>`;
    return list.map((f) => linkRow(icon, f.name, f.description || '', f.path)).join('');
  }

  function ucolor(p) {
    return p < 50 ? 'var(--led-on)' : p < 80 ? '#e8b339' : '#e0706b';
  }

  function urow(label, pct, extra) {
    if (pct == null) return '';
    const c = ucolor(pct);
    const w = Math.max(2, Math.min(100, pct));
    return (
      `<div class="urow"><span class="ulbl">${esc(label)}</span>` +
      `<span class="ubar"><span class="ufill" style="width:${w}%;background:${c}"></span></span>` +
      `<span class="upct" style="color:${c}">${Math.round(pct)}%</span>` +
      `<span class="uext">${esc(extra || '')}</span></div>`
    );
  }

  function settingsItemRows(items, depth, reorderScope) {
    depth = depth || 0;
    let body = '';
    for (const item of items || []) {
      const opts = reorderScope ? { id: item.id, scope: reorderScope } : null;
      if (item.kind === 'action' && item.commandId) {
        body += actionRow(item.label, item.commandId, item.description, undefined, opts);
      } else if (item.kind === 'setting' && item.settingKey) {
        if (item.settingType === 'boolean') {
          body += toggleRow(item.id, item.label, !!item.boolValue, item.settingKey, item.description, opts);
        } else {
          body += actionRow(item.label, 'cursor-toys.settings.editSetting', item.description, [item.settingKey], opts);
        }
      } else if (item.kind === 'category' && item.children && item.children.length) {
        const nestedScope = reorderScope ? reorderScope + '/' + item.id : '';
        body +=
          `<div class="scope" style="padding-top:${depth ? 6 : 8}px">` +
          `<span class="dot"></span>${esc(item.label)}</div>`;
        body += settingsItemRows(item.children, depth + 1, nestedScope);
      }
    }
    return body;
  }

  function countSettingsItems(items) {
    let n = 0;
    for (const item of items || []) {
      if (item.kind === 'action' || item.kind === 'setting') {
        n += 1;
      }
      if (item.children && item.children.length) {
        n += countSettingsItems(item.children);
      }
    }
    return n;
  }

  function buildPersonal(model) {
    const p = model.personal;
    let h = `<div class="scope"><span class="dot"></span>Personal<span class="path">${esc(p.scopeLabel)}</span></div>`;

    h += section(
      'p-cmd',
      I.terminal,
      'Commands',
      p.commands.length,
      fileRows(p.commands, I.terminal, 'No personal commands') +
        actionRow('New personal command', 'cursor-toys.save-as-user-command')
    );
    h += section(
      'p-prm',
      I.doc,
      'Prompts',
      p.prompts.length,
      fileRows(p.prompts, I.doc, 'No personal prompts') +
        actionRow('New personal prompt', 'cursor-toys.save-as-user-prompt')
    );
    h += section(
      'p-skl',
      I.sparkle,
      'Skills',
      p.skills.length,
      fileRows(p.skills, I.sparkle, 'No personal skills') +
        actionRow('New personal skill', 'cursor-toys.save-as-user-skill')
    );
    h += section(
      'p-rules',
      I.doc,
      'Rules',
      p.rules.length,
      fileRows(p.rules, I.doc, 'No personal rules')
    );
    h += section(
      'p-note',
      I.doc,
      'Notepads',
      p.notepads.length,
      fileRows(p.notepads, I.doc, 'No notepads') +
        actionRow('New notepad', 'cursor-toys.createNotepad')
    );
    h += section(
      'p-kanban',
      I.doc,
      'Kanban',
      p.kanban.length,
      fileRows(p.kanban, I.doc, 'No kanban cards') +
        actionRow('Open kanban board', 'cursor-toys.openKanbanBoard') +
        actionRow('New kanban card', 'cursor-toys.createKanbanCard')
    );
    h += section(
      'p-plans',
      I.doc,
      'Plans',
      p.plans.length,
      fileRows(p.plans, I.doc, 'No plans')
    );
    h += section(
      'p-hooks',
      I.bolt,
      'Hooks',
      p.hooks.length,
      fileRows(p.hooks, I.bolt, 'No hooks.json') +
        actionRow('Create hooks file', 'cursor-toys.createHooksFile')
    );
    h += section(
      'p-mcpb',
      I.puzzle,
      'MCPB Packages',
      p.mcpb.length,
      fileRows(p.mcpb, I.puzzle, 'No MCPB packages') +
        actionRow('Install MCPB package', 'cursor-toys.installMcpb')
    );

    const clip = p.clipboard || {};
    h += section('p-clip-hist', I.clippy, 'Clipboard history', (clip.history || []).length, commandRows(clip.history, 'Copy text in the editor to fill history'));
    h += section('p-clip-slots', I.clippy, 'Snippet slots', (clip.slots || []).length, commandRows(clip.slots, 'No snippets saved'));
    h += section('p-clip-global', I.terminal, 'Global commands', (clip.globalCommands || []).length, commandRows(clip.globalCommands, 'No saved commands'));
    h += section('p-clip-ws', I.terminal, 'Workspace commands', (clip.workspaceCommands || []).length, commandRows(clip.workspaceCommands, 'No workspace commands'));

    const proj = p.projects || { enabled: true, actions: [], pinned: [], recent: [] };
    let projBody = (proj.actions || []).map((a) => actionRow(a.label, a.commandId, a.description)).join('');
    if (!proj.enabled) {
      projBody += `<div class="empty">Enable Projects in Settings</div>`;
    } else {
      if ((proj.pinned || []).length) {
        projBody += `<div class="scope" style="padding-top:8px"><span class="dot"></span>Pinned</div>`;
        projBody += projectRows(proj.pinned) || '';
      }
      if ((proj.recent || []).length) {
        projBody += `<div class="scope" style="padding-top:8px"><span class="dot"></span>Recent</div>`;
        projBody += projectRows(proj.recent) || '';
      }
      if (!(proj.pinned || []).length && !(proj.recent || []).length) {
        projBody += `<div class="empty">Pin workspaces to see them here</div>`;
      }
    }
    h += section('p-projects', I.folder, 'Projects', (proj.pinned || []).length + (proj.recent || []).length, projBody);

    const anchors = p.codeAnchors || { enabled: true, anchors: [], actions: [] };
    let anchorBody = (anchors.actions || []).map((a) => actionRow(a.label, a.commandId, a.description)).join('');
    if (!anchors.enabled) {
      anchorBody += `<div class="empty">Code anchors disabled</div>`;
    } else {
      anchorBody += anchorRows(anchors.anchors || []);
    }
    h += section('p-anchors', I.bookmark, 'Code anchors', (anchors.anchors || []).length, anchorBody);

    for (const cat of p.utils || []) {
      const catId = 'p-utils-' + cat.id;
      const body =
        (cat.children || [])
          .map((c) => actionRow(c.label, c.commandId || '', c.description))
          .join('') || '<div class="empty">No actions</div>';
      h += section(catId, I.wand, cat.label, (cat.children || []).length, body);
    }

    return h;
  }

  function buildConfig(model) {
    const c = model.config || { shortcuts: [], settingsCategories: [] };
    let h =
      `<div class="scope"><span class="dot"></span>Config<span class="path">settings · shortcuts</span></div>`;

    const shortcutBody =
      (c.shortcuts || [])
        .map((a) => actionRow(a.label, a.commandId, a.description, undefined, { id: a.id, scope: 'cfg-shortcuts' }))
        .join('') || '<div class="empty">No shortcuts</div>';
    h += section('cfg-shortcuts', I.bolt, 'Shortcuts', (c.shortcuts || []).length, shortcutBody);

    for (const cat of c.settingsCategories || []) {
      const catId = 'cfg-' + cat.id;
      const reorderScope = 'cfg-categories/' + cat.id;
      const body = settingsItemRows(cat.children || [], 0, reorderScope) || '<div class="empty">No items</div>';
      h += section(catId, I.gear, cat.label, countSettingsItems(cat.children), body);
    }

    return h;
  }

  function buildProjects(model) {
    if (!model.projects.length) {
      return (
        `<div class="scope"><span class="dot" style="background:var(--mute2);box-shadow:none"></span>Project</div>` +
        `<div class="empty">Open a workspace folder to see project assets</div>`
      );
    }
    let h = '';
    model.projects.forEach((p, idx) => {
      const sk = 'pr' + idx;
      h += `<div class="scope"><span class="dot"></span>${esc(p.name)}<span class="path">.${esc(model.baseFolder || 'cursor')}</span></div>`;
      h += section(secId(sk, 'cmd'), I.terminal, 'Commands', p.commands.length, fileRows(p.commands, I.terminal, 'No project commands'));
      h += section(secId(sk, 'prm'), I.doc, 'Prompts', p.prompts.length, fileRows(p.prompts, I.doc, 'No project prompts'));
      h += section(secId(sk, 'rules'), I.doc, 'Rules', p.rules.length, fileRows(p.rules, I.doc, 'No project rules'));
      h += section(secId(sk, 'skl'), I.sparkle, 'Skills', p.skills.length, fileRows(p.skills, I.sparkle, 'No project skills'));
      h += section(
        secId(sk, 'http'),
        I.globe,
        'HTTP',
        p.http.length,
        fileRows(p.http, I.globe, 'No HTTP requests') +
          actionRow('New HTTP request', 'cursor-toys.newHttpRequest')
      );
      h += section(
        secId(sk, 'note'),
        I.doc,
        'Notepads',
        p.notepads.length,
        fileRows(p.notepads, I.doc, 'No notepads') +
          actionRow('New notepad', 'cursor-toys.createNotepad')
      );
      h += section(
        secId(sk, 'kanban'),
        I.doc,
        'Kanban',
        p.kanban.length,
        fileRows(p.kanban, I.doc, 'No kanban cards') +
          actionRow('Open kanban board', 'cursor-toys.openKanbanBoard') +
          actionRow('New kanban card', 'cursor-toys.createKanbanCard')
      );
      h += section(secId(sk, 'plans'), I.doc, 'Plans', p.plans.length, fileRows(p.plans, I.doc, 'No plans'));
      h += section(
        secId(sk, 'hooks'),
        I.bolt,
        'Hooks',
        p.hooks.length,
        fileRows(p.hooks, I.bolt, 'No hooks.json') +
          actionRow('Create hooks file', 'cursor-toys.createHooksFile')
      );
    });
    return h;
  }

  function buildUsage(model) {
    let h = `<div class="scope"><span class="dot"></span>Usage<span class="path">live · ${pollSeconds}s</span></div>`;
    const sections = model.usageSections || [];
    if (!sections.length) {
      return h + '<div class="empty">No usage data</div>';
    }
    for (const sec of sections) {
      h += `<div class="scope"><span class="dot"></span>${esc(sec.title)}</div>`;
      let bars = (sec.bars || []).map((b) => urow(b.label, b.percent, b.extra)).join('');
      if (!bars && sec.error) {
        bars = `<div class="err">${esc(sec.error)}</div>`;
      } else if (!bars) {
        bars = '<div class="empty">No data</div>';
      }
      h += `<div class="usebox">${bars}</div>`;
      const actions = (sec.actions || []).map((a) => actionRow(a.label, a.commandId, a.description)).join('');
      if (actions) h += actions;
      h += '<div class="divider"></div>';
    }
    return h;
  }

  function tabBtn(id, label, iconHtml, title) {
    const content = iconHtml || esc(label);
    const cls = iconHtml ? ' tab-icon' : '';
    const tip = title ? ` title="${esc(title)}"` : '';
    return `<button class="tab${activeTab === id ? ' on' : ''}${cls}" data-tab="${id}"${tip}>${content}</button>`;
  }

  function render() {
    const model = currentModel;
    if (!model) return;

    let h = '<div class="top">';
    h +=
      `<div class="hdr"><span class="mark">${I.mark}</span>` +
      `<div class="title"><b>CursorToys</b><span>v${esc(model.version || '')} · control panel</span></div>` +
      `<span class="spacer"></span>` +
      `<button class="iconbtn" id="refresh" title="Refresh">${I.refresh}</button></div>`;
    h += `<div class="tabs">${tabBtn('personal', 'Personal')}${tabBtn('project', 'Project')}${tabBtn('usage', 'Usage')}${tabBtn('config', '', `<span class="tab-ic">${I.gear}</span>`, 'Config')}</div>`;
    if (activeTab !== 'usage') {
      h +=
        `<div class="searchwrap"><span class="sic">${I.search}</span>` +
        `<input id="search" class="search" type="text" placeholder="Filter…" /></div>`;
    }
    h += '</div>';

    let content = '';
    if (activeTab === 'personal') content = buildPersonal(model);
    else if (activeTab === 'project') content = buildProjects(model);
    else if (activeTab === 'config') content = buildConfig(model);
    else content = buildUsage(model);
    h += `<div class="fade">${content}</div>`;

    app.innerHTML = h;
    bind();
    applyFilter();
  }

  function applyFilter() {
    const q = (searchQuery || '').trim().toLowerCase();
    app.querySelectorAll('.sec').forEach((sec) => {
      const id = sec.getAttribute('data-secwrap');
      let any = false;
      sec.querySelectorAll('.row, .empty, .err').forEach((r) => {
        const isAct = r.classList.contains('act');
        const isEmpty = r.classList.contains('empty');
        if (q && isAct) {
          r.style.display = 'none';
          return;
        }
        const match = !q || r.textContent.toLowerCase().includes(q);
        r.style.display = match ? '' : 'none';
        if (match && !isAct && !isEmpty) any = true;
      });
      if (q) {
        sec.style.display = any ? '' : 'none';
        sec.classList.toggle('collapsed', !any);
      } else {
        sec.style.display = '';
        sec.classList.toggle('collapsed', !!collapsed[id]);
      }
    });
  }

  let clickBound = false;
  function bind() {
    const r = document.getElementById('refresh');
    if (r) {
      r.addEventListener('click', () => {
        r.classList.add('spin');
        setTimeout(() => r.classList.remove('spin'), 600);
        vscode.postMessage({ type: 'refresh' });
      });
    }
    const si = document.getElementById('search');
    if (si) {
      si.value = searchQuery;
      si.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        applyFilter();
      });
    }
    if (!clickBound) {
      app.addEventListener('click', onClick);
      clickBound = true;
    }
    bindDragReorder();
  }

  function bindDragReorder() {
    app.querySelectorAll('.drag').forEach((handle) => {
      handle.addEventListener('dragstart', (e) => {
        const row = handle.closest('[data-reorder-id]');
        if (!row) return;
        dragState = {
          id: row.getAttribute('data-reorder-id'),
          scope: row.getAttribute('data-reorder-scope'),
        };
        row.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', dragState.id);
        }
      });
      handle.addEventListener('dragend', () => {
        app.querySelectorAll('.dragging,.drag-over').forEach((el) => {
          el.classList.remove('dragging', 'drag-over');
        });
        dragState = null;
      });
    });

    app.querySelectorAll('[data-reorder-id]').forEach((row) => {
      row.addEventListener('dragover', (e) => {
        if (!dragState || dragState.scope !== row.getAttribute('data-reorder-scope')) return;
        e.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (!dragState || dragState.scope !== row.getAttribute('data-reorder-scope')) return;
        const targetId = row.getAttribute('data-reorder-id');
        if (!targetId || dragState.id === targetId) return;
        const scope = dragState.scope;
        const rows = [...app.querySelectorAll(`[data-reorder-scope="${scope}"]`)];
        const ids = rows.map((r) => r.getAttribute('data-reorder-id')).filter(Boolean);
        const from = ids.indexOf(dragState.id);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, dragState.id);
        vscode.postMessage({ type: 'reorder', scope, orderedIds: ids });
      });
    });
  }

  function onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab && app.contains(tab)) {
      const id = tab.getAttribute('data-tab');
      if (id !== activeTab) {
        activeTab = id;
        saveState();
        render();
      }
      return;
    }
    const sec = e.target.closest('[data-sec]');
    if (sec && app.contains(sec)) {
      const id = sec.getAttribute('data-sec');
      const wrap = app.querySelector(`[data-secwrap="${id}"]`);
      const nowCol = !wrap.classList.contains('collapsed');
      wrap.classList.toggle('collapsed', nowCol);
      collapsed[id] = nowCol;
      saveState();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && app.contains(act)) {
      if (act.classList.contains('drag')) return;
      const type = act.getAttribute('data-act');
      if (type === 'open') {
        vscode.postMessage({ type: 'open', path: act.getAttribute('data-path') });
      } else if (type === 'toggle') {
        vscode.postMessage({ type: 'toggle', settingKey: act.getAttribute('data-setting-key') });
      } else if (type === 'runCommand') {
        vscode.postMessage({
          type: 'runCommand',
          commandId: act.getAttribute('data-command-id'),
          commandArgs: act.getAttribute('data-command-args') || undefined,
        });
      }
    }
  }

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'data') {
      currentModel = m.model;
      if (m.model.pollSeconds) pollSeconds = m.model.pollSeconds;
      render();
    } else if (m.type === 'error') {
      app.innerHTML = `<div class="boot">Error: ${esc(m.message)}</div>`;
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
