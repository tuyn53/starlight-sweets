// Isolated render benchmark. Each mode runs the production combat update against the same seed.
(() => {
  const MODES = {original:'现版 Canvas 2D', canvas:'Phaser Canvas', webgl:'Phaser WebGL'};
  const STEP_MS = CFG.STEP * 1000;
  const WARMUP_MS = 2000;
  const SAMPLE_MS = 12000;
  const CROWD_SIZE = 96;
  const ENEMY_TYPES = ['spore', 'swift', 'split', 'mimic', 'thief', 'bomber', 'elite'];
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const host = document.getElementById('phaser');
  const buttons = document.querySelectorAll('[data-mode]');
  let phaserScript;

  // Exclude HUD and audio work in all three modes.
  updateHUD = () => {};
  // Collect elite chests without pausing the scripted fight for a reward card.
  popChest = () => { game.chestQueue = 0; };
  for (const name of Object.keys(Sound)) {
    if (typeof Sound[name] === 'function') Sound[name] = () => {};
  }
  Input.vector = () => ({x: Math.cos(game.time * 2.5), y: Math.sin(game.time * 2.5)});

  function refillCrowd() {
    const radius = Math.min(VIEW.w, VIEW.h) * .38;
    let alive = game.enemies.filter(enemy => !enemy.dead).length;
    while (alive < CROWD_SIZE && game.enemies.length < CFG.MAX_ENEMIES) {
      const angle = Math.random() * TAU;
      const distance = rand(45, 45 + radius);
      spawnEnemy(ENEMY_TYPES[alive % ENEMY_TYPES.length],
        player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance);
      alive++;
    }
  }

  function resetBattle() {
    uid = 1;
    Object.assign(game, {
      state:'playing', level:4, time:0, levelTime:0, kills:0, levelKills:0,
      lastWave:5, sporeMutated:true, spawnT:Infinity, eliteT:Infinity, propT:2, toastT:0, flash:0, chestQueue:0,
      enemies:[], bullets:[], ebullets:[], gems:[], chests:[], props:[],
      parts:[], dmgTexts:[], fx:[], hazards:[], blades:[], mines:[], timeFields:[],
    });
    Object.assign(Juice, {clock:0, trauma:0, stop:0, _last:{}});
    aimLock.ref = null;
    aimLock.until = 0;
    game.aimTarget = null;
    player = makePlayer();
    Object.assign(player, {level:19, xpNext:Infinity, invuln:Infinity});
    for (const key of ['bolt','orbit','aura','lightning','nova']) {
      addWeapon(key);
      player.weapons[key].level = WEAPONS[key].max;
    }
    for (const key of ['firerate', 'cooldown']) {
      for (let i = 0; i < PASSIVES[key].max; i++) addPassive(key);
    }
    game.cam.x = -VIEW.w / 2;
    game.cam.y = -VIEW.h / 2;
    refillCrowd();
    const radius = Math.min(VIEW.w, VIEW.h) * .44;
    for (let i = 0; i < 60; i++) {
      const angle = i * 2.399963;
      const distance = 65 + (i / 60) * radius;
      dropGem(Math.cos(angle) * distance, Math.sin(angle) * distance, 1);
    }
  }

  function loadPhaser() {
    phaserScript ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/phaser@4.1.0/dist/phaser.min.js';
      script.onload = resolve;
      script.onerror = () => {
        phaserScript = undefined;
        script.remove();
        reject(new Error('Phaser 加载失败，请检查网络后重试。'));
      };
      document.head.append(script);
    });
    return phaserScript;
  }

  function createStage(scene) {
    const stage = scene.add.container().setScale(dpr);
    for (const [key, image] of Object.entries(BATTLE_SPRITES)) scene.textures.addCanvas(key, image);
    for (let i = 0; i < CHUNK_VARIANTS; i++) {
      scene.textures.addCanvas('ground-' + i, paintTerrainChunk('meadow', i));
    }
    const dot = document.createElement('canvas');
    dot.width = dot.height = 24;
    const painter = dot.getContext('2d');
    painter.fillStyle = '#fff2ba';
    painter.beginPath();
    painter.arc(12, 12, 11, 0, TAU);
    painter.fill();
    scene.textures.addCanvas('dot', dot);

    const images = [];
    let used = 0;
    function image(key, x, y, size, alpha = 1, originX = .5, originY = .5) {
      if (used === images.length) {
        const sprite = scene.make.image({key, add:false});
        stage.add(sprite);
        images.push(sprite);
      }
      images[used++].setTexture(key).setOrigin(originX, originY)
        .setPosition(x, y).setDisplaySize(size, size).setAlpha(alpha).setVisible(true);
    }
    return () => {
      used = 0;
      const {x, y} = game.cam;
      stage.setPosition(-x * dpr, -y * dpr);
      for (let row = Math.floor(y / CHUNK_SIZE); row < Math.ceil((y + VIEW.h) / CHUNK_SIZE); row++) {
        for (let col = Math.floor(x / CHUNK_SIZE); col < Math.ceil((x + VIEW.w) / CHUNK_SIZE); col++) {
          image('ground-' + terrainChunkVariant(game.level, col, row),
            col * CHUNK_SIZE, row * CHUNK_SIZE, CHUNK_SIZE + 1, 1, 0, 0);
        }
      }
      for (const gem of game.gems) image('gem', gem.x, gem.y, 22);
      for (const enemy of game.enemies) {
        if (enemy.dead || enemy.x < x - 160 || enemy.x > x + VIEW.w + 160 ||
          enemy.y < y - 160 || enemy.y > y + VIEW.h + 160) continue;
        const radius = enemy.type === 'elite' ? enemy.r : Math.max(22, enemy.r * 1.55);
        image(enemy.type, enemy.x, enemy.y + radius * .9, radius * 2.3, enemy.hidden ? .36 : 1, .5, .98);
      }
      for (const bullet of game.bullets) image('dot', bullet.x, bullet.y, bullet.r * 2);
      image('player', player.x, player.y + 16, 58, 1, .5, .98);
      for (const part of game.parts) image('dot', part.x, part.y, part.size * 2, part.life / part.max);
      for (let i = used; i < images.length && images[i].visible; i++) images[i].setVisible(false);
    };
  }

  function sample(draw, stop, afterSample) {
    const originalRandom = Math.random;
    let seed = 197;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    Math.random = random;
    try { resetBattle(); }
    finally { Math.random = originalRandom; }
    const width = VIEW.w, height = VIEW.h, resolution = dpr;
    const intervals = [], logic = [];
    let start, last, steps = 0;
    let previousFrameMeasured = false;
    let enemyTotal = 0;
    let previousLoad, worstLoad;
    let longestInterval = -1;
    let peakParticles = 0, peakDamageTexts = 0;
    function finish(message) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
      afterSample(message);
    }
    function onVisibilityChange() {
      if (document.hidden) finish('页面已离开前台，请重新测量。');
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return (now) => {
      start ??= now;
      const elapsed = now - start;
      if (document.hidden || width !== VIEW.w || height !== VIEW.h || resolution !== dpr) {
        finish('页面离开前台或尺寸改变，请重新测量。');
        return;
      }
      if (elapsed >= WARMUP_MS + SAMPLE_MS) {
        const p95 = values => values.slice().sort((a,b) => a-b)[Math.ceil(values.length * .95) - 1]?.toFixed(2) ?? '—';
        finish(`${width}×${height} · DPR ${resolution} · ${intervals.length} 个帧间隔\n` +
          `帧间隔 p95 ${p95(intervals)} ms · 超过 33 ms ${intervals.filter(ms => ms > 33).length} 帧\n` +
          `单步逻辑 p95 ${p95(logic)} ms · 平均敌人数 ${Math.round(enemyTotal / logic.length) || 0}\n` +
          `峰值粒子 ${peakParticles} · 峰值伤害数字 ${peakDamageTexts}\n` +
          (worstLoad ? `最长帧间隔 ${longestInterval.toFixed(2)} ms · 前帧 ${worstLoad.enemies} 怪 / ${worstLoad.particles} 粒子 / ${worstLoad.texts} 伤害数字 · 更新 ${worstLoad.logic.toFixed(2)} ms` : '有效帧间隔不足'));
        return;
      }
      const measuring = elapsed >= WARMUP_MS;
      if (previousFrameMeasured) {
        const interval = now - last;
        intervals.push(interval);
        if (interval > longestInterval) {
          longestInterval = interval;
          worstLoad = previousLoad;
        }
      }
      last = now;
      previousFrameMeasured = measuring;
      let frameLogic = 0;
      Math.random = random;
      try {
        while (steps * STEP_MS < elapsed) {
          steps++;
          Juice.tick(CFG.STEP);
          // Force one overlap inside the measured window, then use normal cooldowns.
          if (steps === 180) {
            for (const weapon of Object.values(player.weapons)) weapon.timer = 0;
            player.auraTick = 0;
          }
          if (Juice.stop > 0) continue;
          if (steps % 15 === 0) refillCrowd();
          const begin = performance.now();
          update(CFG.STEP);
          if (measuring) {
            const updateMs = performance.now() - begin;
            frameLogic += updateMs;
            logic.push(updateMs);
            enemyTotal += game.enemies.length;
            peakParticles = Math.max(peakParticles, game.parts.length);
            peakDamageTexts = Math.max(peakDamageTexts, game.dmgTexts.length);
          }
        }
      } finally {
        Math.random = originalRandom;
      }
      if (measuring) previousLoad = {
        enemies:game.enemies.length, particles:game.parts.length, texts:game.dmgTexts.length, logic:frameLogic,
      };
      draw();
    };
  }

  async function run(mode) {
    for (const button of buttons) button.disabled = true;
    results.hidden = true;
    status.textContent = `${MODES[mode]} · 准备中…`;
    function done(message) {
      status.textContent = '请选择模式重测。';
      const result = document.createElement('output');
      result.textContent = `${MODES[mode]}\n${message}`;
      const previous = results.querySelector(`[data-result="${mode}"]`);
      result.dataset.result = mode;
      if (previous) previous.replaceWith(result);
      else results.append(result);
      results.hidden = false;
      for (const button of buttons) button.disabled = false;
    }
    if (mode === 'original') {
      host.hidden = true;
      cvs.hidden = false;
      let running = true;
      const measure = sample(() => render(1), () => { running = false; }, done);
      const frame = now => {
        measure(now);
        if (running) requestAnimationFrame(frame);
      };
      status.textContent = `${MODES[mode]} · 运行中…`;
      requestAnimationFrame(frame);
      return;
    }
    try {
      await loadPhaser();
      const requestedType = mode === 'webgl' ? Phaser.WEBGL : Phaser.CANVAS;
      host.hidden = false;
      cvs.hidden = true;
      let measure;
      new Phaser.Game({
        type:requestedType,
        width:Math.floor(VIEW.w * dpr), height:Math.floor(VIEW.h * dpr),
        parent:host, audio:{noAudio:true}, input:{keyboard:false, mouse:false, touch:false},
        banner:false,
        scene:{
          create() {
            const engine = this.game;
            try {
              if (engine.renderer.type !== requestedType) throw new Error('浏览器未启用所选渲染后端。');
              engine.canvas.style.width = VIEW.w + 'px';
              engine.canvas.style.height = VIEW.h + 'px';
              engine.textures.addCanvas('gem', gemTexture);
              const draw = createStage(this);
              measure = sample(draw, () => { measure = null; engine.destroy(true); }, done);
              status.textContent = `${MODES[mode]} · 运行中…`;
            } catch (error) {
              engine.destroy(true);
              done(error.message);
            }
          },
          update() { measure?.(performance.now()); },
        },
      });
    } catch (error) {
      done(error.message);
    }
  }

  const gemTexture = document.createElement('canvas');
  gemTexture.width = gemTexture.height = 32;
  const gemPainter = gemTexture.getContext('2d');
  gemPainter.translate(16, 16);
  gemPainter.fillStyle = '#aa80ed';
  gemPainter.strokeStyle = '#fff8ff';
  gemPainter.lineWidth = 2;
  gemPainter.beginPath();
  gemPainter.moveTo(0, -14);
  gemPainter.lineTo(9, 0);
  gemPainter.lineTo(0, 14);
  gemPainter.lineTo(-9, 0);
  gemPainter.closePath();
  gemPainter.fill();
  gemPainter.stroke();

  Promise.all([loadBattleEffects(),new Promise(resolve=>loadSprites(resolve))]).then(() => {
    status.textContent = '请选择一个模式。Phaser 模式首次运行会加载引擎。';
    for (const button of buttons) {
      button.disabled = false;
      button.onclick = () => run(button.dataset.mode);
    }
  });
})();
