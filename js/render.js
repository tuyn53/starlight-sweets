// === 渲染 ===
const hudEl=document.getElementById('hud');
let hudVisible=false;
function render(alpha){
  const inGame=game.state==='playing'||game.state==='levelup';
  if(hudVisible!==inGame){
    hudVisible=inGame;
    hudEl.style.display=inGame?'flex':'none';
    document.getElementById('settingsBtn').classList.toggle('hidden',inGame);
  }
  if(game.state==='menu') return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const sh=Juice.offset();
  ctx.save();
  ctx.translate(sh.x-game.cam.x, sh.y-game.cam.y);
  if(Juice.shakeScale>0 && Juice.roll()){
    ctx.translate(VIEW.w/2, VIEW.h/2); ctx.rotate(Juice.roll()); ctx.translate(-VIEW.w/2, -VIEW.h/2);
  }

  drawScene();
  drawHazards();
  if(game.state==='playing' && !player.weapons.aura && !game.bossIntro){
    ctx.strokeStyle='#fff4ce59';
    ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.arc(player.x,player.y,player.pickup,0,TAU); ctx.stroke();
  }
  drawAura();
  drawExpansionGround();
  drawGems();
  drawChests();
  drawProps();
  drawEnemies(alpha);
  drawAimMarker();
  drawBullets(alpha);
  drawNova();
  drawLightning();
  drawBattleMotions();
  drawEBullets();
  drawLaserFx();
  if(game.bossIntro) drawBossEntrance();
  drawPlayer(alpha);
  drawParts();
  drawDmgTexts();

  ctx.restore();
  // 闪光改暖粉，受可访问性开关限制且封顶
  const fl=Math.min(.22,game.flash*.36)*Juice.flashScale;
  if(fl>0){ ctx.fillStyle=`rgba(255,190,215,${fl})`; ctx.fillRect(0,0,VIEW.w,VIEW.h); }
  if(game.state==='playing') drawJoystick();
  if(inGame) updateHUD(false);
}

// === 绘制工具：统一左上光 / 三段明度 / 柔和深描边 ===
function sqScale(ent){
  if(!ent.sqT || ent.sqT<=0) return {sx:1,sy:1};
  const k=1-clamp(ent.sqT/0.2,0,1), s=ent.sq*(1-easeOutBack(k));
  return {sx:1+s*0.35, sy:1-s*0.30};
}
function orb(x,y,r,pal,lit=true){
  const g=ctx.createRadialGradient(x-r*0.38,y-r*0.42,r*0.1,x,y,r*1.15);
  g.addColorStop(0,pal.light); g.addColorStop(0.42,pal.main); g.addColorStop(1,pal.dark);
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
  ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=Math.max(1.5,r*0.12); ctx.stroke();
  if(lit){ ctx.fillStyle='rgba(255,255,255,.6)'; ctx.beginPath();
    ctx.ellipse(x-r*0.36,y-r*0.44,r*0.26,r*0.15,-0.6,0,TAU); ctx.fill(); }
}
function poly(pts,fill,stroke=true,lw=2){
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
  if(stroke){ ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=lw; ctx.stroke(); }
}
function shadow(x,y,rx,ry,a=0.22){ ctx.fillStyle=`rgba(90,70,110,${a})`;
  ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,TAU); ctx.fill(); }
