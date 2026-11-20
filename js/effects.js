// 各阶段时长与 assets/vfx/motion.json 一致。每行 6 帧，依次是前摇、释放、消散。
const VFX_CLIPS = {
  'bolt':[80, 180, 140],
  'orbit':[100, 510, 180],
  'aura':[100, 340, 200],
  'lightning':[105, 240, 190],
  'nova':[85, 250, 175],
  'wave':[110, 245, 170],
  'boomer':[100, 500, 170],
  'chain':[95, 275, 155],
  'beam':[120, 220, 200],
  'mine':[100, 280, 190],
  'sprite':[120, 430, 190],
  'chrono':[120, 660, 240],
  'berry-frost':[260, 560, 300],
  'matcha-pool':[280, 520, 340],
  'souffle-gust':[250, 570, 280],
  'forest-rage':[300, 650, 320],
  'swarm-spawn':[100, 220, 150],
  'goo-syrup':[160, 440, 300],
  'bubble-shot':[120, 330, 180],
  'cloud-heal':[120, 335, 230],
  'mirror-blink':[130, 235, 180],
  'ice-break':[150, 280, 220],
  'millefeuille-buff':[120, 360, 230],
};

const battleAtlases = {};

// 共用切面材质：背光边、糖色主面和窄高光。尺寸以世界像素计，不随技能范围放大。
const CANDY_GLASS={
  sky:['#425587','#71d9f1','#e5fbff'], rose:['#85416c','#f495bf','#fff0de'],
  honey:['#935236','#ffc56a','#fff4bc'], mint:['#306e79','#72dcc1','#ebffdf'],
  iris:['#56447b','#ba98ed','#fff1ff'],
};
function cutGem(x,y,angle,length,width,pal){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(length,0); ctx.lineTo(-length*.18,-width);
  ctx.lineTo(-length,0); ctx.lineTo(-length*.18,width); ctx.closePath();
  ctx.fillStyle=pal[1]; ctx.fill(); ctx.lineJoin='round';
  ctx.strokeStyle=pal[0]; ctx.lineWidth=1.35; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-length,0); ctx.lineTo(-length*.18,-width);
  ctx.lineTo(length,0); ctx.lineTo(-length*.26,-width*.22); ctx.closePath();
  ctx.fillStyle=pal[2]; ctx.fill(); ctx.restore();
}
function candyComet(x,y,a,rank,pal){
  ctx.save(); ctx.translate(x,y); ctx.rotate(a);
  const curl=Math.sin(game.time*18+x*.035)*2;
  ctx.beginPath(); ctx.moveTo(-2,-3); ctx.quadraticCurveTo(-14,-5,-29,curl);
  ctx.quadraticCurveTo(-16,-1,-7,3); ctx.closePath(); ctx.fillStyle=pal[1]; ctx.fill();
  if(rank>=2){
    for(const side of [-1,1]) cutGem(-6,side*4,side*.45,8,1.8,pal);
  }
  if(rank>=3) cutGem(-23,curl,0,4,2,pal);
  cutGem(0,0,0,9,4.5,pal); ctx.restore();
}
function skillRank(id){ return Math.ceil((player.weapons[id]?.level||1)/2); }

