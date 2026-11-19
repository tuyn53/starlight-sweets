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
  // 首页骨骼动画并入同一 rAF：仅在菜单可见且加载层已收场时绘制，
  // 加载阶段不白画（被加载层遮住），也不读 DOM 布局属性（避免强制重排）。
  if(homeRigs.length && VIS.menu && loadLayer.classList.contains('done')) drawHome(now);
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

// 8 朵卡通云：左边 4 朵只从左侧进/出，右边 4 朵只从右侧进/出，位置与方向严格对应。
// （竖屏下 8 朵无法无缝铺满，缝隙由浅色天空底兜住，视觉上仍是"整片天+云"）
(function seedWipeClouds(){
  const host=document.getElementById('sceneTransition');
  if(!host || host.querySelector('.wc')) return;
  // 云用 SVG 矢量绘制（cloud-a/b，参考图同款造型），4 排 2 列交错：左列自左进、右列自右进，
  // 中间交叉叠压；退场沿各自方向继续横穿出去。
  const POS=[
    {l:-11,t:-9, s:1.14,dir:-1},
    {l:-15,t:15, s:1.04,dir:-1},
    {l:-12,t:42, s:1.10,dir:-1},
    {l:-16,t:69, s:1.02,dir:-1},
    {l:37, t:-5, s:1.08,dir: 1},
    {l:41, t:19, s:1.18,dir: 1},
    {l:38, t:46, s:1.05,dir: 1},
    {l:42, t:72, s:1.12,dir: 1},
  ];
  const frag=document.createDocumentFragment();
  POS.forEach((p,i)=>{
    const el=document.createElement('div');
    el.className='wc';
    el.style.left=p.l+'%';
    el.style.top =p.t+'%';
    el.style.backgroundImage='url("assets/clouds/cloud-'+(i%2?'a':'b')+'.svg")';
    el.style.setProperty('--fx',  (p.dir<0?-125:125)+'vw');
    el.style.setProperty('--outx',(p.dir<0?-135:135)+'vw');  // 与 --fx 同号：原路返回
    el.style.setProperty('--outd',(i*0.02).toFixed(3)+'s');
    el.style.setProperty('--fs',p.s.toFixed(2));
    el.style.animationDelay=(i*0.03).toFixed(3)+'s';
    frag.appendChild(el);
  });
    host.appendChild(frag);
})();
// 全局转场：白云从四角涌来合拢填满 → 满铺时切界面 → 云散开露出新界面。
// 云是 SVG 矢量椭圆，放大不糊；全程只有"云在聚拢"一件事，不旋转不闪烁。
const WIPE_IN=700, WIPE_OUT=780;
function cloudWipe(swap, origin, onDone){
  const layer=document.getElementById('sceneTransition');
  if(!layer){ swap(); if(onDone) onDone(); return; }
  layer.classList.remove('hidden','on','out');
  layer.style.opacity='';                       // 清掉上一次散开残留
  void layer.offsetWidth;                       // 强制回流，让云朵动画从头开始
  layer.classList.add('on');
  setTimeout(()=>{
    try{ swap(); }catch(e){ console.error('[wipe]',e); }
    layer.classList.remove('on');
    layer.classList.add('out');                 // 满铺后化开
  }, WIPE_IN);
  setTimeout(()=>{
    layer.classList.add('hidden');
    layer.classList.remove('out');
    if(onDone) onDone();
  }, WIPE_IN+WIPE_OUT+40);
}
function transitionTo(action){
  if(sceneBusy) return;
  if(prefersReducedMotion()){ action(); return; }
  sceneBusy=true;
  cloudWipe(action, null, ()=>{ sceneBusy=false; });
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
  if(loadFill) loadFill.style.width='100%';
  if(loadPct) loadPct.textContent='100%';
  if(loadSub) loadSub.textContent='星光已就位！';
  // 就绪态：进度条让位给"轻触开始"，等玩家点击（这一下同时解锁音频）
  if(loadStart) loadStart.classList.remove('hidden');
  loadLayer.classList.add('ready');
}
function enterGame(){
  if(entered || !loadLayer.classList.contains('ready')) return;  // 未就绪或已入场时忽略
  entered=true;
  loadLayer.classList.remove('ready');
  const menu = document.getElementById('menu');

  // 减少动效：直接切，不做动画
  if(prefersReducedMotion()){
    loadLayer.classList.add('done'); loadLayer.style.display='none';
    if(menu) menu.classList.add('home-enter');
    return;
  }

  // 软块从 LOGO 的真实位置弹开（读实际几何，不用百分比猜，避免"位置跳一下"）
  let origin=null;
  const logo=document.querySelector('.load-logo');
  if(logo){
    const r=logo.getBoundingClientRect();
    origin={ x:r.left+r.width/2, y:r.top+r.height/2 };
  }

  cloudWipe(()=>{
    loadLayer.classList.add('done');
    loadLayer.style.display='none';              // 满铺时切换，绝不会两界面叠影
    if(menu) menu.classList.add('home-enter');   // 首页从 1.04 落入原位
  }, origin);
}
// 整屏与按钮都可点；按钮点击会冒泡到 loadLayer，用 entered 去重
if(loadLayer) loadLayer.addEventListener('click', enterGame);

loadSprites(
  finishLoading,
  (done, total, ok, key)=>{
    const pct=Math.round(done/total*100);
    if(loadFill) loadFill.style.width=pct+'%';
    if(loadPct) loadPct.textContent=pct+'%';
    tipFor(pct);
  }
);
requestAnimationFrame(frame);   // 主循环从启动就跑（加载页主角动画 + 菜单背景）

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
  return { cv, ctx: cv.getContext('2d'), kind: cv.dataset.kind, pose: cv.dataset.pose,
           phase: Math.random()*3, fit };
});
// 由主循环的单一 rAF 调用（见 frame），不再自启 rAF。
// 每个 rig 用各自的局部 ctx，Rig.draw 的 o.ctx 只临时切换、draw 结束立即交还主 ctx，
// 不再每帧做 getElementById + getContext 查询（原实现的强制 DOM 访问 + 全局 ctx 争抢）。
function drawHome(now){
  const T = now/1000;
  for (const r of homeRigs) {
    const dpr = r.fit();
    const w = r.cv.width, h = r.cv.height;
    r.ctx.setTransform(1,0,0,1,0,0);
    r.ctx.clearRect(0,0,w,h);
    r.ctx.setTransform(dpr,0,0,dpr,0,0);
    const pose = Rig.sample(r.pose, T, r.phase);
    const cw=w/dpr, ch=h/dpr;
    const drawH = ch * 0.94;
    if(!SliceRig.draw(r.kind, cw/2, ch*0.97, drawH, pose, { ctx:r.ctx })){
      Rig.draw(r.kind, cw/2, ch*0.97, drawH, pose, { ctx:r.ctx, T });
    }
  }
  Rig.setCtx(ctx);  // 交还主画布上下文（用 core.js 已缓存的 ctx，不再每帧查询 DOM）
}
