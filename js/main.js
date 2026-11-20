// === 主循环：固定步长 + 插值渲染 ===
let acc=0, last=performance.now();
let pauseOpen=false;   // 游戏内暂停浮窗（暂停时冻结世界推进）
function frame(now){
  const raw=Math.min((now-last)/1000,0.25); last=now;
  Juice.tick(raw);
  // 设置/暂停浮窗打开时冻结世界推进（与 hit-stop 同理），避免玩家在看菜单时继续挨打
  if(game.state==='playing' && !sceneBusy && Juice.stop<=0 && !isSettingsOpen() && !isPauseOpen()){
    acc+=raw;
    let guard=0;
    while(acc>=CFG.STEP && guard++<6){
      update(CFG.STEP); acc-=CFG.STEP;
      if(game.state!=='playing' || Juice.stop>0){ acc=0; break; }
    }
  } else if(Juice.stop>0){ /* hit-stop：冻结世界推进，仍渲染打击帧 */ }
  else acc=0;
  render(game.state==='levelup'?1:game.state==='playing'?clamp(acc/CFG.STEP,0,1):0);
  // 首页骨骼动画并入同一 rAF：仅在菜单可见且加载层已收场时绘制，
  // 加载阶段不白画（被加载层遮住），也不读 DOM 布局属性（避免强制重排）。
  if(homeRigs.length && VIS.menu && loadLayer.classList.contains('done')) drawHome(now);
  requestAnimationFrame(frame);
}

// === 关卡选择界面与 Q 版星光转场 ===
let sceneBusy=false;
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
const prefersReducedMotion=()=>motionPreference.matches;
function refreshMenuProgress(){
  const total=CFG.LEVEL.total;
  document.getElementById('menuProgress').textContent=`冒险进度 · 已解锁 ${game.unlocked} / ${total} 关`;
  const strong=document.querySelector('#startBtn .play-copy strong');
  const small=document.querySelector('#startBtn .play-copy small');
  if(strong) strong.textContent=game.unlocked>1?'继续冒险':'开始冒险';
  if(small) small.textContent=game.unlocked>1?`已解锁第 ${game.unlocked} 关`:'选择冒险关卡';
}

const sceneLayer=document.getElementById('sceneTransition');
const sceneIris=sceneLayer.querySelector('.scene-iris');
const sceneSpark=sceneLayer.querySelector('.scene-spark');

async function transitionTo(action,origin){
  if(sceneBusy) return;
  if(prefersReducedMotion() || !sceneIris.animate){ action(); return; }

  const rect=origin?.getBoundingClientRect();
  const x=rect?clamp(rect.left+rect.width/2,0,innerWidth):innerWidth/2;
  const y=rect?clamp(rect.top+rect.height/2,0,innerHeight):innerHeight/2;
  // Size the disc to cover the farthest corner, including when activated from an edge.
  const diameter=2*(Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y))+4);
  sceneLayer.style.setProperty('--scene-x',x+'px');
  sceneLayer.style.setProperty('--scene-y',y+'px');
  sceneLayer.style.setProperty('--scene-size',diameter+'px');

  sceneBusy=true;
  sceneLayer.classList.remove('hidden');
  const closed='translate(-50%, -50%) scale(1)';
  const open='translate(-50%, -50%) scale(0)';
  try {
    sceneSpark.animate([
      {opacity:0,scale:.65}, {opacity:1,scale:1,offset:.32}, {opacity:0,scale:1.3},
    ],{duration:290,easing:'ease-out'});
    const cover=sceneIris.animate([{transform:open},{transform:closed}],
      {duration:185,easing:'cubic-bezier(.36, 0, .2, 1)',fill:'forwards'});
    await cover.finished;
    action();
    render(0);
    const reveal=sceneIris.animate([{transform:closed},{transform:open}],
      {duration:195,easing:'cubic-bezier(.16, 1, .3, 1)',fill:'forwards'});
    cover.cancel();
    await reveal.finished;
  } finally {
    sceneLayer.classList.add('hidden');
    for(const animation of sceneLayer.getAnimations({subtree:true})) animation.cancel();
    sceneBusy=false;
  }
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
    const lock='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    const mark=locked?lock:boss?itemIcon('nova'):'<img src="assets/starlight-shard.svg" alt="">';
    el.innerHTML=`<span class="n">${n}</span><span class="lv-mark">${mark}</span>`;
    el.disabled=locked;
    if(!locked) el.addEventListener('click',()=>{ Sound.unlock(); transitionTo(()=>startLevel(n),el); });
    grid.appendChild(el);
  }
}
function openLevels(){
  buildLevelGrid(); show('levels'); hide('menu'); hide('result');
  const unlocked=document.querySelectorAll('#levelGrid button:not(:disabled)');
  unlocked[unlocked.length-1]?.focus({preventScroll:true});
}
function openMenu(){
  refreshMenuProgress(); hide('levels'); hide('result'); show('menu');
  document.getElementById('startBtn').focus({preventScroll:true});
}