// 瓣尖先推出，根部随后追上；收尾靠断开和飞散，而不是整圈褪色。
function crystalBloom(x,y,r,p,rank,pal,petals){
  const reach=r*(.12+.88*(1-(1-p)**3));
  const span=Math.sin(Math.PI*p)**.7, depth=Math.min(38,r*.3)*span;
  ctx.save(); ctx.translate(x,y);
  for(let i=0;i<petals;i++){
    ctx.save(); ctx.rotate(i*TAU/petals+.15);
    const tip=reach*(i%2?.92:1), base=tip-depth;
    const w=Math.min(11,r*.09)*span;
    ctx.beginPath(); ctx.moveTo(base,1);
    ctx.quadraticCurveTo(base+depth*.3,-w,tip,-w*.45);
    ctx.quadraticCurveTo(tip-depth*.35,w,base,1); ctx.closePath();
    ctx.fillStyle=pal[1]; ctx.fill(); ctx.strokeStyle=pal[0]; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(base+1,0); ctx.quadraticCurveTo(base+depth*.65,-w*.65,tip,-w*.45);
    ctx.strokeStyle=pal[2]; ctx.lineWidth=1.6; ctx.stroke();
    if(rank>=2 && p>.18 && p<.89) cutGem(tip-5,-8-p*5,-.45,4,1.7,pal);
    if(rank>=3 && p<.8 && i%2===0) cutGem(base*.72,7+p*6,.55,6,2.5,pal);
    ctx.restore();
  }
  ctx.restore();
}
function drawCastMotion(f,p){
  const pal=CANDY_GLASS, rank=skillRank(f.key);
  if(f.key==='wave'||f.key==='mine'){
    if(f.key==='mine') crystalBloom(f.x,f.y,f.size/2.9,p,rank,pal.honey,6+rank*2);
    else {
      const r=f.size/2.8*(.16+.84*(1-(1-p)**3));
      ctx.save(); ctx.translate(f.x,f.y);
      for(let i=0;i<5+rank;i++){
        const a=i*TAU/(5+rank)+p*.5;
        ctx.beginPath(); ctx.arc(0,0,r,a,a+.64*(1-p)+.04);
        ctx.arc(0,0,Math.max(1,r-5*(1-p)),a+.45*(1-p),a,true);
        ctx.closePath(); ctx.fillStyle=pal.sky[1]; ctx.fill();
        ctx.strokeStyle=pal.sky[0]; ctx.lineWidth=1; ctx.stroke();
        if(rank>1) cutGem(Math.cos(a)*r,Math.sin(a)*r,a+.9,4,2,pal.sky);
      }
      ctx.restore();
    }
    return true;
  }
  if(f.key!=='beam' && f.key!=='chain') return false;
  ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.angle);
  const h=f.width/2, beam=f.key==='beam', color=beam?pal.rose:pal.sky;
  const w=(beam?f.size*.12:3)*(1-p)**.7+.4;
  ctx.beginPath(); ctx.moveTo(-h,0);
  if(beam){
    ctx.lineTo(-h+12,-w); ctx.lineTo(h,0); ctx.lineTo(-h+12,w); ctx.closePath();
    ctx.fillStyle=color[1]; ctx.fill();
    for(let i=0;i<rank;i++) cutGem(-h+9+i*14,0,Math.PI/2,8-i,3,color);
    ctx.beginPath(); ctx.moveTo(-h,0); ctx.lineTo(h,0);
  } else {
    const bends=Math.max(2,Math.min(8,Math.ceil(f.width/22)));
    for(let i=1;i<bends;i++) ctx.lineTo(-h+f.width*i/bends,Math.sin(i*4+f.x)*w*2);
    ctx.lineTo(h,0);
    ctx.strokeStyle=color[0]; ctx.lineWidth=w+1.8; ctx.stroke();
  }
  ctx.strokeStyle=color[2]; ctx.lineWidth=beam?Math.max(.7,w*.38):1.4; ctx.stroke();
  if(!beam && p<.65) cutGem(h,0,p*2,4+rank,2.8,color);
  ctx.restore(); return true;
}

function loadBattleEffects(onProgress=()=>{}){
  return Promise.all(Object.keys(VFX_CLIPS).map(key=>new Promise(resolve=>{
    const image=new Image();
    const done=()=>{ onProgress(); resolve(); };
    image.onload=()=>{
      battleAtlases[key]=image;
      if(image.decode) image.decode().then(done,done);
      else done();
    };
    image.onerror=done;
    image.src=`assets/vfx/${key}.webp`;
  })));
}

function addMotion(key,x,y,size,angle=0,width=size,life){
  const timing=VFX_CLIPS[key];
  const length=life??(timing[0]+timing[1]+timing[2])/1000;
  game.fx.push({type:'motion',key,x,y,size,angle,width,life:length,max:length});
}

function effectFrame(key,elapsed){
  const [pre,cast,fade]=VFX_CLIPS[key];
  const ms=Math.max(0,elapsed);
  if(ms<pre) return Math.min(5,Math.floor(ms/pre*6));
  if(ms<pre+cast) return 6+Math.min(5,Math.floor((ms-pre)/cast*6));
  return 12+Math.min(5,Math.floor((ms-pre-cast)/fade*6));
}

function drawMotionFrame(key,frame,x,y,width,height=width,angle=0){
  const image=battleAtlases[key];
  if(!image) return false;
  const sourceX=frame%6*128, sourceY=Math.floor(frame/6)*128;
  if(angle){
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
    ctx.drawImage(image,sourceX,sourceY,128,128,-width/2,-height/2,width,height);
    ctx.restore();
  } else ctx.drawImage(image,sourceX,sourceY,128,128,x-width/2,y-height/2,width,height);
  return true;
}

function drawBattleMotions(){
  for(const f of game.fx){
    if(f.type!=='motion') continue;
    const reach=Math.max(f.width,f.size)/2;
    if(f.x+reach<game.cam.x || f.x-reach>game.cam.x+VIEW.w ||
      f.y+reach<game.cam.y || f.y-reach>game.cam.y+VIEW.h) continue;
    if(drawCastMotion(f,1-f.life/f.max)) continue;
    const [pre,cast,fade]=VFX_CLIPS[f.key];
    const frame=effectFrame(f.key,(1-f.life/f.max)*(pre+cast+fade));
    if(!drawMotionFrame(f.key,frame,f.x,f.y,f.width,f.size,f.angle)){
      ctx.strokeStyle='#fff1b5'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(f.x,f.y,Math.min(36,f.size/2),0,TAU); ctx.stroke();
    }
  }
}
