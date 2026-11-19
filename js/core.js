const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const VIEW = { w: 0, h: 0 };
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  VIEW.w = window.innerWidth; VIEW.h = window.innerHeight;
  cvs.width = Math.floor(VIEW.w * dpr); cvs.height = Math.floor(VIEW.h * dpr);
  cvs.style.width = VIEW.w + 'px'; cvs.style.height = VIEW.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// === 工具 ===
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const rand = (a,b)=>a+Math.random()*(b-a);
const randInt = (a,b)=>Math.floor(rand(a,b+1));
const dist2 = (ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const TAU = Math.PI*2;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randInt(0,i);[a[i],a[j]]=[a[j],a[i]];}return a;}
function fmtTime(s){const m=Math.floor(s/60)|0,x=Math.floor(s%60)|0;return String(m).padStart(2,'0')+':'+String(x).padStart(2,'0');}
let uid = 1;

// === Juice / game-feel：trauma 震屏 + 分级反馈 + hit-stop ===
// trauma 叠加、线性衰减，实际震动 = trauma²，用叠加正弦采样而非逐帧随机（避免静电式抖动）
const Juice = {
  trauma:0, stop:0, clock:0,
  shakeScale:1, flashScale:1,   // 可访问性开关（0~1）
  _last:{},                     // 同类事件节流时间戳：key -> clock
  init(){
    try{
      const s=JSON.parse(localStorage.getItem('ns_feel')||'{}');
      this.shakeScale = s.shake!==undefined?s.shake:CFG.FEEL.startShake;
      this.flashScale = s.flash!==undefined?s.flash:CFG.FEEL.startFlash;
    }catch(_){}
  },
  save(){ try{localStorage.setItem('ns_feel',JSON.stringify({shake:this.shakeScale,flash:this.flashScale}));}catch(_){} },
  setScale(kind, v){
    if(kind==='shake') this.shakeScale=v;
    else if(kind==='flash') this.flashScale=v;
    this.save();
  },
  // 节流：同一 key 在 gap 秒内重复触发直接跳过（clock 由 tick 用真实时间推进）
  ready(key, gap){
    if(!key || !gap) return true;
    const last=this._last[key];
    if(last!==undefined && this.clock-last<gap) return false;
    this._last[key]=this.clock;
    return true;
  },
  // v=注入量；cap=软上限（1 表示不限制，仅供低频重大事件使用）；key/gap=同类节流
  addTrauma(v, cap=1, key=null, gap=0){
    if(!this.ready(key,gap)) return;
    let next=this.trauma+v;
    // 已高于软上限时保持原值：不让高频小命中削弱重大事件的大震屏
    if(cap<1 && next>cap) next=Math.max(this.trauma,cap);
    this.trauma=clamp(next,0,1);
  },
  hitStop(dur){ this.stop=Math.max(this.stop,dur); },
  // 低频重大事件的完整反馈（震屏 + 停顿 + 闪光）；x/y/color 预留给后续粒子钩子
  feedback(tier, x, y, color, cap=1, key=null, gap=0){
    if(!this.ready(key,gap)) return; // 节流时整组通道一起跳过
    const T=CFG.FEEL;
    if(tier==='small'){ this.addTrauma(0.13,cap); }
    else if(tier==='medium'){ this.addTrauma(0.34,cap); this.hitStop(T.hitStop.medium); }
    else if(tier==='large'){ this.addTrauma(0.78,cap); this.hitStop(T.hitStop.large); game.flash=Math.max(game.flash,0.30); }
  },
  // 用真实时间衰减，hit-stop/暂停时也不会把镜头卡在偏心位置
  tick(realDt){
    this.clock+=realDt;
    this.stop=Math.max(0,this.stop-realDt);
    this.trauma=Math.max(0, this.trauma-CFG.FEEL.traumaDecay*realDt);
  },
  // 两个不同频率正弦叠加的噪声，返回 [-1,1]
  noise(seed){ return 0.6*Math.sin(this.clock*11+seed)+0.4*Math.sin(this.clock*23+seed*2.3); },
  offset(){
    const s=this.trauma*this.trauma*this.shakeScale;
    return { x:CFG.FEEL.shakeMax*s*this.noise(0.7), y:CFG.FEEL.shakeMax*s*this.noise(3.1) };
  },
  roll(){ return CFG.FEEL.shakeRoll*this.trauma*this.trauma*this.shakeScale*this.noise(5.4); },
};
// 缓动：从 sq 回到 1，带轻微过冲（back），用于 squash & stretch 回弹
function easeOutBack(k){const c1=1.70158,c3=c1+1,m=k-1;return 1+c3*m*m*m+c1*m*m;}