// === 绑定 ===
document.getElementById('startBtn').addEventListener('click',e=>{ Sound.unlock(); transitionTo(openLevels,e.currentTarget); });
document.getElementById('backMenuBtn').addEventListener('click',e=>transitionTo(openMenu,e.currentTarget));
document.getElementById('againBtn').addEventListener('click',e=>{ Sound.unlock(); transitionTo(()=>startLevel(game.level),e.currentTarget); });
document.getElementById('nextBtn').addEventListener('click',e=>{ Sound.unlock(); transitionTo(()=>startLevel(Math.min(game.level+1,CFG.LEVEL.total)),e.currentTarget); });
document.getElementById('resultLevelsBtn').addEventListener('click',e=>transitionTo(openLevels,e.currentTarget));

// === 设置浮窗：音效 / 震屏 / 闪光（统一在左上角齿轮入口，持久化）===
Juice.init();
const settingsBtn   = document.getElementById('settingsBtn');
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
function openSettings(event){
  if(settingsOpen || sceneBusy) return;
  lastFocused = event?.currentTarget || document.activeElement;
  settingsOpen = true;
  syncSettingsUI();
  show('settingsOverlay');
  lastFocused?.setAttribute('aria-expanded','true');
  document.getElementById('settingsClose').focus();
}
function closeSettings(immediate=false){
  if(!settingsOpen) return;
  settingsOpen = false;
  if(immediate===true) hide('settingsOverlay');
  else dismissOverlay('settingsOverlay');
  lastFocused?.setAttribute('aria-expanded','false');
  if(lastFocused && lastFocused.focus) lastFocused.focus();
}
settingsBtn.addEventListener('click', openSettings);
const rewardDialog=document.getElementById('rewardDialog');
document.getElementById('rewardPeekBtn').addEventListener('click',toggleRewardPeek);
document.getElementById('skipCardBtn').addEventListener('click',skipCard);
document.getElementById('pauseSettings').addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);
// 点击面板内部不关闭（阻止冒泡到遮罩）
settingsPanel.addEventListener('click', e => e.stopPropagation());
document.addEventListener('keydown', e => {
  if(sceneBusy && (e.key==='Tab'||e.key==='Escape'||e.key==='Esc')){ e.preventDefault(); return; }
  const panel=settingsOpen?settingsPanel:pauseOpen?pausePanel:game.state==='levelup'?rewardDialog:null;
  if(panel && e.key==='Tab'){
    const buttons=panel.querySelectorAll('button:not(:disabled):not([inert] button)');
    if(!buttons.length){ e.preventDefault(); panel.focus(); return; }
    const first=buttons[0], last=buttons[buttons.length-1];
    if(!panel.contains(document.activeElement) || document.activeElement===(e.shiftKey?first:last)){
      e.preventDefault();
      (e.shiftKey?last:first).focus();
    }
    return;
  }
  if(e.key !== 'Escape' && e.key !== 'Esc') return;
  if(settingsOpen){ e.preventDefault(); closeSettings(); }
  else if(pauseOpen){ e.preventDefault(); closePause(); }
  else if(game.state==='levelup'){ e.preventDefault(); toggleRewardPeek(); }
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
const pausePanel    = document.getElementById('pausePanel');
function isPauseOpen(){ return pauseOpen; }
function openPause(){
  if(pauseOpen || sceneBusy || game.state!=='playing') return;
  if(settingsOpen) closeSettings(true);
  pauseOpen = true;
  show('pauseOverlay');
  document.getElementById('pauseContinue').focus();
}
function closePause(immediate=false){
  if(!pauseOpen) return;
  pauseOpen = false;
  if(immediate===true) hide('pauseOverlay');
  else dismissOverlay('pauseOverlay');
  pauseBtn.focus();
}
function quitToLevels(event){
  const origin=event?.currentTarget;
  if(sceneBusy) return;
  // 退出本关：先关浮窗、复位状态，再切回选关，避免游戏在后台继续推进
  // 不 hide('hud')：HUD 的显隐由 render 按 state 控制（.hidden 的 !important 会压住后续 flex）
  hide('result'); hide('levelup');
  Sound.unlock();
  transitionTo(()=>{
    closePause(true);
    showBossBar(false);
    game.state='menu';
    openLevels();
  },origin);
}
pauseBtn.addEventListener('click', openPause);
document.getElementById('pauseBackdrop').addEventListener('click', closePause);
pausePanel.addEventListener('click', e => e.stopPropagation());
document.getElementById('pauseContinue').addEventListener('click', closePause);
document.getElementById('pauseRestart').addEventListener('click', e => {
  const origin=e.currentTarget;
  Sound.unlock();
  transitionTo(()=>{ closePause(true); startLevel(game.level); },origin);
});
document.getElementById('pauseQuit').addEventListener('click', quitToLevels);
Input.init();

// 启动：先显示加载首屏，精灵图（含失败回退）全部就绪后再淡出进入首页。
// 本地服务器加载很快，一闪而过；部署到远端后这里就是真实的等待态，避免半成品精灵/画风降级。
loadProgress();
refreshMenuProgress();
player=makePlayer();
game.cam.x=-VIEW.w/2; game.cam.y=-VIEW.h/2;

const loadLayer  = document.getElementById('loading');
const loadFill   = document.getElementById('loadFill');
const loadPct    = document.getElementById('loadPct');
const loadSub    = document.getElementById('loadSub');   // 只改文字节点，保留两侧装饰横线
const loadStart  = document.getElementById('loadStart');
let entered=false;   // 入场只触发一次

// 加载文案池：按进度分四段，进入新阶段时随机换一句，避免从头到尾一句"正在收集星光"
const LOAD_TIPS = [
  ['正在收集星光…','小星星们排好队啦…','星星正在赶来的路上…'],
  ['甜点伙伴正在醒来…','正在撒糖霜…','棉花糖云朵铺好啦…'],
  ['魔法锅在咕嘟咕嘟…','把星星装进口袋…','云朵正在变得软乎乎…'],
  ['马上就好啦…','最后一点点…','星光快要满啦…'],
];
let loadStage = -1;
function tipFor(pct){
  const stage = pct<28?0 : pct<56?1 : pct<84?2 : 3;
  if(stage!==loadStage){
    loadStage = stage;
    const pool = LOAD_TIPS[stage];
    if(loadSub) loadSub.textContent = pool[Math.floor(Math.random()*pool.length)];
  }
}

function finishLoading(){
  if(loadFill) loadFill.style.setProperty('--progress',1);
  if(loadPct) loadPct.textContent='100%';
  if(loadSub) loadSub.textContent='星光已就位！';
  // 就绪态：进度条让位给"轻触开始"，等玩家点击（这一下同时解锁音频）
  if(loadStart) loadStart.classList.remove('hidden');
  loadLayer.classList.add('ready');
  loadStart.focus({preventScroll:true});
}
function enterGame(){
  if(entered || !loadLayer.classList.contains('ready')) return;  // 未就绪或已入场时忽略
  entered=true;
  loadLayer.classList.remove('ready');
  transitionTo(()=>{
    loadLayer.classList.add('done');
    loadLayer.style.display='none';
    document.getElementById('startBtn').focus({preventScroll:true});
  },loadStart);
}
// 入口保留原生按钮语义，可用键盘和触屏操作。
loadStart.addEventListener('click', enterGame);

const bootTotal=Object.keys(SPRITE_SRC).length+Object.keys(VFX_CLIPS).length;
let bootLoaded=0;
function updateBootProgress(){
  const pct=Math.round(++bootLoaded/bootTotal*100);
  if(loadFill) loadFill.style.setProperty('--progress',pct/100);
  if(loadPct) loadPct.textContent=pct+'%';
  tipFor(pct);
}
Promise.all([
  loadBattleEffects(updateBootProgress),
  new Promise(resolve=>loadSprites(resolve,updateBootProgress)),
]).then(finishLoading);
requestAnimationFrame(frame);

// === 大厅角色待机 ===
const homeRigs = Array.prototype.map.call(document.querySelectorAll('.rig-canvas'), cv => {
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 120, h = cv.clientHeight || 120;
    if (cv.width !== Math.floor(w*dpr) || cv.height !== Math.floor(h*dpr)) {
      cv.width = Math.floor(w*dpr); cv.height = Math.floor(h*dpr);
    }
    return dpr;
  };
  const rig={cv,ctx:cv.getContext('2d'),kind:cv.dataset.kind,pose:cv.dataset.pose,phase:Math.random()*3,dpr:fit()};
  new ResizeObserver(()=>{rig.dpr=fit();}).observe(cv);
  return rig;
});
// 由主循环的单一 rAF 调用（见 frame），不再自启 rAF。
// 每个 rig 用各自的局部 ctx，Rig.draw 的 o.ctx 只临时切换、draw 结束立即交还主 ctx，
// 不再每帧做 getElementById + getContext 查询（原实现的强制 DOM 访问 + 全局 ctx 争抢）。
function drawHome(now){
  const T = now/1000;
  for (const r of homeRigs) {
    const dpr = r.dpr;
    const w = r.cv.width, h = r.cv.height;
    r.ctx.setTransform(1,0,0,1,0,0);
    r.ctx.clearRect(0,0,w,h);
    r.ctx.setTransform(dpr,0,0,dpr,0,0);
    const cw=w/dpr, ch=h/dpr;
    const drawH = ch * 0.94;
    const lift = prefersReducedMotion() ? 0 : Math.sin(T*2+r.phase)*4;
    if(!drawSprite(r.kind, cw/2, ch*0.97, Math.min(drawH, cw*1.12), {ctx:r.ctx, bob:lift})){
      Rig.draw(r.kind,cw/2,ch*.97,drawH,Rig.sample(r.pose,T,r.phase),{ctx:r.ctx,T});
    }
  }
  Rig.setCtx(ctx);  // 交还主画布上下文（用 core.js 已缓存的 ctx，不再每帧查询 DOM）
}
