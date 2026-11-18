// === 主循环：固定步长 + 插值渲染 ===
let acc=0, last=performance.now();
let pauseOpen=false;   // 游戏内暂停浮窗（暂停时冻结世界推进）
function frame(now){
  const raw=Math.min((now-last)/1000,0.25); last=now;
  Juice.tick(raw);
  // 设置/暂停浮窗打开时冻结世界推进（与 hit-stop 同理），避免玩家在看菜单时继续挨打
  if(game.state==='playing' && Juice.stop<=0 && !isSettingsOpen() && !isPauseOpen()){
    acc+=raw;
    let guard=0;
    while(acc>=CFG.STEP && guard++<6){
      update(CFG.STEP); acc-=CFG.STEP;
      if(game.state!=='playing' || Juice.stop>0){ acc=0; break; }
    }
  } else if(Juice.stop>0){ /* hit-stop：冻结世界推进，仍渲染打击帧 */ }
  else acc=0;
  render(game.state==='playing'?clamp(acc/CFG.STEP,0,1):0);
  requestAnimationFrame(frame);
}

// === 关卡选择界面与 Q 版星光转场 ===
let sceneBusy=false;
const prefersReducedMotion=()=>window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function refreshMenuProgress(){
  const total=CFG.LEVEL.total;
  document.getElementById('menuProgress').textContent=`冒险进度 · 已解锁 ${game.unlocked} / ${total} 关`;
  const strong=document.querySelector('#startBtn .play-copy strong');
  const small=document.querySelector('#startBtn .play-copy small');
  if(strong) strong.textContent=game.unlocked>1?'继续冒险':'开始冒险';
  if(small) small.textContent=game.unlocked>1?`第 ${game.unlocked} 关正在闪闪发光`:'星光之旅等着你';
}
function transitionTo(action){
  if(sceneBusy) return;
  if(prefersReducedMotion()){ action(); return; }
  const layer=document.getElementById('sceneTransition');
  sceneBusy=true;
  layer.classList.remove('hidden');
  void layer.offsetWidth;
  layer.classList.add('active');
  setTimeout(action,240);
  setTimeout(()=>layer.classList.remove('active'),480);
  setTimeout(()=>{ layer.classList.add('hidden'); sceneBusy=false; },720);
}
function buildLevelGrid(){
  const grid=document.getElementById('levelGrid'); grid.innerHTML='';
  document.getElementById('levelSub').textContent=`已解锁至第 ${game.unlocked} 关 · 每 5 关一位甜点伙伴`;
  for(let n=1;n<=CFG.LEVEL.total;n++){
    const act=actOf(n), locked=n>game.unlocked, boss=isBossLevel(n);
    const el=document.createElement('button');
    el.type='button';
    el.style.setProperty('--i',n-1);
    el.className='lv act'+(CFG.ACTS.indexOf(act)+1)+(boss?' boss':'')+(locked?' locked':'');
    el.setAttribute('aria-label',locked?`第 ${n} 关，尚未解锁`:`进入第 ${n} 关，${act.name}${boss?'，伙伴挑战':''}`);
    if(locked){
      el.disabled=true;
      el.innerHTML=`<div class="lock">🔒</div><div class="n">${n}</div>`;
    } else {
      const e=boss?actOf(n).icon:'assets/starlight-shard.svg';
      el.innerHTML=`<div class="n">${n}</div><div class="e">${boss?'🎂':`<img src="${e}" alt="星尘" class="level-shard">`}</div>`;
      el.addEventListener('click',()=>{ Sound.unlock(); transitionTo(()=>startLevel(n)); });
    }
    grid.appendChild(el);
  }
}
function openLevels(){ buildLevelGrid(); show('levels'); hide('menu'); hide('result'); }
function openMenu(){ refreshMenuProgress(); hide('levels'); hide('result'); show('menu'); }

