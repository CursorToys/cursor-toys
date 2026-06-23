(function () {
  const vscode = acquireVsCodeApi();
  let state = window.__CURSOR_PET_STATE__ || {
    viewModel: {},
    bridgeInstalled: false,
    debugMode: false,
    lowVitalsThreshold: 25,
  };

  const EGGS = ['ember', 'mist', 'moss'];
  const EGG_LABELS = { ember: 'Ember', mist: 'Mist', moss: 'Moss' };
  const EGG_COLORS = { ember: '#e85d4c', mist: '#7eb6ff', moss: '#6fbf73' };
  const EGG_SHINE = { ember: '#ffb4a8', mist: '#cfe4ff', moss: '#b8e8bc' };
  const PET_COLORS = { chatling: '#c084fc', coder: '#38bdf8', balanced: '#fbbf24' };
  const HAPPY_ANIMS = ['walk', 'run', 'jump', 'hide', 'playDead', 'sit', 'paw'];

  const GBC = {
    bezel: '#3a2858',
    frame: '#5a4080',
    frameHi: '#7a58a8',
    sky: '#90d0f8',
    skyHi: '#c0ecff',
    grass: '#58c848',
    grassMid: '#40a838',
    grassDark: '#287820',
    hudBg: '#f2ead8',
    hudPanel: '#e8dcc8',
    ink: '#1c1030',
    shadow: '#483068',
    barTrack: '#c8b8d0',
    bubble: '#fffaf0',
    stone: '#9090b0',
    stoneDark: '#606080',
    stoneHi: '#c0c0d8',
    btnFace: '#faf4e8',
    btnPressed: '#d0c4b0',
    btnAction: '#58a8f0',
    btnActionHi: '#88d0ff',
    btnActionDark: '#3070c0',
    hatch: '#f85898',
    hatchHi: '#ffa8c8',
    eyeHi: '#ffffff',
    sceneTop: 18,
    sceneBottom: 152,
    hudTop: 156,
  };

  const canvas = document.getElementById('pet-canvas');
  const ctx = canvas.getContext('2d');

  const backpackRoot = document.getElementById('pet-backpack');
  const backpackToggleEl = document.getElementById('backpack-toggle');
  const backpackPanelEl = document.getElementById('backpack-panel');
  let backpackOpen = false;

  function syncBackpackDom() {
    if (!backpackRoot || !backpackToggleEl || !backpackPanelEl) {
      return;
    }
    if (backpackOpen) {
      backpackRoot.classList.remove('collapsed');
      backpackPanelEl.removeAttribute('hidden');
      backpackToggleEl.setAttribute('aria-expanded', 'true');
    } else {
      backpackRoot.classList.add('collapsed');
      backpackPanelEl.setAttribute('hidden', '');
      backpackToggleEl.setAttribute('aria-expanded', 'false');
    }
  }

  function setBackpackOpen(open) {
    backpackOpen = Boolean(open);
    syncBackpackDom();
  }

  function closeBackpack() {
    if (!backpackOpen) {
      syncBackpackDom();
      return;
    }
    setBackpackOpen(false);
  }

  function toggleBackpack() {
    setBackpackOpen(!backpackOpen);
  }

  syncBackpackDom();

  let carouselIndex = 0;
  let anim = { name: 'walk', until: 0, started: 0 };
  let pressedBtn = null;
  let lastPhase = '';
  let bubble = { emojis: null, showUntil: 0, nextAt: 0 };

  const pickerLayout = {
    left: { x: 28, y: 122, w: 32, h: 24 },
    right: { x: 260, y: 122, w: 32, h: 24 },
    select: { x: 118, y: 122, w: 84, h: 24 },
  };

  const toolbarLayout = {
    refresh: { x: 206, y: 18, w: 46, h: 16 },
    newEgg: { x: 256, y: 18, w: 40, h: 16 },
    debug: { x: 18, y: 18, w: 38, h: 16 },
  };

  const AGENT_MSGS = ['💻🤖', '⌨️✨', '🖥️⚡', '🧠💾', '🔧📡'];
  let agentBubble = { emojis: null, showUntil: 0, nextAt: 0 };

  const deadNewEggLayout = { x: 98, y: 112, w: 124, h: 28 };

  let clickTracker = {
    times: [],
    reaction: null,
    until: 0,
    angryStarted: 0,
    angryNotified: false,
    notifyAt: 0,
  };
  let totalClicks = 0;
  let easterEggShown = { owl: false, party: false };

  const ANGRY_CLICKS = 5;
  const CLICK_WINDOW_MS = 2000;
  const ANGRY_SWEAR_EMOJIS = ['🤬💢😡', '🖕💥👿', '😤🔥💀', '💢🤬💥'];
  const ANGRY_SWEAR_MS = 1200;

  const INVENTORY_ITEMS = [
    {
      id: 'code',
      emoji: '🍖',
      name: 'Code edits',
      effect: 'FEED',
      mode: 'auto',
      tip: 'Save files while coding',
    },
    {
      id: 'shell',
      emoji: '⌨️',
      name: 'Terminal hook',
      effect: 'FEED',
      mode: 'hook',
      tip: 'afterShellExecution',
    },
    {
      id: 'stop',
      emoji: '🛑',
      name: 'Agent stop',
      effect: 'FEED+',
      mode: 'auto',
      tip: 'Bonus happiness on stop',
    },
    {
      id: 'chat',
      emoji: '💬',
      name: 'Agent chat',
      effect: 'PLAY',
      mode: 'auto',
      tip: 'Prompts & responses',
    },
    {
      id: 'mcp',
      emoji: '🔧',
      name: 'MCP / tools',
      effect: 'PLAY',
      mode: 'auto',
      tip: 'Explore activity',
    },
    {
      id: 'script',
      emoji: '📜',
      name: 'petFeed script',
      effect: 'HOOK',
      mode: 'hook',
      tip: 'node cursor-pet-feed.js',
    },
  ];

  function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 10) {
      return 'morning';
    }
    if (h >= 10 && h < 17) {
      return 'day';
    }
    if (h >= 17 && h < 20) {
      return 'sunset';
    }
    return 'night';
  }

  function getSkyPalette() {
    const tod = getTimeOfDay();
    if (tod === 'morning') {
      return {
        sky: '#f8c878',
        skyHi: '#ffe8b8',
        grass: '#60c050',
        grassMid: '#48a838',
        grassDark: '#307820',
        ink: '#1c1030',
      };
    }
    if (tod === 'sunset') {
      return {
        sky: '#e87858',
        skyHi: '#f8a888',
        grass: '#50b040',
        grassMid: '#389028',
        grassDark: '#286018',
        ink: '#1c1030',
      };
    }
    if (tod === 'night') {
      return {
        sky: '#283868',
        skyHi: '#485888',
        grass: '#286020',
        grassMid: '#204818',
        grassDark: '#183010',
        ink: '#e8e8f8',
      };
    }
    return {
      sky: GBC.sky,
      skyHi: GBC.skyHi,
      grass: GBC.grass,
      grassMid: GBC.grassMid,
      grassDark: GBC.grassDark,
      ink: GBC.ink,
    };
  }

  function drawPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  function drawPixelGrid(cx, cy, rows, color, scale) {
    const s = scale || 2;
    let y = cy;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let x = cx - (row.length * s) / 2;
      for (let j = 0; j < row.length; j++) {
        if (row[j] === '1') {
          drawPixelRect(x, y, s, s, color);
        }
        x += s;
      }
      y += s;
    }
  }

  function gbText(text, x, y, size, ink) {
    ctx.fillStyle = ink || GBC.ink;
    ctx.font = 'bold ' + (size || 9) + 'px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  function drawNightStars() {
    const stars = [
      [40, 28],
      [80, 42],
      [120, 24],
      [200, 36],
      [240, 22],
      [280, 44],
    ];
    for (let i = 0; i < stars.length; i++) {
      const flicker = Math.sin(Date.now() / 400 + i) > 0 ? GBC.eyeHi : '#c8d8f8';
      drawPixelRect(stars[i][0], stars[i][1], 2, 2, flicker);
    }
  }

  function drawSunOrMoon(palette) {
    const tod = getTimeOfDay();
    if (tod === 'night') {
      drawPixelRect(268, 30, 14, 14, '#f8f0c8');
      drawPixelRect(272, 30, 8, 14, palette.sky);
    } else if (tod === 'morning' || tod === 'sunset') {
      drawPixelRect(48, 34, 12, 12, '#f8e040');
    }
  }

  function drawGameBoyShell() {
    const palette = getSkyPalette();
    drawPixelRect(0, 0, 320, 240, GBC.bezel);
    drawPixelRect(6, 6, 308, 228, GBC.frame);
    drawPixelRect(10, 10, 300, 220, GBC.frameHi);
    drawPixelRect(14, 14, 292, GBC.hudTop - 16, palette.sky);
    drawPixelRect(14, 52, 292, 48, palette.skyHi);
    if (getTimeOfDay() === 'night') {
      drawNightStars();
    }
    drawSunOrMoon(palette);
    drawPixelRect(14, GBC.hudTop - 2, 292, 2, GBC.shadow);
    drawPixelRect(14, GBC.hudTop, 292, 82, GBC.hudBg);
    drawPixelRect(14, GBC.hudTop + 2, 292, 78, GBC.hudPanel);
    gbText('CURSOR PET', 20, 16, 8, palette.ink);
    drawPixelRect(198, 14, 102, 22, palette.skyHi);
    drawPixelRect(198, 14, 102, 2, GBC.shadow);
  }

  function drawPoop(vm) {
    if (!vm.poop || vm.phase !== 'alive') {
      return;
    }
    for (let i = 0; i < vm.poop; i++) {
      const px = 120 + i * 28;
      const py = GBC.sceneBottom - 24;
      drawPixelRect(px, py, 10, 8, '#8b5a2b');
      drawPixelRect(px + 2, py - 4, 6, 4, '#8b5a2b');
    }
  }

  function drawSleepOverlay(vm) {
    if (vm.phase !== 'alive' || !vm.sleeping) {
      return;
    }
    if (vm.lightsOn) {
      ctx.fillStyle = 'rgba(40, 20, 80, 0.35)';
      ctx.fillRect(14, GBC.sceneTop, 292, GBC.sceneBottom - GBC.sceneTop);
    }
    if (vm.lightsOn) {
      drawSpeechBubble(160, 40, '💤🌙', 0.9);
    }
  }
  function drawSceneGround() {
    const palette = getSkyPalette();
    const groundY = GBC.sceneBottom - 18;
    drawPixelRect(14, groundY, 292, 2, palette.grassDark);
    drawPixelRect(14, groundY + 2, 292, GBC.sceneBottom - groundY - 2, palette.grass);
    drawPixelRect(14, groundY + 4, 292, GBC.sceneBottom - groundY - 6, palette.grassMid);
    drawPixelRect(40, groundY - 14, 28, 14, palette.grassDark);
    drawPixelRect(250, groundY - 16, 24, 16, palette.grassDark);
    drawPixelRect(44, groundY - 10, 10, 8, palette.grass);
    drawPixelRect(254, groundY - 12, 8, 10, palette.grass);
  }

  function drawHudBar(x, y, label, value, maxVal, fillDark, fillLight) {
    const barW = 108;
    const barH = 10;
    gbText(label, x, y);
    drawPixelRect(x, y + 11, barW, barH, GBC.shadow);
    drawPixelRect(x + 1, y + 12, barW - 2, barH - 2, GBC.barTrack);
    const fillW = Math.max(0, Math.min(barW - 2, Math.round(((value / maxVal) * (barW - 2)) || 0)));
    if (fillW > 0) {
      drawPixelRect(x + 1, y + 12, fillW, barH - 2, fillLight);
      if (fillW > 3) {
        drawPixelRect(x + 1, y + 12, fillW, 3, fillDark);
      }
    }
    gbText(Math.round(value) + '%', x + barW + 6, y + 10, 8);
  }

  function drawHudHearts(x, y, label, value, fillColor) {
    gbText(label, x, y);
    for (let i = 0; i < 4; i++) {
      const hx = x + 34 + i * 14;
      const hy = y + 10;
      const segment = Math.min(1, Math.max(0, (value - i * 25) / 25));
      drawPixelRect(hx, hy, 12, 10, GBC.barTrack);
      if (segment > 0) {
        const fw = Math.max(2, Math.round(10 * segment));
        drawPixelRect(hx + 1, hy + 1, fw, 8, fillColor);
      }
      drawPixelRect(hx + 2, hy - 2, 4, 3, segment > 0 ? fillColor : GBC.barTrack);
      drawPixelRect(hx + 6, hy - 2, 4, 3, segment > 0 ? fillColor : GBC.barTrack);
    }
  }

  function drawGameBoyHud(vm) {
    const y = GBC.hudTop + 8;
    const phaseLabel =
      vm.phase === 'egg_selection'
        ? 'PICK EGG'
        : vm.phase === 'incubating'
          ? 'INCUBATE'
          : vm.phase === 'alive'
            ? (vm.lifeStage || 'ALIVE').toUpperCase()
            : vm.phase === 'dead'
              ? 'R.I.P.'
              : '---';

    gbText('STATUS ' + phaseLabel, 20, y);
    if (vm.phase === 'alive') {
      gbText('D' + (vm.gameDay || 0).toFixed(1), 200, y);
    } else if (vm.archetype) {
      gbText(vm.archetype.toUpperCase(), 200, y);
    } else if (vm.selectedEgg) {
      gbText(vm.selectedEgg.toUpperCase(), 200, y);
    }

    const row2 = y + 18;
    if (vm.phase === 'incubating') {
      const pct =
        vm.incubationTarget > 0
          ? Math.round((vm.incubationProgress / vm.incubationTarget) * 100)
          : 0;
      gbText('HATCH', 20, row2);
      drawPixelRect(68, row2 + 11, 220, 10, GBC.shadow);
      drawPixelRect(69, row2 + 12, 218, 8, GBC.barTrack);
      const fw = Math.round((pct / 100) * 218);
      if (fw > 0) {
        drawPixelRect(69, row2 + 12, fw, 8, GBC.hatch);
        drawPixelRect(69, row2 + 12, fw, 3, GBC.hatchHi);
      }
      gbText(
        Math.round(vm.incubationProgress) + '/' + Math.round(vm.incubationTarget),
        20,
        row2 + 26,
        8
      );
    } else if (vm.phase === 'alive' || vm.phase === 'dead') {
      const hungerVal = vm.hunger != null ? vm.hunger : 0;
      const happyVal = vm.happiness != null ? vm.happiness : 0;
      drawHudHearts(20, row2, 'HUN', hungerVal, '#f8a030');
      drawHudHearts(168, row2, 'JOY', happyVal, '#f878a8');
    } else if (vm.phase === 'egg_selection') {
      gbText('Choose your egg below', 20, row2 + 4);
    }

    const row3 = y + 52;
    if (vm.needsAttention && vm.phase === 'alive') {
      gbText('!! ATTENTION !!', 20, row3);
    } else if (vm.sick && vm.phase === 'alive') {
      gbText('!! SICK !!', 20, row3);
    } else if (vm.tantrum && vm.phase === 'alive') {
      gbText('!! TANTRUM !!', 20, row3);
    } else if (vm.sleeping && vm.lightsOn && vm.phase === 'alive') {
      gbText('ZZZ LIGHTS ON', 20, row3);
    } else if (!state.bridgeInstalled) {
      gbText('! HOOKS OFF', 20, row3);
    } else if (vm.lowVitalsWarning && vm.phase === 'alive') {
      gbText('! NEEDS CARE', 20, row3);
    } else if (vm.agentActive && vm.phase === 'alive') {
      gbText('Agent working...', 20, row3);
    } else if (vm.phase === 'incubating') {
      gbText('Code & chat to hatch', 20, row3);
    } else if (vm.phase === 'dead') {
      gbText('Press NEW EGG below', 20, row3);
    } else if (vm.phase === 'alive') {
      gbText('Keep coding together!', 20, row3);
    }
  }

  function drawRoundedEgg(cx, cy, skin, wobble, scale) {
    const color = EGG_COLORS[skin] || '#ddd';
    const shine = EGG_SHINE[skin] || '#ffffff88';
    const bob = Math.sin(wobble) * 3;
    const y = cy + bob;
    const s = scale || 1;
    const layers = [
      { w: 10, h: 4, dy: -26 },
      { w: 18, h: 6, dy: -22 },
      { w: 26, h: 8, dy: -16 },
      { w: 32, h: 10, dy: -8 },
      { w: 34, h: 12, dy: 2 },
      { w: 32, h: 12, dy: 14 },
      { w: 26, h: 10, dy: 26 },
      { w: 16, h: 6, dy: 36 },
    ];
    for (const layer of layers) {
      drawPixelRect(cx - (layer.w * s) / 2, y + layer.dy * s, layer.w * s, layer.h * s, color);
    }
    drawPixelRect(cx - 6 * s, y - 20 * s, 10 * s, 4 * s, shine);
    drawPixelRect(cx + 2 * s, y - 14 * s, 6 * s, 3 * s, '#ffffff44');
  }

  function drawTombstone(cx, cy) {
    const x = Math.floor(cx);
    const y = Math.floor(cy);
    drawPixelRect(x - 22, y - 8, 44, 40, GBC.stoneDark);
    drawPixelRect(x - 18, y - 28, 36, 22, GBC.stone);
    drawPixelRect(x - 14, y - 24, 28, 8, GBC.stoneHi);
    ctx.fillStyle = GBC.ink;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RIP', x, y - 12);
    ctx.font = '14px monospace';
    ctx.fillText('💀', x, y + 10);
  }

  function drawComputerBubble(cx, cy, emojis, alpha) {
    const a = alpha == null ? 1 : alpha;
    if (a <= 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '14px monospace';
    const padX = 8;
    const tw = ctx.measureText(emojis).width;
    const bw = tw + padX * 2 + 8;
    const bh = 26;
    const bx = Math.floor(cx - bw / 2);
    const by = Math.floor(cy - bh - 8);

    drawPixelRect(bx, by, bw, bh, GBC.shadow);
    drawPixelRect(bx + 2, by + 2, bw - 4, bh - 4, '#2a1848');
    drawPixelRect(bx + 4, by + 4, bw - 8, 3, GBC.btnAction);
    drawPixelRect(bx + 4, by + bh - 7, 5, 3, GBC.hatch);
    drawPixelRect(bx + bw - 9, by + bh - 7, 5, 3, GBC.hatch);

    ctx.fillStyle = '#88f8d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojis, cx, by + bh / 2 + 2);
    ctx.restore();
  }

  function drawSpeechBubble(cx, cy, emojis, alpha) {
    const a = alpha == null ? 1 : alpha;
    if (a <= 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '16px monospace';
    const padX = 8;
    const tw = ctx.measureText(emojis).width;
    const bw = tw + padX * 2;
    const bh = 24;
    const bx = Math.floor(cx - bw / 2);
    const by = Math.floor(cy - bh - 8);

    drawPixelRect(bx, by, bw, bh, GBC.bubble);
    drawPixelRect(bx, by, bw, 2, GBC.shadow);
    drawPixelRect(bx, by + bh - 2, bw, 2, GBC.shadow);
    drawPixelRect(bx, by, 2, bh, GBC.shadow);
    drawPixelRect(bx + bw - 2, by, 2, bh, GBC.shadow);
    drawPixelRect(cx - 3, by + bh, 6, 4, GBC.bubble);
    drawPixelRect(cx - 1, by + bh + 4, 2, 3, GBC.bubble);

    ctx.fillStyle = GBC.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojis, cx, by + bh / 2);
    ctx.restore();
  }

  function getMoodEmojis(vm) {
    const threshold = state.lowVitalsThreshold || 25;
    if (vm.phase !== 'alive') {
      return null;
    }
    const hungry = vm.hunger < threshold;
    const sad = vm.happiness < threshold;
    if (hungry && sad) {
      return '🍖😢';
    }
    if (hungry) {
      return '🍖😋';
    }
    if (sad) {
      return '😢💔';
    }
    if (vm.hunger >= 60 && vm.happiness >= 60) {
      return '😊✨';
    }
    return '🙂👍';
  }

  function updateSpeechBubble(vm, now) {
    if (vm.agentActive || vm.phase !== 'alive') {
      bubble.emojis = null;
      bubble.showUntil = 0;
      return;
    }
    if (bubble.emojis && now < bubble.showUntil) {
      return;
    }
    if (bubble.emojis && now >= bubble.showUntil) {
      bubble.emojis = null;
    }
    if (now < bubble.nextAt) {
      return;
    }
    const mood = getMoodEmojis(vm);
    if (mood) {
      bubble.emojis = mood;
      bubble.showUntil = now + 2200 + Math.random() * 1800;
      bubble.nextAt = bubble.showUntil + 5000 + Math.random() * 7000;
    } else {
      bubble.nextAt = now + 4000;
    }
  }

  function getBubbleAlpha(now) {
    if (!bubble.emojis || now >= bubble.showUntil) {
      return 0;
    }
    const remaining = bubble.showUntil - now;
    if (remaining < 400) {
      return remaining / 400;
    }
    if (now - (bubble.showUntil - 2200) < 300) {
      return (now - (bubble.showUntil - 2200)) / 300;
    }
    return 1;
  }

  function updateAgentBubble(vm, now) {
    if (!vm.agentActive || vm.phase !== 'alive') {
      agentBubble = { emojis: null, showUntil: 0, nextAt: 0 };
      return;
    }
    if (agentBubble.emojis && now < agentBubble.showUntil) {
      return;
    }
    if (agentBubble.emojis && now >= agentBubble.showUntil) {
      agentBubble.emojis = null;
    }
    if (now < agentBubble.nextAt) {
      return;
    }
    const idx = Math.floor(now / 3200) % AGENT_MSGS.length;
    agentBubble.emojis = AGENT_MSGS[idx];
    agentBubble.showUntil = now + 2400 + Math.random() * 1200;
    agentBubble.nextAt = agentBubble.showUntil + 1800 + Math.random() * 2000;
  }

  function getAgentBubbleAlpha(now) {
    if (!agentBubble.emojis || now >= agentBubble.showUntil) {
      return 0;
    }
    const remaining = agentBubble.showUntil - now;
    if (remaining < 350) {
      return remaining / 350;
    }
    return 1;
  }

  function onPhaseChange(vm, now) {
    if (vm.phase === lastPhase) {
      return;
    }
    lastPhase = vm.phase;
    bubble = { emojis: null, showUntil: 0, nextAt: now + 1500 };
    agentBubble = { emojis: null, showUntil: 0, nextAt: now + 800 };
    anim = { name: 'walk', until: 0, started: 0 };
    clickTracker = {
      times: [],
      reaction: null,
      until: 0,
      angryStarted: 0,
      angryNotified: false,
      notifyAt: 0,
    };
    pressedBtn = null;
  }

  function recordPetClick(now) {
    totalClicks += 1;
    clickTracker.times = clickTracker.times.filter(function (t) {
      return now - t < CLICK_WINDOW_MS;
    });
    clickTracker.times.push(now);

    if (clickTracker.times.length >= ANGRY_CLICKS) {
      clickTracker.reaction = 'angry';
      clickTracker.until = now + 3200;
      clickTracker.angryStarted = now;
      clickTracker.notifyAt = now + 3200;
      clickTracker.times = [];
      anim = { name: 'sit', until: now + 3200, started: now };
      closeBackpack();
    } else {
      clickTracker.reaction = 'laugh';
      clickTracker.until = now + 1400;
    }

    if (getTimeOfDay() === 'night' && totalClicks === 7 && !easterEggShown.owl) {
      easterEggShown.owl = true;
      clickTracker.reaction = 'owl';
      clickTracker.until = now + 3000;
    }
    if (totalClicks === 42 && !easterEggShown.party) {
      easterEggShown.party = true;
      clickTracker.reaction = 'party';
      clickTracker.until = now + 3500;
    }
  }

  function getAngrySwearEmoji(now) {
    const idx = Math.floor(now / 380) % ANGRY_SWEAR_EMOJIS.length;
    return ANGRY_SWEAR_EMOJIS[idx];
  }

  function petShouldBlink(now) {
    const t = now / 1000;
    const phase = t % 2.6;
    if (phase > 2.35) {
      return true;
    }
    if (phase > 1.05 && phase < 1.18) {
      return true;
    }
    return false;
  }

  function checkAngryNotification(now) {
    if (clickTracker.reaction === 'angry') {
      closeBackpack();
    }
    if (clickTracker.notifyAt && !clickTracker.angryNotified && now >= clickTracker.notifyAt) {
      clickTracker.angryNotified = true;
      clickTracker.notifyAt = 0;
      vscode.postMessage({ type: 'petAngry', clicks: ANGRY_CLICKS });
    }
  }

  function getClickReaction(now) {
    if (clickTracker.reaction && now < clickTracker.until) {
      return clickTracker.reaction;
    }
    if (clickTracker.reaction && now >= clickTracker.until) {
      clickTracker.reaction = null;
    }
    return null;
  }

  function hitTestPet(x, y, vm) {
    if (vm.phase !== 'alive' || vm.agentActive) {
      return false;
    }
    return Math.abs(x - 160) < 38 && y >= 58 && y <= 138;
  }

  function drawLaughFace() {
    drawPixelRect(-10, -8, 6, 4, GBC.ink);
    drawPixelRect(4, -8, 6, 4, GBC.ink);
    drawPixelRect(-12, 8, 24, 8, GBC.ink);
    drawPixelRect(-10, 10, 20, 4, '#f85898');
  }

  function drawAngryFace() {
    drawPixelRect(-12, -10, 8, 3, '#c03030');
    drawPixelRect(4, -10, 8, 3, '#c03030');
    drawPixelRect(-10, -7, 6, 5, GBC.ink);
    drawPixelRect(4, -7, 6, 5, GBC.ink);
    drawPixelRect(-8, 10, 16, 4, GBC.ink);
    drawPixelRect(-14, -18, 6, 4, '#f85898');
    drawPixelRect(8, -18, 6, 4, '#f85898');
  }

  function pickAnimation(vm, now) {
    const threshold = state.lowVitalsThreshold || 25;
    const hungry = vm.hunger < threshold;
    const sad = vm.happiness < threshold;
    if (hungry && sad) {
      return { name: 'sad', duration: 5000 };
    }
    if (hungry) {
      return { name: 'lazy', duration: 4000 };
    }
    if (sad) {
      return { name: 'sad', duration: 4500 };
    }
    return { name: 'idle', duration: 600000 };
  }

  function getPlayDeadSubPhase(now) {
    const elapsed = now - anim.started;
    if (elapsed < 2000) {
      return 'lying';
    }
    if (elapsed < 2900) {
      return 'rise';
    }
    return 'scare';
  }

  function getAnimState(vm, now) {
    const clickRx = getClickReaction(now);
    if (clickRx === 'angry' && vm.phase === 'alive') {
      return 'sit';
    }
    if (clickRx === 'laugh' && vm.phase === 'alive') {
      return 'jump';
    }
    if (vm.agentActive && vm.phase === 'alive') {
      return 'working';
    }
    if (vm.phase === 'alive') {
      const threshold = state.lowVitalsThreshold || 25;
      if (vm.hunger < threshold && vm.happiness < threshold) {
        return 'sad';
      }
      if (vm.hunger < threshold) {
        return 'lazy';
      }
      if (vm.happiness < threshold) {
        return 'sad';
      }
      return 'idle';
    }
    if (anim.started === 0) {
      anim.started = now;
      anim.until = now + 5000;
    }
    if (now >= anim.until) {
      const next = pickAnimation(vm, now);
      anim = { name: next.name, until: now + next.duration, started: now };
    }
    return anim.name;
  }

  function drawGlasses() {
    drawPixelRect(-13, -9, 26, 3, GBC.ink);
    drawPixelRect(-12, -8, 10, 7, '#68c8f8');
    drawPixelRect(2, -8, 10, 7, '#68c8f8');
    drawPixelRect(-1, -8, 2, 2, GBC.ink);
    drawPixelRect(-14, -7, 2, 2, GBC.ink);
    drawPixelRect(12, -7, 2, 2, GBC.ink);
  }

  function drawLaptop(t) {
    const blink = Math.floor(t * 3) % 2 === 0;
    drawPixelRect(-16, 10, 32, 14, GBC.shadow);
    drawPixelRect(-14, 12, 28, 10, GBC.ink);
    drawPixelRect(-12, 14, 24, 6, blink ? GBC.btnActionHi : GBC.btnAction);
    drawPixelRect(-4, 24, 8, 2, GBC.shadow);
  }

  function drawPetFace(blink, sad, playDead, withGlasses) {
    if (playDead) {
      drawPixelRect(-8, -4, 16, 3, GBC.ink);
      drawPixelRect(-10, -8, 6, 2, GBC.ink);
      drawPixelRect(4, -8, 6, 2, GBC.ink);
      return;
    }
    if (blink) {
      drawPixelRect(-10, -6, 6, 2, GBC.ink);
      drawPixelRect(4, -6, 6, 2, GBC.ink);
    } else if (sad) {
      drawPixelRect(-10, -7, 6, 4, GBC.ink);
      drawPixelRect(4, -7, 6, 4, GBC.ink);
    } else {
      drawPixelRect(-10, -8, 6, 6, GBC.ink);
      drawPixelRect(-8, -7, 2, 2, GBC.eyeHi);
      drawPixelRect(4, -8, 6, 6, GBC.ink);
      drawPixelRect(6, -7, 2, 2, GBC.eyeHi);
    }
    if (withGlasses) {
      drawGlasses();
    }
    drawPixelRect(-8, 10, 16, 3, GBC.ink);
  }

  function drawScareFace() {
    drawPixelRect(-14, -12, 10, 10, GBC.ink);
    drawPixelRect(-12, -10, 4, 4, GBC.eyeHi);
    drawPixelRect(4, -12, 10, 10, GBC.ink);
    drawPixelRect(6, -10, 4, 4, GBC.eyeHi);
    drawPixelRect(-8, 6, 16, 8, GBC.ink);
    drawPixelRect(-6, 8, 12, 4, '#f85898');
  }

  function drawPet(cx, cy, archetype, animName, t, facingRight, agentWorking, now) {
    const color = PET_COLORS[archetype] || PET_COLORS.balanced;

    if (animName === 'hide') {
      const palette = getSkyPalette();
      const bushX = 152;
      const bushY = 92;
      const peek = Math.sin(t * 5) * 0.5 + 0.5;
      drawPixelRect(bushX, bushY, 56, 42, palette.grassDark);
      drawPixelRect(bushX + 6, bushY - 12, 44, 16, palette.grassMid);
      drawPixelRect(bushX + 14, bushY + 4, 28, 20, palette.grassDark);
      if (peek > 0.35) {
        ctx.save();
        ctx.translate(bushX + 26, bushY + 10 - peek * 4);
        drawPixelRect(-12, -10, 24, 18, color);
        drawPixelRect(-8, -6, 5, 5, GBC.ink);
        drawPixelRect(3, -6, 5, 5, GBC.ink);
        ctx.restore();
      }
      return;
    }

    const legFrame = animName === 'idle' ? 0 : Math.floor(t * (animName === 'run' ? 12 : 6)) % 2;
    const working = agentWorking || animName === 'working';
    const sad = animName === 'sad' || animName === 'lazy';
    const idle = animName === 'idle';
    const playDead = animName === 'playDead';
    const sitting = animName === 'sit' || animName === 'paw' || working;
    const jumping = animName === 'jump';
    const running = animName === 'run';
    const playDeadPhase = playDead ? getPlayDeadSubPhase(now) : null;

    let jumpY = 0;
    if (jumping) {
      const phase = (t % 1.2) / 1.2;
      jumpY = -Math.sin(phase * Math.PI) * 18;
    } else if (playDeadPhase === 'scare') {
      const scareT = (now - anim.started - 2900) / 400;
      jumpY = -Math.min(22, scareT * 28);
    }

    let offsetX = 0;
    if (working) {
      offsetX = 0;
    } else if (running) {
      offsetX = Math.sin(t * 10) * 3;
    } else if (animName === 'walk') {
      offsetX = Math.sin(t * 4) * 24;
    } else if (sad) {
      offsetX = Math.sin(t * 1.2) * 6;
    } else if (idle) {
      offsetX = 0;
    }

    const drawX = cx + offsetX;
    const drawY = cy + jumpY;

    ctx.save();
    ctx.translate(drawX, drawY);

    if (playDead && playDeadPhase === 'lying') {
      ctx.rotate(Math.PI / 2);
      ctx.translate(0, -8);
      drawPixelRect(-18, -20, 36, 36, color);
      drawPixelRect(-6, -24, 12, 6, color);
      drawPetFace(true, false, true, false);
      ctx.restore();
      return;
    }

    if (playDead && playDeadPhase === 'rise') {
      const riseSquash = 1 - (now - anim.started - 2000) / 900;
      drawPixelRect(-18, -8 - riseSquash * 6, 36, 28 + riseSquash * 8, color);
      drawPixelRect(-6, -18, 12, 8, color);
      drawPixelRect(-22, 18, 12, 10, color);
      drawPixelRect(10, 18, 12, 10, color);
      drawPetFace(false, false, false, false);
      ctx.restore();
      return;
    }

    if (playDead && playDeadPhase === 'scare') {
      drawPixelRect(-20, -24, 40, 40, color);
      drawPixelRect(-8, -30, 16, 8, color);
      drawPixelRect(-24, 16, 12, 14, color);
      drawPixelRect(12, 16, 12, 14, color);
      drawScareFace();
      ctx.restore();
      return;
    }

    if (!facingRight && !sitting) {
      ctx.scale(-1, 1);
    }

    if (sitting) {
      const clickRx = getClickReaction(now);
      const laugh = clickRx === 'laugh';
      const angry = clickRx === 'angry';
      if (angry) {
        ctx.translate(Math.sin(t * 20) * 3, 0);
      }
      if (laugh) {
        ctx.translate(0, -Math.abs(Math.sin(t * 12)) * 5);
      }
      drawPixelRect(-20, -10, 40, 28, color);
      drawPixelRect(-8, -18, 16, 8, color);
      drawPixelRect(-24, 18, 14, 8, color);
      drawPixelRect(10, 18, 14, 8, color);
      if (animName === 'paw') {
        drawPixelRect(14, -28, 10, 16, color);
      }
      if (angry) {
        drawAngryFace();
      } else if (laugh) {
        drawLaughFace();
      } else {
        drawPetFace(petShouldBlink(now), sad, false, working);
      }
      if (working) {
        drawLaptop(t);
      }
      ctx.restore();
      return;
    }

    const legL = idle || legFrame === 0 ? 0 : -4;
    const legR = idle || legFrame === 0 ? 0 : -4;
    const clickRx = getClickReaction(now);
    const laugh = clickRx === 'laugh';
    const angry = clickRx === 'angry';

    if (laugh) {
      const bounce = -Math.abs(Math.sin(t * 12)) * 6;
      ctx.translate(0, bounce);
    }
    if (angry) {
      ctx.translate(Math.sin(t * 20) * 3, 0);
    }

    drawPixelRect(-18, -20, 36, sad ? 30 : 36, color);
    drawPixelRect(-6, -24, 12, 6, color);
    drawPixelRect(-22 + legL, 16, 10, 14, color);
    drawPixelRect(12 + legR, 16, 10, 14, color);
    if (laugh) {
      drawLaughFace();
    } else if (angry) {
      drawAngryFace();
    } else {
      drawPetFace(petShouldBlink(now), sad, false, false);
    }
    ctx.restore();
  }

  function drawPixelArrow(x, y, direction, pressed) {
    const fill = pressed ? GBC.btnPressed : GBC.btnFace;
    const leftRows = ['000110', '001111', '011111', '111111', '011111', '001111', '000110'];
    const rightRows = ['011000', '111100', '111110', '111111', '111110', '111100', '011000'];
    drawPixelGrid(x, y, direction === 'left' ? leftRows : rightRows, fill, 3);
    drawPixelRect(direction === 'left' ? x - 18 : x + 18, y + 9, 3, 12, GBC.shadow);
  }

  function drawPixelButton(x, y, w, h, label, pressed, variant) {
    const border = GBC.shadow;
    let bg;
    let hi;
    if (variant === 'green') {
      bg = pressed ? GBC.btnActionDark : GBC.btnAction;
      hi = GBC.btnActionHi;
    } else {
      bg = pressed ? GBC.btnPressed : GBC.btnFace;
      hi = GBC.btnFace;
    }
    drawPixelRect(x, y, w, h, border);
    drawPixelRect(x + 2, y + 2, w - 4, h - 4, bg);
    if (!pressed && variant === 'green') {
      drawPixelRect(x + 3, y + 3, w - 6, 3, hi);
    }
    ctx.fillStyle = variant === 'green' ? '#f8f8ff' : GBC.ink;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  function drawEggCarousel(now) {
    const skin = EGGS[carouselIndex];
    drawRoundedEgg(160, 72, skin, now * 2.2, 1);
    gbText(EGG_LABELS[skin], 132, 108, 9);
    const { left, right, select } = pickerLayout;
    drawPixelArrow(left.x + left.w / 2, left.y + 4, 'left', pressedBtn === 'left');
    drawPixelArrow(right.x + right.w / 2, right.y + 4, 'right', pressedBtn === 'right');
    drawPixelButton(select.x, select.y, select.w, select.h, 'SELECT', pressedBtn === 'select', 'green');
    gbText('<' + (carouselIndex + 1) + '/' + EGGS.length + '>', 138, 116, 8);
  }

  function drawDeadScene(now) {
    drawTombstone(160, 52);
    const btn = deadNewEggLayout;
    const pulse = Math.sin(now / 280) > 0;
    drawPixelButton(btn.x, btn.y, btn.w, btn.h, 'NEW EGG', pressedBtn === 'deadEgg', 'green');
    if (pulse) {
      drawPixelRect(btn.x - 2, btn.y - 2, btn.w + 4, 2, GBC.hatchHi);
    }
  }

  function drawToolbar(vm) {
    const { refresh, newEgg, debug } = toolbarLayout;
    const eggLabel = vm && vm.phase === 'dead' ? 'EGG!' : 'EGG';
    const eggVariant = vm && vm.phase === 'dead' ? 'green' : 'default';
    drawPixelButton(refresh.x, refresh.y, refresh.w, refresh.h, 'RFS', pressedBtn === 'refresh', 'default');
    drawPixelButton(newEgg.x, newEgg.y, newEgg.w, newEgg.h, eggLabel, pressedBtn === 'toolbarEgg', eggVariant);
    if (state.debugMode) {
      drawPixelButton(debug.x, debug.y, debug.w, debug.h, 'DBG', pressedBtn === 'debug', 'default');
    }
  }

  function needsEggPicker(vm) {
    return vm.phase === 'egg_selection';
  }

  function hitTest(x, y, box) {
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  }

  function drawScene(now) {
    const vm = state.viewModel || {};
    onPhaseChange(vm, now);
    updateSpeechBubble(vm, now);
    updateAgentBubble(vm, now);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGameBoyShell();
    drawSceneGround();
    drawPoop(vm);
    drawSleepOverlay(vm);

    const t = now / 1000;
    const facingRight = true;

    if (vm.phase === 'dead') {
      drawDeadScene(now);
    } else if (vm.phase === 'egg_selection') {
      drawEggCarousel(t);
    } else if (vm.phase === 'incubating') {
      drawRoundedEgg(160, 78, vm.selectedEgg || 'ember', t * 2.5, 1.1);
    } else if (vm.phase === 'alive') {
      const animName = getAnimState(vm, now);
      const clickRx = getClickReaction(now);
      drawPet(160, 100, vm.archetype || 'balanced', animName, t, facingRight, vm.agentActive, now);
      if (clickRx === 'angry') {
        drawSpeechBubble(160, 34, getAngrySwearEmoji(now), 1);
      } else if (clickRx === 'laugh') {
        drawSpeechBubble(160, 42, '😆😂', 1);
      } else if (clickRx === 'owl') {
        drawSpeechBubble(200, 32, '🦉✨', 1);
      } else if (clickRx === 'party') {
        drawSpeechBubble(160, 36, '🎉🎊', 1);
      } else if (animName === 'playDead' && getPlayDeadSubPhase(now) === 'scare') {
        drawSpeechBubble(160, 34, '😱‼️', 1);
      } else if (vm.agentActive && agentBubble.emojis) {
        drawComputerBubble(160, 48, agentBubble.emojis, getAgentBubbleAlpha(now));
      } else if (bubble.emojis) {
        const alpha = getBubbleAlpha(now);
        const bubbleY = animName === 'jump' ? 42 : 54;
        drawSpeechBubble(160, bubbleY, bubble.emojis, alpha);
      }
    }

    drawGameBoyHud(vm);
    drawToolbar(vm);

    const hintEl = document.getElementById('pet-picker-hint');
    if (hintEl) {
      if (needsEggPicker(vm)) {
        hintEl.classList.remove('hidden');
        canvas.style.cursor = 'pointer';
      } else {
        hintEl.classList.add('hidden');
        canvas.style.cursor = 'pointer';
      }
    }
  }

  function cycleEgg(delta) {
    carouselIndex = (carouselIndex + delta + EGGS.length) % EGGS.length;
  }

  function confirmEggSelection() {
    vscode.postMessage({ type: 'selectEgg', egg: EGGS[carouselIndex] });
  }

  function beginNewEgg() {
    vscode.postMessage({ type: 'beginNewEgg' });
  }

  function handleToolbarPointer(x, y, isDown, vm) {
    const { refresh, newEgg, debug } = toolbarLayout;
    if (hitTest(x, y, refresh)) {
      pressedBtn = isDown ? 'refresh' : null;
      if (!isDown) {
        vscode.postMessage({ type: 'refresh' });
      }
      return true;
    }
    if (hitTest(x, y, newEgg)) {
      pressedBtn = isDown ? 'toolbarEgg' : null;
      if (!isDown) {
        if (vm.phase === 'dead') {
          beginNewEgg();
        } else {
          vscode.postMessage({ type: 'reset' });
        }
      }
      return true;
    }
    if (state.debugMode && hitTest(x, y, debug)) {
      pressedBtn = isDown ? 'debug' : null;
      if (!isDown) {
        vscode.postMessage({ type: 'debugMenu' });
      }
      return true;
    }
    return false;
  }

  function handleCanvasPointer(x, y, isDown, now) {
    const vm = state.viewModel || {};

    if (handleToolbarPointer(x, y, isDown, vm)) {
      return;
    }

    if (vm.phase === 'dead') {
      const btn = deadNewEggLayout;
      if (hitTest(x, y, btn)) {
        pressedBtn = isDown ? 'deadEgg' : null;
        if (!isDown) {
          beginNewEgg();
        }
      }
      return;
    }

    if (!isDown && hitTestPet(x, y, vm)) {
      recordPetClick(now || performance.now());
      return;
    }

    if (!needsEggPicker(vm)) {
      return;
    }

    const { left, right, select } = pickerLayout;
    if (hitTest(x, y, left)) {
      pressedBtn = isDown ? 'left' : null;
      if (!isDown) {
        cycleEgg(-1);
      }
      return;
    }
    if (hitTest(x, y, right)) {
      pressedBtn = isDown ? 'right' : null;
      if (!isDown) {
        cycleEgg(1);
      }
      return;
    }
    if (hitTest(x, y, select)) {
      pressedBtn = isDown ? 'select' : null;
      if (!isDown) {
        confirmEggSelection();
      }
    }
  }

  function canvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('mousedown', (event) => {
    const { x, y } = canvasCoords(event);
    handleCanvasPointer(x, y, true, performance.now());
  });

  canvas.addEventListener('mouseup', (event) => {
    const { x, y } = canvasCoords(event);
    handleCanvasPointer(x, y, false, performance.now());
  });

  canvas.addEventListener('mouseleave', () => {
    pressedBtn = null;
  });

  document.addEventListener('keydown', (event) => {
    const vm = state.viewModel || {};
    if (!needsEggPicker(vm)) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      cycleEgg(-1);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      cycleEgg(1);
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      confirmEggSelection();
      event.preventDefault();
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'state') {
      state = msg.state;
      const vm = state.viewModel || {};
      if (vm.selectedEgg) {
        const idx = EGGS.indexOf(vm.selectedEgg);
        if (idx >= 0) {
          carouselIndex = idx;
        }
      }
      renderBackpack();
    }
  });

  function escHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getBackpackTip(vm) {
    if (!vm || !vm.phase) {
      return 'Use Cursor to care for your companion.';
    }
    if (vm.phase === 'egg_selection') {
      return 'Pick an egg above. Incubation starts when you hatch — keep using Cursor!';
    }
    if (vm.phase === 'incubating') {
      return 'Egg is warming up! Code and chat with the agent to speed up hatching.';
    }
    if (vm.phase === 'dead') {
      return 'Your pet passed away. Press NEW EGG, then restock feeding habits below.';
    }
    if (vm.sick) {
      return 'Sick! Agent: run cursor_pet_medicine (CursorToys MCP).';
    }
    if (vm.poop > 0) {
      return 'Mess on screen — agent: run cursor_pet_clean (CursorToys MCP).';
    }
    if (vm.lowVitalsWarning) {
      return 'Low vitals! Edit code to feed · chat to play. Do not spam-click!';
    }
    return 'Hunger ← edit code in the editor · Happiness ← chat with the agent. No manual feed/play buttons.';
  }

  function getItemStatus(item, hooksOk) {
    if (item.mode === 'hook') {
      return hooksOk
        ? { label: 'ON', className: 'on' }
        : { label: 'OFF', className: 'off' };
    }
    return { label: 'OK', className: 'auto' };
  }

  function renderBackpack() {
    const tipEl = document.getElementById('backpack-tip');
    const listEl = document.getElementById('pet-inventory');
    const hooksEl = document.getElementById('backpack-hooks-status');
    const actionsEl = document.getElementById('backpack-actions');
    if (!tipEl || !listEl || !hooksEl || !actionsEl) {
      return;
    }

    const vm = state.viewModel || {};
    const hooksOk = Boolean(state.bridgeInstalled);
    const alive = vm.phase === 'alive';

    tipEl.textContent = getBackpackTip(vm);

    listEl.innerHTML = INVENTORY_ITEMS.map(function (item) {
      const st = getItemStatus(item, hooksOk);
      const dim = item.mode === 'hook' && !hooksOk ? ' dim' : '';
      return (
        '<li class="pet-inv-row' +
        dim +
        '" title="' +
        escHtml(item.tip) +
        '">' +
        '<span class="pet-inv-emoji">' +
        item.emoji +
        '</span>' +
        '<span class="pet-inv-name">' +
        escHtml(item.name) +
        '</span>' +
        '<span class="pet-inv-effect">' +
        escHtml(item.effect) +
        '</span>' +
        '<span class="pet-inv-status ' +
        st.className +
        '">' +
        escHtml(st.label) +
        '</span>' +
        '</li>'
      );
    }).join('');

    if (hooksOk) {
      hooksEl.className = 'pet-backpack-hooks installed';
      hooksEl.textContent =
        'Hooks installed · ~/.cursor/hooks/cursor-pet-feed.js · bridge petFeed/petPlay';
    } else {
      hooksEl.className = 'pet-backpack-hooks missing';
      hooksEl.textContent =
        'Hooks missing — press HOOKS to install terminal & shell feeding scripts.';
    }

    const buttons = actionsEl.querySelectorAll('.pet-pixel-btn');
    buttons.forEach(function (btn) {
      const action = btn.getAttribute('data-action');
      if (vm.phase !== 'alive') {
        btn.disabled = action !== 'installHooks' && action !== 'feedHelp';
      } else {
        btn.disabled = false;
      }
      if (action === 'installHooks' && !hooksOk) {
        btn.classList.add('primary');
      } else {
        btn.classList.remove('primary');
      }
    });
  }

  if (backpackToggleEl) {
    backpackToggleEl.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleBackpack();
    });
  }

  const backpackEl = document.getElementById('pet-backpack');
  if (backpackEl) {
    backpackEl.addEventListener('click', function (event) {
      if (event.target.closest('#backpack-toggle')) {
        return;
      }
      const btn = event.target.closest('[data-action]');
      if (!btn || btn.disabled) {
        return;
      }
      const action = btn.getAttribute('data-action');
      if (action) {
        vscode.postMessage({ type: action });
      }
    });
  }

  renderBackpack();

  function loop(now) {
    const ts = now || performance.now();
    checkAngryNotification(ts);
    drawScene(ts);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