// 通用星形（n 角，内外半径比 inner）
function starPath(x,y,r,inner,n,rot=0){
  ctx.beginPath();
  for(let i=0;i<n*2;i++){
    const a=rot+i*Math.PI/n, rr=i%2===0?r:r*inner;
    const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
}
function star(x,y,r,color,n=5,inner=0.45,rot=0,stroke=false){
  starPath(x,y,r,inner,n,rot); ctx.fillStyle=color; ctx.fill();
  if(stroke){ ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=Math.max(1,r*0.12); ctx.stroke(); }
}

// Terrain follows the camera. Lighting and the meadow border are screen overlays.
function drawScene(){
  const theme=actOf(game.level).key, w=VIEW.w, h=VIEW.h;
  const padding=CFG.FEEL.shakeMax+Math.ceil(Math.hypot(w,h)*CFG.FEEL.shakeRoll/2)+2;
  drawTilemap(ctx,theme,game.level,game.cam,w,h,padding);
  if(theme==='meadow') drawMeadowLight(w,h);
}

function drawMeadowLight(w,h){
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const light=ctx.createLinearGradient(w,0,w*.18,h*.68);
  light.addColorStop(0,'#fff4a448'); light.addColorStop(.48,'#ffec900a'); light.addColorStop(1,'#69883812');
  ctx.fillStyle=light; ctx.fillRect(0,0,w,h);
  ctx.save();
  ctx.translate(w,h*.02); ctx.rotate(.64);
  const ray=ctx.createLinearGradient(-95,0,38,0);
  ray.addColorStop(0,'#fff3a500'); ray.addColorStop(.42,'#fff3a530');
  ray.addColorStop(.55,'#fffbc249'); ray.addColorStop(1,'#fff3a500');
  ctx.fillStyle=ray; ctx.fillRect(-95,-h*.65,133,h*1.3);
  ctx.restore();

  for(let corner=0;corner<4;corner++){
    ctx.save();
    ctx.translate(corner%2?w:0,corner>=2?h:0);
    ctx.scale(corner%2?-1:1,corner>=2?-1:1);
    for(let n=0;n<27;n++){
      const seed=terrainHash(0,n,corner+3)/0x100000000, x=seed*68-10;
      const y=terrainHash(1,n,corner)/0x100000000*Math.max(12,64-x);
      ctx.fillStyle=['#809f59','#91b664','#a9c872','#c5d780'][n%4];
      ctx.beginPath(); ctx.ellipse(x,y,6+seed*8,2.5+seed*4,seed*3,0,TAU); ctx.fill();
    }
    drawTerrainDaisy(ctx,15,30,.75);
    drawTerrainDaisy(ctx,37,13,.66);
    ctx.restore();
  }
  ctx.restore();
}

function drawGems(){
  for(const g of game.gems){
    const t=game.time*2.4+g.x*.1, bob=Math.sin(t)*1.6;
    const r=g.r*1.12;
    shadow(g.x,g.y+r,r*1.1,r*.43,.24);
    ctx.save(); ctx.translate(g.x,g.y+bob);
    const gem=[[0,-r*1.65],[r,0],[0,r*1.65],[-r,0]];
    poly(gem,'#9660cb',false);
    poly([[0,-r*1.65],[-r,0],[0,r*.28]],'#8a78e8',false);
    poly([[0,-r*1.65],[r,0],[0,r*.28]],'#d9f1ff',false);
    poly([[0,r*.28],[r,0],[0,r*1.65]],'#987de1',false);
    ctx.beginPath(); ctx.moveTo(0,-r*1.65); ctx.lineTo(r,0);
    ctx.lineTo(0,r*1.65); ctx.lineTo(-r,0); ctx.closePath();
    ctx.lineJoin='round'; ctx.strokeStyle='#fff8ff'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.strokeStyle='#493564'; ctx.lineWidth=1.1; ctx.stroke();
    star(r*1.5,-r*.95,2.6+Math.sin(t)*1.5,'#fffef2',4,.28,0);
    ctx.restore();
  }
}
function drawChests(){
  for(const c of game.chests){
    const bob=Math.sin(c.t*3)*3, glow=0.5+0.5*Math.sin(c.t*4);
    ctx.save(); ctx.translate(c.x,c.y+bob);
    shadow(0,c.r*0.9+3-bob,c.r*1.15,c.r*0.45,0.26);
    const gl=ctx.createRadialGradient(0,0,2,0,0,c.r*2.4);
    gl.addColorStop(0,`rgba(255,217,122,${0.3+0.12*glow})`); gl.addColorStop(1,'rgba(255,217,122,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,c.r*2.4,0,TAU); ctx.fill();
    const w=c.r, h=c.r*0.72;
    poly([[-w,-h*0.25],[w,-h*0.25],[w*0.92,h],[-w*0.92,h]],'#c98a4b',true,2);
    poly([[-w,-h*0.25],[w,-h*0.25],[w*0.82,-h*0.9],[-w*0.82,-h*0.9]],'#f0b96e',true,2);
    ctx.fillStyle='#ffd97a'; ctx.fillRect(-w*0.92,-h*0.38,w*1.84,h*0.18);
    ctx.fillStyle='#fff7d6'; ctx.fillRect(-w*0.16,-h*0.72,w*0.32,h*0.7);
    ctx.fillStyle='#a9642c'; ctx.fillRect(-w*0.05,-h*0.3,w*0.1,h*0.16);
    ctx.restore();
  }
}

// 资源物：随机刷新的星星水晶（可破坏）
function drawProps(){
  for(const p of game.props){
    if(p.dead) continue;
    const t=game.time*2.2+p.phase, bob=Math.sin(t)*2.4, sway=Math.sin(t*0.8)*0.07;
    const hurt=p.hit>0;
    ctx.save(); ctx.translate(p.x,p.y+bob);
    shadow(0,p.r*1.05-bob,p.r*1.05,p.r*0.38,0.2);
    const gl=ctx.createRadialGradient(0,0,2,0,0,p.r*2.7);
    gl.addColorStop(0,'rgba(150,232,255,.38)'); gl.addColorStop(1,'rgba(150,232,255,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,p.r*2.7,0,TAU); ctx.fill();
    ctx.rotate(sway);
    const w=p.r*0.74, h=p.r*1.1;
    // 水晶主体：左亮右暗两块切面
    poly([[-w,0],[0,-h],[0,h*0.92]],hurt?'#ffffff':'#d8f7ff',true,2);
    poly([[w,0],[0,-h],[0,h*0.92]],hurt?'#ffd8ec':'#7fd0f0',true,2);
    poly([[-w*0.42,h*0.18],[0,h*0.92],[w*0.42,h*0.18]],hurt?'#ffffff':'#a9e9ff',false);
    // 高光 + 环绕小星
    ctx.fillStyle='rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.ellipse(-w*0.32,-h*0.42,w*0.16,h*0.3,0.35,0,TAU); ctx.fill();
    star(Math.sin(t*1.3)*p.r*1.5, -h*1.05+Math.cos(t*1.7)*2, p.r*0.34, '#fff6cf', 4, 0.4, t, true);
    // 血条（受损后显示）
    if(p.hp<p.maxHp){
      const bw=p.r*2, bx=-bw/2, by=-h-10;
      ctx.fillStyle='rgba(56,30,72,.55)'; ctx.fillRect(bx,by,bw,5);
      ctx.fillStyle='#7fd8ff'; ctx.fillRect(bx,by,bw*clamp(p.hp/p.maxHp,0,1),5);
      ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,5);
    }
    ctx.restore();
  }
}

// 攻击范围环：提示"怪进圈才会开火"
// 当前锁定目标：虚线准星（高优先级目标更醒目）
function drawAimMarker(){
  if(game.state!=='playing') return;
  const t=game.aimTarget;
  if(!t || t.dead) return;
  const tier=targetTier(t), hot=tier>=CFG.AIM.tier.elite;
  const r=(t.r||14)+11+Math.sin(game.time*6)*2;
  ctx.save(); ctx.translate(t.x,t.y-(t.r||14)*0.15);
  ctx.strokeStyle=hot?'rgba(255,206,90,.95)':'rgba(255,255,255,.55)';
  ctx.lineWidth=hot?2.6:2; ctx.setLineDash([7,8]); ctx.lineDashOffset=-game.time*34;
  ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke();
  ctx.setLineDash([]);
  // 四向小刻线
  for(let k=0;k<4;k++){
    const a=k*Math.PI/2+game.time*0.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*(r+3),Math.sin(a)*(r+3));
    ctx.lineTo(Math.cos(a)*(r+8),Math.sin(a)*(r+8));
    ctx.stroke();
  }
  ctx.restore();
}

// 星辉结界（彩虹星光领域）
function drawAura(){
  const lv=player.weapons.aura?player.weapons.aura.level:0; if(!lv)return;
  const R=(70+lv*13)*areaScale(), t=game.time;
  ctx.save(); ctx.translate(player.x,player.y);
  const rank=skillRank('aura'), count=4+rank, pal=CANDY_GLASS.mint;
  ctx.rotate(t*.22);
  for(let i=0;i<count;i++){
    ctx.rotate(TAU/count);
    ctx.beginPath(); ctx.arc(0,0,R,-.22,.22); ctx.strokeStyle=pal[0]; ctx.lineWidth=2; ctx.stroke();
    cutGem(R,0,Math.PI/2,7,3,pal);
    if(rank>=2) cutGem(R-6,0,0,3,2,pal);
    if(rank===3){ ctx.beginPath(); ctx.arc(0,0,R-4,.25,.42); ctx.stroke(); }
  }
  ctx.restore();
}

// === Q 版娘化精灵回退绘制（精灵图加载失败时使用；甜系配色）===
function chibiFace(pal, eyeColor, mood){
  ctx.fillStyle='rgba(255,150,175,.38)';
  ctx.beginPath(); ctx.ellipse(-0.42,0.16,0.16,0.09,0,0,TAU); ctx.ellipse(0.42,0.16,0.16,0.09,0,0,TAU); ctx.fill();
  const eyeY=-0.06;
  for(const s of [-1,1]){
    const ex=s*0.34;
    if(mood==='angry'){
      ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=0.09; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(ex-0.16,eyeY-0.02); ctx.lineTo(ex+0.16,eyeY+0.08); ctx.stroke();
    } else {
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(ex,eyeY,0.17,0.21,0,0,TAU); ctx.fill();
      ctx.fillStyle=eyeColor||'#4a3a63';
      ctx.beginPath(); ctx.ellipse(ex,eyeY+0.02,0.115,0.16,0,0,TAU); ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(ex-0.05,eyeY-0.06,0.055,0,TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(ex+0.06,eyeY+0.08,0.028,0,TAU); ctx.fill();
    }
  }
  ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=0.055; ctx.lineCap='round';
  ctx.beginPath();
  if(mood==='angry'){ ctx.moveTo(-0.1,0.34); ctx.quadraticCurveTo(0,0.28,0.1,0.34); }
  else { ctx.moveTo(-0.09,0.3); ctx.quadraticCurveTo(0,0.39,0.09,0.3); }
  ctx.stroke();
}
function chibiBody(pal){
  ctx.fillStyle=pal.dark;
  ctx.beginPath(); ctx.ellipse(-0.3,0.9,0.19,0.12,0,0,TAU); ctx.ellipse(0.3,0.9,0.19,0.12,0,0,TAU); ctx.fill();
  ctx.fillStyle=pal.main; ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=0.07;
  ctx.beginPath(); ctx.moveTo(-0.3,0.35); ctx.lineTo(-0.55,0.92); ctx.lineTo(0.55,0.92); ctx.lineTo(0.3,0.35); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle=pal.light; ctx.beginPath(); ctx.moveTo(-0.3,0.4); ctx.lineTo(-0.44,0.86); ctx.lineTo(-0.22,0.86); ctx.closePath(); ctx.fill();
  ctx.fillStyle=pal.light;
  ctx.beginPath(); ctx.arc(-0.56,0.62,0.13,0,TAU); ctx.arc(0.56,0.62,0.13,0,TAU); ctx.fill();
}
function chibiHead(pal){
  const g=ctx.createRadialGradient(-0.3,-0.4,0.1,0,0,0.85);
  g.addColorStop(0,pal.light); g.addColorStop(0.45,pal.main); g.addColorStop(1,pal.dark);
  ctx.fillStyle=g; ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=0.09;
  ctx.beginPath(); ctx.arc(0,0,0.62,0,TAU); ctx.fill(); ctx.stroke();
}
function chibiAhoge(color){
  ctx.strokeStyle=color; ctx.lineWidth=0.09; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(0,-0.6); ctx.quadraticCurveTo(0.14,-0.95,0.36,-0.82);
  ctx.quadraticCurveTo(0.5,-0.74,0.42,-0.58); ctx.stroke();
}
function drawChibi(e,pal,flash){
  const T=game.time, R=e.r;
  const hair=flash?'#fff':pal.dark, main=flash?'#fff':pal.main, light=flash?'#fff':pal.light;
  const mood=(e.mech==='explode'&&e.fuse>=0)||e.mech==='phase'?'angry':null;
  const t=e.type;
  if(e.hidden){ ctx.save(); ctx.globalAlpha=0.22; }
  if(t==='elite'){
    ctx.save(); ctx.globalAlpha*=0.55;
    for(const s of [-1,1]){
      ctx.fillStyle='#dff6ff'; ctx.strokeStyle=pal.main; ctx.lineWidth=0.05;
      ctx.beginPath(); ctx.ellipse(s*0.7,-0.05,0.42,0.72,s*0.4,0,TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  if(t==='swift'){
    const flap=Math.sin(T*13+e.phase)*0.25;
    for(const s of [-1,1]){
      ctx.save(); ctx.rotate(s*flap);
      poly([[-0.1,0.4],[-0.05,0.95],[-0.5,1.2]],flash?'#fff':pal.dark,true,0.06);
      ctx.restore();
    }
  }
  chibiBody({main,light,dark:hair});
  if(t==='spore'){ for(const s of [-1,1]){ ctx.fillStyle=hair; ctx.beginPath(); ctx.ellipse(s*0.6,0.15,0.2,0.5,s*0.25,0,TAU); ctx.fill(); } }
  else if(t==='split'){ for(const s of [-1,1]){ ctx.fillStyle=hair; ctx.beginPath(); ctx.arc(s*0.62,-0.42,0.24,0,TAU); ctx.fill(); } }
  else if(t==='swift'){ ctx.fillStyle=hair; ctx.beginPath(); ctx.ellipse(0,0.15,0.66,0.72,0,0,TAU); ctx.fill(); }
  else if(t==='thief'){ ctx.fillStyle=hair; ctx.beginPath(); ctx.ellipse(0,-0.3,0.63,0.5,0,Math.PI,TAU); ctx.fill(); }
  chibiHead(pal);
  if(t==='spore'){
    ctx.fillStyle=flash?'#fff':'#ff9bb2'; ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=0.08;
    ctx.beginPath(); ctx.ellipse(0,-0.62,0.78,0.42,0,Math.PI,TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; for(const dx of [-0.35,0.1,0.42]){ ctx.beginPath(); ctx.arc(dx,-0.78,0.09,0,TAU); ctx.fill(); }
  } else if(t==='swift'){
    for(const s of [-1,1]) poly([[s*0.3,-0.5],[s*0.5,-1.05],[s*0.68,-0.42]],flash?'#fff':pal.dark,true,0.06);
  } else if(t==='thief'){
    for(const s of [-1,1]) poly([[s*0.3,-0.55],[s*0.42,-1.0],[s*0.68,-0.5]],flash?'#fff':pal.dark,true,0.06);
    ctx.fillStyle='#5a4a72'; ctx.beginPath(); ctx.ellipse(0.32,-0.06,0.22,0.13,-0.2,0,TAU); ctx.fill();
  } else if(t==='bomber'){
    ctx.fillStyle='#7a5f86'; ctx.beginPath(); ctx.arc(0,-0.72,0.3,0,TAU); ctx.fill();
    ctx.strokeStyle='#caa46a'; ctx.lineWidth=0.07; ctx.beginPath(); ctx.moveTo(0,-1.0); ctx.quadraticCurveTo(0.15,-1.2,0.32,-1.1); ctx.stroke();
    if(e.fuse>=0){ ctx.fillStyle='#ffd166'; ctx.shadowColor='#ff9c4a'; ctx.shadowBlur=5;
      ctx.beginPath(); ctx.arc(0.32,-1.1,0.11+0.04*Math.sin(T*24),0,TAU); ctx.fill(); ctx.shadowBlur=0; }
  } else if(t==='elite'){
    poly([[-0.5,-0.6],[-0.35,-0.92],[-0.12,-0.66],[0,-0.98],[0.12,-0.66],[0.35,-0.92],[0.5,-0.6]],'#ffd76a',true,0.06);
    for(const s of [-1,1]){ ctx.strokeStyle='#ffd76a'; ctx.lineWidth=0.05; ctx.beginPath(); ctx.moveTo(s*0.2,-0.62); ctx.quadraticCurveTo(s*0.4,-1.0,s*0.55,-0.9); ctx.stroke();
      ctx.fillStyle='#ffd76a'; ctx.beginPath(); ctx.arc(s*0.55,-0.9,0.07,0,TAU); ctx.fill(); }
  } else if(t==='boss'){
    const rage=e.phaseStage||1, c=e.color;
    for(const s of [-1,1]) poly([[s*0.35,-0.5],[s*0.62,-1.15-rage*0.06],[s*0.72,-0.42]],flash?'#fff':pal.dark,true,0.07);
    poly([[-0.48,-0.6],[-0.3,-0.86],[-0.1,-0.62],[0,-0.9],[0.1,-0.62],[0.3,-0.86],[0.48,-0.6]],c,true,0.06);
    if(rage>=2){ ctx.fillStyle=c; ctx.shadowColor=c; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(0,0.05,0.1,0,TAU); ctx.fill(); ctx.shadowBlur=0; }
  }
  chibiAhoge(hair);
  chibiFace(pal, t==='boss'?e.color:null, mood);
  if(e.carrying){ ctx.fillStyle=CFG.ART.friend.main; ctx.shadowColor='#5ad6ff'; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.moveTo(0.55,0.55); ctx.lineTo(0.68,0.72); ctx.lineTo(0.55,0.9); ctx.lineTo(0.42,0.72); ctx.closePath(); ctx.fill(); ctx.shadowBlur=0; }
  if(e.hidden) ctx.restore();
}

function drawEnemies(alpha){
  const T=game.time, A=CFG.ART;
  for(const e of game.enemies){
    if(e.activateAt>T) continue;
    const x=e.ox+(e.x-e.ox)*alpha, y=e.oy+(e.y-e.oy)*alpha;
    const pal=A[e.pal]||A.slime;
    const age=T-(e.born||0), spawn=clamp(age/0.35,0,1), pop=easeOutBack(spawn);
    if(x<game.cam.x-160 || x>game.cam.x+VIEW.w+160 || y<game.cam.y-160 || y>game.cam.y+VIEW.h+160) continue;
    const sq=sqScale(e);
    const breath=1+0.04*Math.sin(T*(e.mech==='dash'?9:3)+e.phase);
    const flash=e.hit>0;
    const big=e.type==='boss'||isEliteEnemy(e);
    const R=big?e.r:Math.max(e.type==='swarm'?13:22,e.r*1.55);
    ctx.save(); ctx.translate(x,y);
    shadow(0,R,R*(big?1.05:0.9),R*0.34,big?0.34:0.24);
    if(big){
      const gr=ctx.createRadialGradient(0,0,R*0.5,0,0,R*1.7);
      const c=e.color;
      gr.addColorStop(0,e.type==='boss'?hexA(c,0.3):hexA('#ffd97a',0.26));
      gr.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(0,0,R*1.7,0,TAU); ctx.fill();
    }
    if(e.mech==='explode' && e.fuse>=0){
      const p=1-e.fuse/1.5;
      ctx.strokeStyle=`rgba(154,47,84,${0.45+0.5*p})`; ctx.lineWidth=2+2*p;
      ctx.setLineDash([6,5]); ctx.beginPath(); ctx.arc(0,0,96,0,TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if(e.mech==='dash' && e.dashT<0.32){
      ctx.save(); ctx.rotate(e.face); ctx.strokeStyle='#8d4071'; ctx.lineWidth=2;
      ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(R*.7,0); ctx.lineTo(R*2.2,0); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(R*1.9,-5); ctx.lineTo(R*2.2,0); ctx.lineTo(R*1.9,5); ctx.stroke(); ctx.restore();
    }
    const pose=Rig.walkPose(e,alpha);
    const isCharging=e.mech==='dash' && e.dashT<0.32;
    const sprite=e.type==='boss'?game.bossKind.sprite:e.type;
    ctx.translate(0,isCharging?0:-pose.bob*pose.strength*R*.6);
    const sx=sq.sx*(isCharging?1.14:1), sy=sq.sy*(isCharging?.84:breath);
    ctx.scale(pop*sx,pop*sy);
    const drawOptions={ctx,flash:flash&&Juice.flashScale>0,alpha:e.hidden?.36:1,
      flipX:e.mech==='dash'&&Math.cos(e.face)<0};
    const done=SliceRig.draw(sprite,0,R*.9,R*2.12,pose,drawOptions)||
      drawSprite(sprite,0,R*.9,R*2.12,drawOptions);
    if(!done){ ctx.scale(R,R); ctx.translate(0,-1); drawChibi(e,pal,flash); }
    ctx.restore();

    if(e.hp<e.maxHp && big){
      const w=R*2.1, hpw=w*clamp(e.hp/e.maxHp,0,1), by=y-R*1.85;
      ctx.fillStyle='rgba(74,61,99,.55)'; ctx.fillRect(x-w/2,by,w,6);
      ctx.fillStyle=e.color; ctx.fillRect(x-w/2,by,hpw,6);
      ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1; ctx.strokeRect(x-w/2,by,w,6);
    }
  }
}
function hexA(hex,a){
  const h=hex.replace('#',''); const n=parseInt(h,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// 糖霜云（粉色糖果云）
function drawHazards(){
  const T=game.time;
  for(const h of game.hazards){
    const a=clamp(h.life/(h.max||CFG.SPORE.hazardLife),0,1);
    if(h.kind){
      const pending=game.time<h.activeAt;
      const frame=pending?Math.floor(clamp(1-(h.activeAt-game.time)/.3,0,.99)*6):7+Math.floor(T*8)%4;
      drawMotionFrame(h.kind,frame,h.x,h.y,h.r*2.6);
      ctx.strokeStyle=pending?'#ae6f3e':hexA(h.color,.92); ctx.lineWidth=2;
      if(pending) ctx.setLineDash([6,5]);
      ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,TAU); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    const g=ctx.createRadialGradient(h.x,h.y,h.r*0.2,h.x,h.y,h.r);
    g.addColorStop(0,hexA(h.color||'#ffc7e0',.42*a));
    g.addColorStop(.7,hexA(h.color||'#f0a0c8',.24*a));
    g.addColorStop(1,hexA(h.color||'#f0a0c8',.06*a));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,TAU); ctx.fill();
    ctx.strokeStyle=`rgba(146,54,96,${0.8*a})`; ctx.lineWidth=2;
    ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,TAU); ctx.stroke(); ctx.setLineDash([]);
    for(let k=0;k<4;k++){ const a2=T*0.8+k*1.57;
      ctx.fillStyle=`rgba(255,255,255,${0.5*a})`;
      ctx.beginPath(); ctx.arc(h.x+Math.cos(a2)*h.r*0.5, h.y+Math.sin(a2)*h.r*0.5 + Math.sin(T*2+k)*5, 3.5,0,TAU); ctx.fill(); }
  }
}

// 星光射线 / 爆米花爆炸特效
function drawLaserFx(){
  for(const f of game.fx){
    if(f.type==='bossCircle' || f.type==='bossBurst'){
      const progress=1-f.life/f.max;
      const warning=f.type==='bossCircle';
      if(warning && f.key) drawMotionFrame(f.key,Math.min(5,Math.floor(progress*6)),f.x,f.y,f.r*2.7);
      ctx.save();
      ctx.fillStyle=hexA(f.color,warning?.15+progress*.22:.35*(1-progress));
      ctx.strokeStyle=warning?'#82395d':hexA(f.color,1-progress);
      ctx.lineWidth=warning?2:5*(1-progress)+1;
      if(warning) ctx.setLineDash([6,5]);
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,TAU); ctx.fill(); ctx.stroke();
      if(warning) star(f.x,f.y,7,'#fff4cf',4,.4,0,true);
      ctx.restore();
    } else if(f.type==='laserWarn'){
      const p=1-f.life/f.max, c=f.color||'#ff85a8';
      ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.a);
      ctx.fillStyle=hexA(c,0.15+0.23*p); ctx.fillRect(0,-26,f.len,52);
      ctx.strokeStyle='#813959'; ctx.lineWidth=2+2*p;
      ctx.setLineDash([14,8]); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(f.len,0); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    } else if(f.type==='laser'){
      const a=f.life/f.max, c=f.color||'#ff85a8';
      ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.a);
      ctx.strokeStyle=hexA(c,a); ctx.lineWidth=52*a;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(f.len,0); ctx.stroke();
      ctx.strokeStyle=`rgba(255,255,255,${a})`; ctx.lineWidth=6*a;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(f.len,0); ctx.stroke();
      ctx.restore();
    } else if(f.type==='boom'){
      const p=1-f.life/f.max;
      ctx.strokeStyle=`rgba(255,210,130,${1-p})`; ctx.lineWidth=6*(1-p)+1;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r+(f.R-f.r)*p,0,TAU); ctx.stroke();
      const k=1-p; star(f.x,f.y,(f.R*0.5)*k,'#fff2b8',6,0.5,p*2);
    }
  }
}

// 星芒弹：蓝白星芯与长尾区分玩家弹幕和敌弹。
function drawBullets(alpha){
  for(const b of game.bullets){
    const x=b.ox+(b.x-b.ox)*alpha, y=b.oy+(b.y-b.oy)*alpha, a=Math.atan2(b.vy,b.vx);
    const spirit=b.kind==='sprite';
    candyComet(x,y,a,skillRank(spirit?'sprite':'bolt'),spirit?CANDY_GLASS.rose:CANDY_GLASS.sky);
  }
}
// 敌方糖果弹（按 Boss 主题色）
function drawEBullets(){
  for(const b of game.ebullets){
    const a=Math.atan2(b.vy,b.vx), c=b.color||'#ff85a8';
    if(b.kind==='bubble-shot' && drawMotionFrame(b.kind,9,b.x,b.y,54,54,a)) continue;
    ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(a);
    const tg=ctx.createLinearGradient(-b.r*4,0,b.r,0);
    tg.addColorStop(0,hexA(c,0)); tg.addColorStop(1,c);
    ctx.fillStyle=tg; ctx.beginPath(); ctx.moveTo(-b.r*4,0); ctx.lineTo(b.r,-b.r*0.7);
    ctx.lineTo(b.r,b.r*0.7); ctx.closePath(); ctx.fill();
    ctx.shadowColor=c; ctx.shadowBlur=10;
    star(0,0,b.r*1.15,c,4,.63,0,true);
    ctx.shadowBlur=0; ctx.restore();
  }
}
// 星爆（绽放的彩色星芒环）
function drawNova(){
  for(const f of game.fx){
    if(f.type!=='nova')continue;
    const rank=skillRank('nova');
    crystalBloom(f.x,f.y,f.R,1-f.life/f.max,rank,CANDY_GLASS.rose,6+2*rank);
  }
}
// 流星（原紫电 → 金色流星拖尾 + 星芒落点）
function drawLightning(){
  for(const f of game.fx){
    if(f.type!=='lightning' && f.type!=='meteorImpact')continue;
    const k=f.life/f.max;
    const flight=f.type==='lightning';
    const radius=f.r||34;
    const rank=skillRank('lightning');
    if(!flight){
      crystalBloom(f.x2,f.y2,radius,1-k,rank,CANDY_GLASS.honey,5+rank);
      continue;
    }
    ctx.save();
    const headX=f.x2+(f.x1-f.x2)*k, headY=f.y2+(f.y1-f.y2)*k;
    ctx.strokeStyle='#ac663a'; ctx.lineWidth=1.5; ctx.setLineDash([4,6]);
    ctx.beginPath(); ctx.arc(f.x2,f.y2,radius,0,TAU); ctx.stroke();
    ctx.setLineDash([]);
    candyComet(headX,headY,Math.atan2(f.y2-f.y1,f.x2-f.x1),rank,CANDY_GLASS.honey);
    ctx.restore();
  }
}
function drawBossEntrance(){
  const progress=1-game.bossSeqT/CFG.LEVEL.bossSequence;
  const {x,y}=game.bossEntry;
  const r=25+42*progress;
  ctx.save();
  ctx.globalAlpha=.45+progress*.45;
  ctx.strokeStyle='#87446e'; ctx.lineWidth=2;
  ctx.setLineDash([4,7]); ctx.lineDashOffset=-game.time*32;
  ctx.beginPath(); ctx.ellipse(x,y,r,r*.47,0,0,TAU); ctx.stroke();
  ctx.setLineDash([]);
  for(let k=0;k<6;k++){
    const a=k/6*TAU+game.time*.9;
    star(x+r*Math.cos(a),y+r*.47*Math.sin(a),5+5*progress,'#fff2ae',4,.35,a,true);
  }
  ctx.restore();
}
function drawExpansionGround(){
  const time=game.time;
  for(const field of game.timeFields){
    const age=field.max-field.life, rank=skillRank('chrono'), pal=CANDY_GLASS.iris;
    ctx.save(); ctx.translate(field.x,field.y);
    for(let i=0;i<12;i++){
      const a=i*TAU/12-Math.PI/2;
      const active=i===Math.floor(age*4)%12;
      ctx.beginPath(); ctx.arc(0,0,field.r,a+.05,a+(active?.48:.21));
      ctx.lineWidth=active?3:1.4; ctx.strokeStyle=pal[0]; ctx.stroke();
      if(i%3===0||active) cutGem(Math.cos(a)*field.r,Math.sin(a)*field.r,a,active?7:4,2.5,pal);
    }
    const hand=Math.floor(age*4)*TAU/12-Math.PI/2;
    cutGem(Math.cos(hand)*(field.r-14),Math.sin(hand)*(field.r-14),hand,8,3,pal);
    if(rank>1) cutGem(Math.cos(-hand)*24,Math.sin(-hand)*24,-hand,12,2,pal);
    if(rank===3) cutGem(0,0,age,6,4,pal);
    ctx.restore();
  }
  for(const mine of game.mines){
    const armed=time>=mine.armAt, rank=skillRank('mine');
    for(let i=0;i<3+rank;i++){
      const a=TAU*i/(3+rank), r=armed?7:3;
      cutGem(mine.x+Math.cos(a)*r,mine.y+Math.sin(a)*r,a,4,2,CANDY_GLASS.honey);
    }
    cutGem(mine.x,mine.y,-Math.PI/2,6,4,armed?CANDY_GLASS.rose:CANDY_GLASS.iris);
  }
  for(const blade of game.blades){
    const rank=skillRank('boomer');
    ctx.save(); ctx.translate(blade.x,blade.y); ctx.rotate(time*13+blade.angle);
    for(let i=0;i<rank+1;i++){
      ctx.rotate(TAU/(rank+1));
      ctx.beginPath(); ctx.moveTo(-3,2); ctx.quadraticCurveTo(7,-14,16,-10);
      ctx.quadraticCurveTo(8,-5,6,2); ctx.closePath();
      ctx.fillStyle=CANDY_GLASS.iris[1]; ctx.fill(); ctx.strokeStyle=CANDY_GLASS.iris[0]; ctx.lineWidth=1.5; ctx.stroke();
    }
    cutGem(0,0,0,5,3,CANDY_GLASS.honey); ctx.restore();
  }
  const weapon=player.weapons.sprite;
  if(weapon){
    const count=starlingCount(weapon.level);
    for(let i=0;i<count;i++){
      const {x,y}=starlingPosition(i,count);
      const rank=skillRank('sprite');
      if(rank>=2){
        const wing=Math.sin(time*9+i)*.36;
        cutGem(x-9,y-5,-.7-wing,5,2,CANDY_GLASS.rose);
        cutGem(x+9,y-5,.7+wing,5,2,CANDY_GLASS.rose);
      }
      if(rank===3) cutGem(x,y-16,Math.PI/2,4,2,CANDY_GLASS.honey);
      if(!drawMotionFrame('sprite',8+Math.floor(time*8+i)%4,x,y-3,49)){
        star(x,y,10,'#ffaae2',5,.42,0,true);
      }
    }
  }
}

function drawPlayer(alpha){
  const P=CFG.ART.friend, T=game.time;
  const wp=player.weapons.orbit;
  if(wp){
    const n=2+wp.level,R=(54+wp.level*3)*areaScale();
    const rank=skillRank('orbit'), pal=CANDY_GLASS.honey;
    for(let k=0;k<n;k++){
      const a=(player.orbAngle||0)+k/n*TAU;
      const bx=player.x+Math.cos(a)*R, by=player.y+Math.sin(a)*R;
      ctx.beginPath(); ctx.arc(player.x,player.y,R,a-.48,a);
      ctx.arc(player.x,player.y,R-3,a,a-.36,true);
      ctx.closePath(); ctx.fillStyle=pal[1]; ctx.fill();
      cutGem(bx,by,a+Math.PI/2,9,4.5,pal);
      if(rank>=2) cutGem(bx,by,a,6,2.5,CANDY_GLASS.rose);
      if(rank===3) cutGem(player.x+R*Math.cos(a-.52),player.y+R*Math.sin(a-.52),a,3,2,pal);
    }
  }
  const x=player.ox+(player.x-player.ox)*alpha, y=player.oy+(player.y-player.oy)*alpha;
  const blink=player.invuln>0 && Math.floor(T*18)%2===0;
  const pose=Rig.walkPose(player,alpha);
  const sq=sqScale(player);
  ctx.save(); ctx.translate(x,y);
  const R=player.r, foot=R*1.35;
  shadow(0,foot,R*1.05,R*.36,.28);
  ctx.strokeStyle='#fffced'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.ellipse(0,foot,R*1.27,R*.51,0,0,TAU); ctx.stroke();
  pose.cast=Rig.castPose(player,T);
  ctx.translate(0,-pose.bob*pose.strength*R);
  ctx.scale(sq.sx,sq.sy);
  const aimSide=Math.cos(pose.cast?.direction);
  const flipX=Math.abs(aimSide)>.3?aimSide<0:player.faceX<0;
  const drawOptions={ctx,alpha:blink?.58:1,flipX};
  if(!SliceRig.draw('player',0,foot,3.65*R,pose,drawOptions) &&
     !drawSprite('player',0,foot,3.65*R,drawOptions)){
    ctx.globalAlpha=drawOptions.alpha;
    // 回退：可爱小法师（无兜帽，双马尾）
    ctx.fillStyle=P.dark; for(const s of [-1,1]){ ctx.beginPath(); ctx.ellipse(s*R*0.7,-R*0.3,R*0.3,R*0.7,s*0.25,0,TAU); ctx.fill(); }
    poly([[-R*0.6,R*0.3],[-R*0.8,R*1.4],[0,R*1.2],[R*0.8,R*1.4],[R*0.6,R*0.3]],'#ffffff',true,2);
    ctx.fillStyle='#7fe8d8'; ctx.beginPath(); ctx.arc(0,-R*0.2,R*0.85,0,TAU); ctx.fill();
    ctx.strokeStyle=CFG.ART.outline; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#4a3a63'; for(const s of [-1,1]){ ctx.beginPath(); ctx.arc(s*R*0.32,-R*0.25,R*0.12,0,TAU); ctx.fill(); }
    ctx.fillStyle='rgba(255,150,175,.5)'; for(const s of [-1,1]){ ctx.beginPath(); ctx.arc(s*R*0.5,-R*0.05,R*0.1,0,TAU); ctx.fill(); }
    ctx.fillStyle=P.main; ctx.shadowColor=P.main; ctx.shadowBlur=7;
    ctx.beginPath(); ctx.arc(0,R*0.6,3+Math.sin(T*5),0,TAU); ctx.fill(); ctx.shadowBlur=0;
  }
  ctx.restore();
}
function drawParts(){
  for(const p of game.parts){
    const k=clamp(p.life/p.max,0,1);
    ctx.globalAlpha=k; ctx.fillStyle=p.color;
    ctx.save(); ctx.translate(p.x,p.y);
    if(p.spark){
      ctx.rotate(Math.atan2(p.vy,p.vx));
      ctx.fillRect(0,-p.size*0.25,p.size*2.6*k,p.size*0.5);
    } else {
      ctx.rotate((p.spin||0)+game.time*6);
      star(0,0,p.size*0.8*k,p.color,4,0.4,game.time*3);
    }
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
function drawDmgTexts(){
  ctx.textAlign='center';
  for(const t of game.dmgTexts){
    const k=clamp(t.life/.8,0,1);
    const age=1-k;
    const pop=easeOutBack(clamp(age/0.22,0,1));
    const scale=(t.crit?1.35:1)*(0.4+0.6*pop);
    ctx.save(); ctx.translate(t.x+(t.drift||0)*age, t.y);
    ctx.scale(scale,scale); ctx.globalAlpha=Math.min(1,k*1.8);
    ctx.font=`900 ${t.crit?18:14}px system-ui`;
    ctx.lineWidth=3.5; ctx.strokeStyle='rgba(255,255,255,.92)'; ctx.strokeText(t.v,0,0);
    ctx.fillStyle=t.color; ctx.fillText(t.v,0,0);
    ctx.restore();
  }
  ctx.globalAlpha=1; ctx.textAlign='left';
}
function drawJoystick(){
  const j=Input.joy; if(!j.active)return;
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=2.5;
  ctx.fillStyle='rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.arc(j.ox,j.oy,j.r,0,TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.arc(j.x,j.y,20,0,TAU); ctx.fill();
  ctx.restore();
}

// === HUD ===
let hudCache={};
function updateHUD(force){
  const set=(id,v)=>{ if(force||hudCache[id]!==v){ document.getElementById(id).textContent=v; hudCache[id]=v; } };
  set('hLevel',player.level);
  const act=actOf(game.level);
  set('hActName',act.name+' · 第 '+game.level+' 关');
  set('hActIcon',act.key==='meadow'?'🌻':act.icon);
  set('hTime',fmtTime(game.levelTime));
  set('hKills',game.levelKills);
  set('hpText',Math.ceil(player.hp)+' / '+Math.round(player.maxHp));
  set('hGoal',levelGoalText());
  const maxed=player.level>=CFG.LEVEL.playerMax;
  const xpPct=maxed?100:clamp(player.xp/player.xpNext,0,1)*100;
  set('xpStatus',maxed?'满级 · 拾取回血':xpPct>=100?'继续战斗 · 等待强化':'');
  const hpPct=clamp(player.hp/player.maxHp,0,1)*100;
  const hpBarEl=document.getElementById('hpBar');
  if(hpBarEl){ const low=hpPct<30; if(force||hudCache.low!==low){ hpBarEl.classList.toggle('low',low); hudCache.low=low; } }
  if(force||hudCache.xp!==(xpPct|0)){ document.getElementById('xpFill').style.setProperty('--progress',xpPct/100); hudCache.xp=xpPct|0; }
  if(force||Math.abs(hudCache.hp-hpPct)>0.4){ document.getElementById('hpFill').style.setProperty('--progress',hpPct/100); hudCache.hp=hpPct; }
  if(game.boss&&!game.boss.dead) document.getElementById('bossFill').style.width=clamp(game.boss.hp/game.boss.maxHp,0,1)*100+'%';
  const wkey=Object.keys(player.weapons).map(k=>k+player.weapons[k].level).join(',');
  if(force||hudCache.wkey!==wkey){
    hudCache.wkey=wkey;
    const box=document.getElementById('wpanel'); box.innerHTML='';
    for(const k in player.weapons){
      const w=player.weapons[k], d=document.createElement('div'); d.className='wicon';
      d.title=WEAPONS[k].name;
      d.innerHTML=itemIcon(k)+'<small>Lv.'+w.level+'</small>'; box.appendChild(d);
    }
  }
}
function levelGoalText(){
  if(game.bossSpawned) return '关底决战';
  if(game.bossIntro) return '关底正在降临…';
  return `距关底降临 ${fmtTime(Math.max(0,Math.ceil(CFG.LEVEL.bossAt-game.levelTime)))}`;
}
function showBossBar(on){
  document.getElementById('bossbar').style.display=on?'block':'none';
  if(on && game.bossKind) document.getElementById('bossName').textContent=`🌟 ${game.bossKind.title}·${game.bossKind.name}`;
}
function showBossPhase(st){
  const n=document.getElementById('bossName');
  const tail=['','','· 第二形态','· 第三形态','· 狂暴形态'][st]||'';
  n.textContent=`🌟 ${game.bossKind?game.bossKind.name:''} ${tail}`;
}
function toast(msg){
  const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); game.toastT=2.2;
}
function clearToast(){
  game.toastT=0;
  const el=document.getElementById('toast'); el.classList.remove('show'); el.textContent='';
}
// DOM 可见性镜像：show/hide 时同步维护，避免每帧查询 offsetParent（强制重排）
const VIS={ menu:true, levels:false, result:false, levelup:false };
const overlayExits=new WeakMap();
function show(id){
  const layer=document.getElementById(id);
  overlayExits.get(layer)?.cancel();
  overlayExits.delete(layer);
  layer.inert=false;
  layer.classList.remove('hidden');
  if(id in VIS) VIS[id]=true;
}
function hide(id){
  const layer=document.getElementById(id);
  overlayExits.get(layer)?.cancel();
  overlayExits.delete(layer);
  layer.classList.add('hidden');
  if(id in VIS) VIS[id]=false;
}
function dismissOverlay(id){
  const layer=document.getElementById(id);
  if(!layer.animate || matchMedia('(prefers-reduced-motion: reduce)').matches){ hide(id); return; }
  if(overlayExits.has(layer)) return;
  layer.inert=true;
  const exit=layer.animate([{opacity:getComputedStyle(layer).opacity},{opacity:0}],
    {duration:115,easing:'ease-out',fill:'forwards'});
  overlayExits.set(layer,exit);
  exit.onfinish=()=>{ if(overlayExits.get(layer)===exit) hide(id); };
}

// 选卡面板只改变战场的展示。暂停由 levelup 状态保持到离场完成。
let rewardBusy=false, rewardPeeking=false;
function updateRewardPeek(peeking){
  rewardPeeking=peeking;
  document.getElementById('levelup').classList.toggle('is-peeking',peeking);
  document.getElementById('rewardContent').inert=peeking||rewardBusy;
  document.getElementById('rewardPeekBtn').setAttribute('aria-expanded',String(!peeking));
  document.getElementById('rewardPeekLabel').textContent=peeking?'返回选牌':'查看战场';
  document.getElementById('rewardPeekStatus').textContent=peeking?'战斗已暂停':'';
}
function toggleRewardPeek(){
  if(game.state!=='levelup' || rewardBusy) return;
  updateRewardPeek(!rewardPeeking);
  const target=rewardPeeking?document.getElementById('rewardPeekBtn'):document.getElementById('cards').firstElementChild;
  target?.focus({preventScroll:true});
}
function setRewardBusy(busy){
  rewardBusy=busy;
  document.getElementById('rewardContent').inert=busy||rewardPeeking;
  document.getElementById('rewardPeekBtn').disabled=busy;
}
function rewardMotion(){
  return document.getElementById('rewardContent').animate && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function rewardAnimationsDone(animations,done){
  Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(done);
}
function presentReward(){
  const wasOpen=VIS.levelup, cards=document.getElementById('cards');
  updateRewardPeek(false);
  show('levelup');
  if(!rewardMotion()){
    setRewardBusy(false);
    cards.firstElementChild?.focus({preventScroll:true});
    return;
  }
  setRewardBusy(true);
  document.getElementById('rewardDialog').focus({preventScroll:true});
  const draft=game.cards, animations=[];
  const veil=document.getElementById('rewardVeil');
  if(!wasOpen) animations.push(veil.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out',fill:'backwards'}));
  animations.push(document.querySelector('.reward-head').animate(
    [{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:215,easing:'ease-out',fill:'backwards'}));
  for(const id of ['skipCardBtn','rewardPeekBtn']){
    animations.push(document.getElementById(id).animate([{opacity:0},{opacity:1}],
      {delay:235,duration:150,easing:'ease-out',fill:'backwards'}));
  }
  for(const [i,card] of Array.from(cards.children).entries()){
    const delay=(wasOpen?24:84)+i*46;
    animations.push(card.animate([{opacity:0,transform:'translateY(28px) scale(.92)'},
      {opacity:1,transform:'none'}],{delay,duration:238,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
    animations.push(card.firstElementChild.animate([
      {opacity:1,transform:'rotateY(0deg)',offset:0},
      {opacity:1,transform:'rotateY(0deg)',offset:.38},
      {opacity:1,transform:'rotateY(90deg)',offset:.54},
      {opacity:0,transform:'rotateY(90deg)',offset:1},
    ],{delay,duration:350,fill:'backwards'}));
    animations.push(card.lastElementChild.animate([
      {opacity:0,transform:'rotateY(-90deg)',offset:0},
      {opacity:0,transform:'rotateY(-90deg)',offset:.54},
      {opacity:1,transform:'rotateY(0deg)',offset:1},
    ],{delay,duration:350,fill:'backwards'}));
  }
  rewardAnimationsDone(animations,()=>{
    if(game.state!=='levelup' || game.cards!==draft) return;
    setRewardBusy(false);
    cards.firstElementChild?.focus({preventScroll:true});
  });
}
function playRewardSelection(index,done){
  if(rewardBusy || rewardPeeking) return;
  if(!rewardMotion()){ done(); return; }
  setRewardBusy(true);
  document.getElementById('rewardDialog').focus({preventScroll:true});
  const draft=game.cards, cards=document.getElementById('cards');
  const animations=Array.from(cards.children,(card,i)=>{
    const selected=i===index;
    card.classList.toggle('is-selected',selected);
    return card.animate([
      {opacity:1,transform:'none'},
      {opacity:selected?1:.38,transform:selected?'translateY(-12px) scale(1.045)':'translateY(8px) scale(.97)',offset:.42},
      {opacity:0,transform:selected?'translateY(-26px) scale(.98)':'translateY(16px) scale(.96)'},
    ],{duration:selected?230:175,fill:'forwards',easing:'ease-out'});
  });
  rewardAnimationsDone(animations,()=>{
    if(game.state==='levelup' && game.cards===draft) done();
  });
}
function closeReward(){
  const draft=game.cards, veil=document.getElementById('rewardVeil'), content=document.getElementById('rewardContent');
  const resume=()=>{
    if(game.state!=='levelup' || game.cards!==draft) return;
    hide('levelup');
    for(const actor of [player,...game.enemies,...game.bullets]){
      actor.ox=actor.x; actor.oy=actor.y;
    }
    setRewardBusy(false);
    game.state='playing';
    document.getElementById('pauseBtn').focus?.({preventScroll:true});
  };
  if(!rewardMotion()){ resume(); return; }
  setRewardBusy(true);
  const animations=[veil,content].map(el=>el.animate([{opacity:1},{opacity:0}],
    {duration:165,easing:'ease-out',fill:'forwards'}));
  rewardAnimationsDone(animations,()=>{
    resume();
    animations.forEach(animation=>animation.cancel());
  });
}
