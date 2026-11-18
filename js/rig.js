// === 骨骼动画系统 Rig ===
// 把"一张扁平 PNG"升级为可摆腿、挥手、转头的骨骼角色：
//   程序化绘制一幅分层 Q 版角色（头 / 躯干 / 双臂 / 双腿各自独立），
//   每帧按动作状态机采样各关节角度，用 ctx 平移+旋转叠加出真实骨骼运动。
//   全部用正弦波 / easeOutBack 驱动，无逐帧随机，动作可预测、可复位（game-feel 原则）。
//
// 坐标系（画之前先 translate 到脚底、scale(h/2)）：
//   原点 = 脚底中心；向上为负 y；角色总高约 2.0 单位。
//   脚底 0 → 髋 -0.52 → 肩 -1.00 → 颈 -1.08 → 头心 -1.50 → 头顶 ≈ -1.94
//   关节 pivot：髋 (±0.18,-0.52)、肩 (±0.30,-1.00)、颈 (0,-1.08)。
//   各部件函数以"自身 pivot 为原点"绘制，由 joint() 负责移动+旋转。
const Rig = (() => {
  // 绘制目标上下文：游戏画布用主 ctx；大厅 canvas 在绘制前用 setCtx 切换。
  // 两条循环都在 rAF 中顺序执行，各自绘制前设置即可，不会交叠。
  let ctx = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('game').getContext('2d') : null;
  const setCtx = c => { if(c) ctx = c; };
  const TAU = Math.PI * 2;
  const clamp = (v,a,b)=>v<a?a:v>b?b:v;
  const easeOutBack = k => { const c1=1.70158,c3=c1+1,m=k-1; return 1+c3*m*m*m+c1*m*m; };
  // 坐标：脚底 0 → 髋 -0.42 → 肩 -0.72 → 颈 -0.82 → 头心 -1.22，头顶 ≈ -1.62（总高约 1.65）
  const HIP_Y=-0.42, HIP_X=0.17, SHO_Y=-0.72, SHO_X=0.28, NECK_Y=-0.82, HEAD_Y=-1.22;

  // ---- 采样动作：返回各关节角度与位移。state ∈ idle/walk/attack/hit/cheer ----
  // phase 让每个个体摆动错开，避免整屏怪物"齐步走"的塑料感。t 传 game.time。
  function sample(state, t, phase, speed){
    const T = t + (phase||0);
    const p = { legL:0, legR:0, armL:0, armR:0, head:0, body:0, bob:0, squash:1, blink:0, armRaise:0 };
    switch(state){
      case 'walk': {
        const w = T * 9 * clamp(speed||1, 0.6, 1.7), sw=Math.sin(w);
        p.legL =  sw * 0.5;            // 双腿交替 ±28°
        p.legR = -sw * 0.5;
        p.armL = -sw * 0.42;           // 手臂反相摆动（对侧协调）
        p.armR =  sw * 0.42;
        p.body = Math.sin(w*2) * 0.05;
        p.bob  = Math.abs(Math.cos(w)) * 0.05;   // 落脚轻抬
        p.head = -sw * 0.06;
        break;
      }
      case 'attack': {
        const w=T*15;
        p.armRaise = -1.15 + Math.sin(w)*0.35;   // 右手高举挥动（覆盖 armR）
        p.armL = 0.25 + Math.sin(w)*0.12;
        p.body = Math.sin(w)*0.08;
        p.bob  = Math.abs(Math.sin(w))*0.04;
        break;
      }
      case 'cheer': {                  // 大厅待机打招呼
        const w=T*3.2;
        p.armRaise = -2.2 + Math.sin(w)*0.28;    // 举手挥手
        p.armL = 0.1 + Math.sin(w)*0.06;
        p.head = Math.sin(w*0.7)*0.08;
        p.bob  = Math.abs(Math.sin(w))*0.03;
        break;
      }
      case 'hit': {
        const k=clamp(1-((t-(phase||0))%1)*4,0,1);
        p.body=-0.25*k; p.head=0.18*k;
        p.armL=0.5*k; p.armR=-0.5*k;
        p.squash=1-0.12*k;
        break;
      }
      default: {                       // idle：呼吸 + 手臂微摆
        const w=T*2.1;
        p.body=Math.sin(w)*0.025;
        p.armL=0.12+Math.sin(w)*0.05;
        p.armR=-0.12-Math.sin(w)*0.05;
        p.head=Math.sin(w*0.8)*0.035;
        p.bob=Math.sin(w)*0.012;
        p.squash=1+Math.sin(w)*0.02;
      }
    }
    if(p.armRaise) p.armR=p.armRaise;
    // 眨眼：每约 4.2 秒闭眼 0.12 秒
    const cycle=4.2, bt=(t+(phase||0)*0.37)%cycle;
    p.blink = bt > cycle-0.12 ? 1 : 0;
    return p;
  }

  // ---- 绘制原语：三段明度 + 深色描边 ----
  function shape(path, fill, lw, stroke){
    if(fill){ ctx.fillStyle=fill; ctx.fill(path); }
    if(lw>0){ ctx.lineWidth=lw; ctx.strokeStyle=stroke||'#070a16'; ctx.lineJoin='round'; ctx.stroke(path); }
  }
  function grad(x0,y0,x1,y1,stops){
    const g=ctx.createLinearGradient(x0,y0,x1,y1);
    for(const [o,c] of stops) g.addColorStop(o,c);
    return g;
  }
  function ellipse(x,y,rx,ry,fill,lw,rot){
    const p=new Path2D(); p.ellipse(x,y,rx,ry,rot||0,0,TAU); shape(p,fill,lw);
  }
  function poly(pts,fill,lw){
    const p=new Path2D(); p.moveTo(pts[0],pts[1]);
    for(let i=2;i<pts.length;i+=2) p.lineTo(pts[i],pts[i+1]);
    p.closePath(); shape(p,fill,lw);
  }
  function star(x,y,r,fill,lw,n=5,inner=0.45,rot=-Math.PI/2){
    const p=new Path2D();
    for(let i=0;i<n*2;i++){
      const a=rot+i*Math.PI/n, rr=i%2?r*inner:r;
      const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
      if(i===0) p.moveTo(px,py); else p.lineTo(px,py);
    }
    p.closePath(); shape(p,fill,lw);
  }
  // 把原点移到 pivot、旋转，然后回调以 pivot 为 (0,0) 绘制
  function joint(angle, px, py, fn){
    ctx.save(); ctx.translate(px,py); ctx.rotate(angle||0); fn(); ctx.restore();
  }

  const PAL = {
    player: { hair:'#3ec9d8', hairLite:'#7ff0ea', hairDark:'#2695a8', skin:'#ffe0cf', dress:'#eafffb', dressLite:'#ffffff', accent:'#54dcff', boot:'#8fe8df' },
    spore:  { hair:'#57dc98', hairLite:'#9bf3c4', hairDark:'#3aa96c', skin:'#ffe3d2', dress:'#eafff1', accent:'#57dc98', hat:'#ff5d6c', hatDot:'#fff' },
    swift:  { hair:'#b27bff', hairLite:'#d9b8ff', hairDark:'#8352c9', skin:'#ffe0cf', dress:'#f3eaff', accent:'#b27bff' },
    split:  { hair:'#ff8fc7', hairLite:'#ffbfe0', hairDark:'#d15f9c', skin:'#ffe3d2', dress:'#fff0f7', accent:'#ff8fc7' },
    mimic:  { hair:'#5ce0e0', hairLite:'#a5f5f2', hairDark:'#38a8ac', skin:'#e8fff9', dress:'#eafffd', accent:'#5ce0e0' },
    thief:  { hair:'#ffa94d', hairLite:'#ffd39c', hairDark:'#c87a2f', skin:'#ffe2cf', dress:'#fff4e6', accent:'#ffa94d' },
    bomber: { hair:'#ff6b7a', hairLite:'#ffa6b0', hairDark:'#c84252', skin:'#ffe0cf', dress:'#fff0f2', accent:'#ff6b7a' },
    elite:  { hair:'#ffcf5a', hairLite:'#ffe9a8', hairDark:'#c99a2e', skin:'#ffe6d2', dress:'#fffbe8', accent:'#ffcf5a' },
    boss:   { hair:'#ff5470', hairLite:'#ff93a6', hairDark:'#b82f4c', skin:'#ffe0d2', dress:'#2a1636', accent:'#ff5470' },
  };
  const OUT='#070a16', OUTW=0.028;

  // 腿：以髋为原点（绝对 y=-0.42），向下 0.42 到脚底，短粗圆润 + 圆头鞋
  function drawLeg(c){
    poly([-0.12,0, 0.12,0, 0.11,0.24, -0.11,0.24],
      grad(-0.12,0,0.12,0.24,[[0,c.dress],[0.5,c.skin],[1,c.hairLite]]), OUTW);   // 短腿
    ellipse(0,0.31,0.155,0.12,
      grad(-0.155,0.2,0.155,0.43,[[0,c.accent],[1,c.hairDark]]), OUTW);          // 圆头鞋
    ellipse(-0.055,0.28,0.042,0.022,'rgba(255,255,255,.8)',0);                  // 鞋高光
  }
  // 手臂：以肩为原点，蓬松袖子 + 圆手
  function drawArm(c){
    ellipse(0,0.13,0.13,0.17,
      grad(-0.13,-0.04,0.13,0.3,[[0,'#ffffff'],[1,c.dressLite||c.dress]]), OUTW);  // 蓬袖
    ellipse(0,0.32,0.1,0.1,c.skin,OUTW);                                            // 圆手
  }

  // 头：以头心为原点（外部先 translate(0,HEAD_Y)）
  function drawHead(kind,c,p,T){
    ellipse(0,-0.06,0.43,0.4,
      grad(-0.35,-0.4,0.35,0.3,[[0,c.hairLite],[0.5,c.hair],[1,c.hairDark]]), OUTW);   // 后发
    ellipse(0,0.02,0.34,0.31,c.skin,OUTW);                                              // 脸
    const bang=new Path2D();
    bang.moveTo(-0.34,-0.05); bang.quadraticCurveTo(-0.3,-0.34,0,-0.34);
    bang.quadraticCurveTo(0.3,-0.34,0.34,-0.05);
    bang.quadraticCurveTo(0.18,-0.16,0.08,-0.08);
    bang.quadraticCurveTo(0,-0.2,-0.1,-0.09);
    bang.quadraticCurveTo(-0.22,-0.17,-0.34,-0.05); bang.closePath();
    shape(bang,grad(-0.3,-0.34,0.3,0,[[0,c.hairLite],[1,c.hair]]),OUTW);               // 刘海

    const eyeY=0.03, ex=0.135;
    for(const s of [-1,1]){
      if(p.blink){
        ctx.lineWidth=OUTW*1.4; ctx.strokeStyle=OUT; ctx.beginPath();
        ctx.moveTo(s*ex-0.07,eyeY); ctx.quadraticCurveTo(s*ex,eyeY+0.03,s*ex+0.07,eyeY); ctx.stroke();
      } else {
        ellipse(s*ex,eyeY,0.075,0.095,'#ffffff',OUTW*0.9);
        ellipse(s*ex,eyeY+0.008,0.052,0.07,
          grad(s*ex-0.05,eyeY-0.06,s*ex+0.05,eyeY+0.07,[[0,'#bff7ff'],[1,c.accent]]),0);
        ellipse(s*ex,eyeY+0.012,0.026,0.05,'#3a2a4a',0);
        ellipse(s*ex-0.025,eyeY-0.03,0.02,0.026,'#ffffff',0);
      }
      ctx.lineWidth=OUTW; ctx.strokeStyle=OUT; ctx.beginPath();
      ctx.moveTo(s*ex-0.075,eyeY-0.02); ctx.lineTo(s*ex-0.09,eyeY-0.07); ctx.stroke();  // 睫毛
    }
    ellipse(-0.21,0.11,0.055,0.03,'rgba(255,140,170,.5)',0);
    ellipse(0.21,0.11,0.055,0.03,'rgba(255,140,170,.5)',0);
    ctx.lineWidth=OUTW; ctx.strokeStyle=OUT; ctx.beginPath();
    ctx.moveTo(-0.045,0.14); ctx.quadraticCurveTo(0,0.19,0.045,0.14); ctx.stroke();    // 嘴

    switch(kind){
      case 'player':
        for(const s of [-1,1]){
          const tw=new Path2D();
          tw.moveTo(s*0.36,-0.22); tw.quadraticCurveTo(s*0.62,-0.15,s*0.55,0.18);
          tw.quadraticCurveTo(s*0.5,0.34,s*0.34,0.3); tw.quadraticCurveTo(s*0.46,0.12,s*0.36,-0.22);
          tw.closePath(); shape(tw,grad(s*0.34,-0.2,s*0.6,0.3,[[0,c.hairLite],[1,c.hairDark]]),OUTW);
        }
        star(-0.28,-0.3,0.075,'#ffd766',OUTW*0.7); star(0.3,-0.32,0.06,'#ffd766',OUTW*0.7);
        break;
      case 'spore':
        ellipse(0,-0.36,0.36,0.2,grad(-0.3,-0.5,0.3,-0.2,[[0,'#ff8a95'],[1,c.hat]]),OUTW);
        ellipse(-0.16,-0.39,0.06,0.05,c.hatDot,0); ellipse(0.14,-0.42,0.05,0.045,c.hatDot,0); break;
      case 'swift': for(const s of [-1,1]) poly([s*0.18,-0.3,s*0.3,-0.56,s*0.38,-0.26],c.hair,OUTW); break;
      case 'split': for(const s of [-1,1]) ellipse(s*0.36,-0.34,0.15,0.16,grad(s*0.5,-0.5,s*0.2,-0.2,[[0,c.hairLite],[1,c.hair]]),OUTW); break;
      case 'mimic':
        ctx.lineWidth=0.045; ctx.strokeStyle=c.hair; ctx.lineCap='round'; ctx.beginPath();
        ctx.moveTo(0,-0.38); ctx.quadraticCurveTo(0.05,-0.6,0.18,-0.56); ctx.stroke(); break;
      case 'thief':
        for(const s of [-1,1]) poly([s*0.2,-0.28,s*0.26,-0.52,s*0.4,-0.34],c.hair,OUTW);
        poly([0.06,0,0.28,-0.02,0.26,0.09,0.08,0.09],'#3a2a4a',OUTW*0.6); break;
      case 'bomber':
        ellipse(0,-0.42,0.16,0.16,'#4a3550',OUTW);
        ctx.lineWidth=0.03; ctx.strokeStyle='#ffcf5a'; ctx.beginPath();
        ctx.moveTo(0,-0.55); ctx.quadraticCurveTo(0.08,-0.68,0.02,-0.72); ctx.stroke();
        star(0.03,-0.73,0.04,'#fff3a0',0); break;
      case 'elite':
        for(const s of [-1,1]){ const w=new Path2D(); w.ellipse(s*0.42,-0.1,0.22,0.12,s*0.5,0,TAU); shape(w,'rgba(220,245,255,.55)',OUTW*0.7,'#a9d8ee'); }
        poly([-0.2,-0.4,-0.16,-0.56,-0.06,-0.46,0,-0.6,0.06,-0.46,0.16,-0.56,0.2,-0.4],'#ffd766',OUTW); break;
      case 'boss':
        for(const s of [-1,1]) poly([s*0.2,-0.32,s*0.34,-0.66,s*0.44,-0.3],'#3a1a2a',OUTW);
        poly([-0.22,-0.4,-0.18,-0.58,0,-0.5,0.18,-0.58,0.22,-0.4],'#ffd766',OUTW);
        star(0,-0.52,0.06,'#ff5470',OUTW*0.6); break;
    }
  }

  // 躯干：以身体中心为原点（外部 translate(0,-0.58)），覆盖肩 -0.72 到髋 -0.42
  function drawBody(kind,c){
    const dark = kind==='boss'||kind==='elite';
    if(dark) poly([-0.22,-0.16,0.22,-0.16,0.4,0.22,-0.4,0.22],c.dress,OUTW);          // 披风
    // 蓬蓬裙摆（圆润，盖住髋）
    const skirt=new Path2D();
    skirt.moveTo(-0.2,-0.04); skirt.quadraticCurveTo(-0.42,0.16,-0.34,0.22);
    skirt.quadraticCurveTo(0,0.3,0.34,0.22); skirt.quadraticCurveTo(0.42,0.16,0.2,-0.04);
    skirt.closePath();
    shape(skirt,grad(-0.3,-0.04,0.34,0.26,[[0,c.dressLite||c.dress],[0.5,c.dress],[1,c.hairLite]]),OUTW);
    // 上衣（圆润梯形）
    const top=new Path2D();
    top.moveTo(-0.19,-0.16); top.quadraticCurveTo(0,-0.2,0.19,-0.16);
    top.lineTo(0.22,0.02); top.quadraticCurveTo(0,0.08,-0.22,0.02); top.closePath();
    shape(top,grad(-0.22,-0.16,0.22,0.06,[[0,'#ffffff'],[1,c.dress]]),OUTW);
    star(0,-0.06,0.09,c.accent,OUTW*0.7); ellipse(0,-0.06,0.028,0.028,'#ffffff',0);  // 胸针
  }

  // ---- 主绘制：在 (x,y) 以高度 h 画骨骼角色 ----
  function draw(kind, x, y, h, pose, opts){
    const c=PAL[kind]||PAL.spore, o=opts||{}, p=pose||sample('idle',0,0);
    if(o.ctx) setCtx(o.ctx);                       // 大厅 canvas 等外部上下文
    const pop = o.pop!==undefined ? easeOutBack(clamp(o.pop,0,1)) : 1;
    const unit = h/1.65;   // h = 角色实际像素高；1.65 = 角色单位总高
    const sx=(o.flipX?-1:1)*unit*pop*(p.squash||1), sy=unit*pop*(p.squash||1);
    ctx.save();
    ctx.translate(x,y);
    // 投影贴地，不随 bob 浮动
    const sh=ctx.createRadialGradient(0,0,0,0,0,0.42);
    sh.addColorStop(0,'rgba(80,60,110,.26)'); sh.addColorStop(1,'rgba(80,60,110,0)');
    ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(0,0,0.42,0.13,0,0,TAU); ctx.fill();
    ctx.scale(sx,sy);
    ctx.translate(0,-(p.bob||0));
    if(o.alpha!==undefined) ctx.globalAlpha=o.alpha;
    if(o.hue) ctx.filter=`hue-rotate(${o.hue}deg)`;
    ctx.save(); ctx.rotate(p.body||0);
      joint(p.legL, -HIP_X, HIP_Y, ()=>drawLeg(c));
      joint(p.legR,  HIP_X, HIP_Y, ()=>drawLeg(c));
      ctx.save(); ctx.translate(0,-0.58); drawBody(kind,c); ctx.restore();
      joint(p.armL, -SHO_X, SHO_Y, ()=>drawArm(c));
      joint(p.armR,  SHO_X, SHO_Y, ()=>drawArm(c));
      joint(p.head,  0, NECK_Y, ()=>{ ctx.translate(0,HEAD_Y-NECK_Y); drawHead(kind,c,p,o.T||0); });
    ctx.restore();
    ctx.restore();
  }

  return { sample, draw, setCtx, PAL };
})();