// === 音效：Web Audio 程序化合成，零素材依赖 ===
const Sound = (() => {
  let ac = null;
  let enabled = true;
  try{
    const s=JSON.parse(localStorage.getItem('ns_sound')||'{}');
    if(s.enabled!==undefined) enabled=!!s.enabled;
  }catch(_){}
  const ensure = () => {
    if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  };
  function tone(freq, dur, type='square', vol=.05, slide=null){
    if(!enabled) return;
    const a = ensure(); if (!a) return;
    const o=a.createOscillator(), g=a.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,slide), a.currentTime+dur);
    g.gain.setValueAtTime(vol,a.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+dur);
  }
  function noise(dur=.15, vol=.06){
    if(!enabled) return;
    const a=ensure(); if(!a) return;
    const n=Math.floor(a.sampleRate*dur), buf=a.createBuffer(1,n,a.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=a.createBufferSource(), g=a.createGain(); s.buffer=buf;
    g.gain.value=vol; s.connect(g); g.connect(a.destination); s.start();
  }
  return {
    unlock: ensure,
    get enabled(){ return enabled; },
    setEnabled(v){
      enabled=!!v;
      try{ localStorage.setItem('ns_sound',JSON.stringify({enabled})); }catch(_){}
      if(enabled) ensure(); // 开启时解锁音频上下文（需在用户手势中调用）
    },
    shoot(){ tone(740,.07,'sine',.026,1100); },
    hit(){ tone(420,.05,'triangle',.018,300); },
    meteor(){ tone(720,.17,'triangle',.038,190); tone(185,.10,'sine',.03,75); },
    nova(){ tone(392,.19,'sine',.046,784); tone(587,.24,'triangle',.021,1174); },
    kill(){ tone(660,.09,'sine',.03,990); },
    pickup(){ tone(1047,.06,'sine',.035,1568); },
    levelup(){ [659,784,988,1319].forEach((f,i)=>setTimeout(()=>tone(f,.16,'sine',.05),i*85)); },
    chest(){ [784,1047,1319].forEach((f,i)=>setTimeout(()=>tone(f,.18,'sine',.05),i*80)); },
    hurt(){ tone(300,.16,'triangle',.05,180); },
    // Boss 登场：轻快跳跃音阶（不再低沉压迫）
    boss(){ [523,622,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,.28,'triangle',.05),i*130)); },
    win(){ [523,659,784,1047,1319,1568].forEach((f,i)=>setTimeout(()=>tone(f,.28,'sine',.055),i*120)); },
    lose(){ [523,440,349].forEach((f,i)=>setTimeout(()=>tone(f,.3,'sine',.04),i*150)); },
  };
})();

// === 输入：统一移动向量（键盘 + 浮动摇杆）===
const Input = {
  keys:new Set(), joy:{active:false,id:null,ox:0,oy:0,dx:0,dy:0,r:56,x:0,y:0},
  init(){
    for(const type of ['selectstart','contextmenu','dragstart']){
      document.addEventListener(type,e=>e.preventDefault());
    }
    addEventListener('keydown',e=>{
      if(game.state==='playing' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); Sound.unlock();
      // 卡牌键盘选择
      if (game.state==='levelup' && !e.repeat && !isSettingsOpen() && ['Digit1','Digit2','Digit3'].includes(e.code)) {
        const i=+e.code.slice(-1)-1; if (game.cards[i]) chooseCard(i);
      }
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('blur',()=>this.keys.clear());
    cvs.addEventListener('pointerdown',e=>{
      Sound.unlock();
      if (game.state!=='playing' || this.joy.active || e.button!==0) return;
      const j=this.joy; j.active=true; j.id=e.pointerId; j.ox=e.clientX; j.oy=e.clientY;
      j.x=e.clientX; j.y=e.clientY; j.dx=0; j.dy=0;
      try{cvs.setPointerCapture(e.pointerId);}catch(_){}
    });
    cvs.addEventListener('pointermove',e=>{
      const j=this.joy; if(!j.active||e.pointerId!==j.id) return;
      let dx=e.clientX-j.ox, dy=e.clientY-j.oy, len=Math.hypot(dx,dy)||1;
      const d=Math.min(len,j.r), nx=dx/len, ny=dy/len;
      j.x=j.ox+nx*d; j.y=j.oy+ny*d;
      const strength=clamp((len-7)/(j.r-7),0,1); j.dx=nx*strength; j.dy=ny*strength;
    });
    const up=e=>{const j=this.joy; if(e.pointerId===j.id){j.active=false;j.id=null;j.dx=0;j.dy=0;}};
    cvs.addEventListener('pointerup',up); cvs.addEventListener('pointercancel',up);
    cvs.addEventListener('lostpointercapture',up);
  },
  vector(){
    const k=this.keys;
    let x=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0);
    let y=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0);
    if(x||y){const l=Math.hypot(x,y);return {x:x/l,y:y/l};}
    const j=this.joy; if(j.active&&(j.dx||j.dy)){
      return {x:j.dx,y:j.dy};
    }
    return {x:0,y:0};
  }
};