// === 绑定 ===
document.getElementById('startBtn').addEventListener('click',()=>{ Sound.unlock(); transitionTo(openLevels); });
document.getElementById('backMenuBtn').addEventListener('click',()=>transitionTo(openMenu));
document.getElementById('againBtn').addEventListener('click',()=>{ Sound.unlock(); transitionTo(()=>startLevel(game.level)); });
document.getElementById('nextBtn').addEventListener('click',()=>{ Sound.unlock(); transitionTo(()=>startLevel(Math.min(game.level+1,CFG.LEVEL.total))); });
document.getElementById('resultLevelsBtn').addEventListener('click',()=>transitionTo(openLevels));

// === 设置浮窗：音效 / 震屏 / 闪光（统一在左上角齿轮入口，持久化）===
Juice.init();
const settingsBtn   = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsPanel = document.getElementById('settingsPanel');
const soundBtn      = document.getElementById('soundBtn');
const musicBtn      = document.getElementById('musicBtn');
const shakeGroup    = document.getElementById('shakeGroup');
const flashGroup    = document.getElementById('flashGroup');
let lastFocused = null;
let settingsOpen = false;

function isSettingsOpen(){ return settingsOpen; }
function syncSettingsUI(){
  // 音效 / 音乐开关
  soundBtn.classList.toggle('on', Sound.enabled);
  soundBtn.setAttribute('aria-checked', String(Sound.enabled));
  musicBtn.classList.toggle('on', Music.enabled);
  musicBtn.setAttribute('aria-checked', String(Music.enabled));
  // 三档分段：标准(1) / 减弱(0.5) / 关闭(0)
  const mark = (group, val) => {
    Array.prototype.forEach.call(group.querySelectorAll('button'), b => {
      const active = Math.abs(parseFloat(b.dataset.val) - val) < 0.01;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };
  mark(shakeGroup, Juice.shakeScale);
  mark(flashGroup, Juice.flashScale);
}
function openSettings(){
  if(settingsOpen) return;
  lastFocused = document.activeElement;
  settingsOpen = true;
  syncSettingsUI();
  settingsOverlay.classList.remove('hidden');
  settingsBtn.setAttribute('aria-expanded','true');
  document.getElementById('settingsClose').focus();
}
function closeSettings(){
  if(!settingsOpen) return;
  settingsOpen = false;
  settingsOverlay.classList.add('hidden');
  settingsBtn.setAttribute('aria-expanded','false');
  if(lastFocused && lastFocused.focus) lastFocused.focus();
}
settingsBtn.addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);
// 点击面板内部不关闭（阻止冒泡到遮罩）
settingsPanel.addEventListener('click', e => e.stopPropagation());
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape' && e.key !== 'Esc') return;
  if(settingsOpen){ e.preventDefault(); closeSettings(); }
  else if(pauseOpen){ e.preventDefault(); closePause(); }
  else if(game.state==='playing'){ e.preventDefault(); openPause(); }
});
// 音效：点击切换，在用户手势中解锁音频
soundBtn.addEventListener('click', () => { Sound.setEnabled(!Sound.enabled); syncSettingsUI(); });
// 音乐：点击开关；开启时需在用户手势中启动（浏览器自动播放策略）
musicBtn.addEventListener('click', () => { Sound.unlock(); Music.setEnabled(!Music.enabled); syncSettingsUI(); });
// 首次用户手势后启动 BGM（自动播放策略要求由用户交互触发）；打开设置浮窗时压低音乐避免吵闹
function bootBgm(){ Sound.unlock(); if(Music.enabled) Music.start(); }
document.addEventListener('pointerdown', bootBgm, { once:true });
document.addEventListener('keydown', bootBgm, { once:true });
// 震屏 / 闪光：直接点击档位
function bindScale(group, kind){
  Array.prototype.forEach.call(group.querySelectorAll('button'), b => {
    b.addEventListener('click', () => { Juice.setScale(kind, parseFloat(b.dataset.val)); syncSettingsUI(); });
  });
}
bindScale(shakeGroup, 'shake');
bindScale(flashGroup, 'flash');
syncSettingsUI();

// === 游戏内暂停 / 退出浮窗 ===
const pauseBtn      = document.getElementById('pauseBtn');
const pauseOverlay  = document.getElementById('pauseOverlay');
const pausePanel    = document.getElementById('pausePanel');
function isPauseOpen(){ return pauseOpen; }
function openPause(){
  if(pauseOpen || game.state!=='playing') return;
  if(settingsOpen) closeSettings();
  pauseOpen = true;
  pauseOverlay.classList.remove('hidden');
  document.getElementById('pauseContinue').focus();
}
function closePause(){
  if(!pauseOpen) return;
  pauseOpen = false;
  pauseOverlay.classList.add('hidden');
  pauseBtn.focus();
}
function quitToLevels(){
  // 退出本关：先关浮窗、复位状态，再切回选关，避免游戏在后台继续推进
  closePause();
  // 不 hide('hud')：HUD 的显隐由 render 按 state 控制（.hidden 的 !important 会压住后续 flex）
  hide('result'); hide('levelup');
  showBossBar(false);
  game.state = 'menu';
  Sound.unlock();
  transitionTo(openLevels);
}
pauseBtn.addEventListener('click', openPause);
document.getElementById('pauseBackdrop').addEventListener('click', closePause);
pausePanel.addEventListener('click', e => e.stopPropagation());
document.getElementById('pauseContinue').addEventListener('click', closePause);
document.getElementById('pauseRestart').addEventListener('click', () => {
  Sound.unlock(); closePause(); transitionTo(() => startLevel(game.level));
});
document.getElementById('pauseQuit').addEventListener('click', quitToLevels);
Input.init();

// 菜单背景也渲染一帧，避免黑屏
loadProgress();
refreshMenuProgress();
player=makePlayer();
game.cam.x=-VIEW.w/2; game.cam.y=-VIEW.h/2;
loadSprites();
requestAnimationFrame(frame);

// === 大厅骨骼动画：首页主角挥手 + 伙伴待机（canvas 逐帧绘制）===
const homeRigs = Array.prototype.map.call(document.querySelectorAll('.rig-canvas'), cv => {
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 120, h = cv.clientHeight || 120;
    if (cv.width !== Math.floor(w*dpr) || cv.height !== Math.floor(h*dpr)) {
      cv.width = Math.floor(w*dpr); cv.height = Math.floor(h*dpr);
    }
    return dpr;
  };
  return { cv, ctx: cv.getContext('2d'), kind: cv.dataset.kind, pose: cv.dataset.pose, phase: Math.random()*3, fit };
});
function homeFrame(now){
  const T = now/1000;
  for (const r of homeRigs) {
    if (!r.cv.offsetParent) continue;               // 首页隐藏时跳过绘制
    const dpr = r.fit();
    const w = r.cv.width, h = r.cv.height;
    r.ctx.setTransform(1,0,0,1,0,0);
    r.ctx.clearRect(0,0,w,h);
    r.ctx.setTransform(dpr,0,0,dpr,0,0);
    const pose = Rig.sample(r.pose, T, r.phase);
    // 按容器高度定尺寸，脚底贴容器底部 ~96%，整体高度留 8% 边距防头饰溢出
    const cw=w/dpr, ch=h/dpr;
    const drawH = ch * 0.94;
    // 优先用原 PNG 切片骨骼（画风不变、手脚能动）；精灵未加载好则退回程序化骨骼
    if(!SliceRig.draw(r.kind, cw/2, ch*0.97, drawH, pose, { ctx:r.ctx })){
      Rig.draw(r.kind, cw/2, ch*0.97, drawH, pose, { ctx:r.ctx, T });
    }
  }
  Rig.setCtx(document.getElementById('game').getContext('2d'));  // 交还上下文给游戏主循环
  requestAnimationFrame(homeFrame);
}
if (homeRigs.length) requestAnimationFrame(homeFrame);
