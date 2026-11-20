// === 游戏状态 ===
const game = {
  state:'menu', level:1, unlocked:1, levelTime:0, levelKills:0,
  time:0, kills:0, totalXp:0, spawnT:0, eliteT:0,
  bossSpawned:false, bossIntro:false, boss:null, bossKind:null, bossGuard:false,
  cards:[], cardMode:'level', nextLevelAt:0, nextRewardAt:0,
  cam:{x:0,y:0}, shake:0, flash:0, toastT:0,
  enemies:[], bullets:[], ebullets:[], gems:[], chests:[], props:[], parts:[], dmgTexts:[], fx:[], hazards:[], blades:[], mines:[], timeFields:[],
};
let player = null;
const SAVE_KEY='starlight_guard_progress'; // 沿用早期代号，改名会导致老玩家进度清零

// === 进度存取：解锁到第几关 ===
function loadProgress(){
  try{ const n=parseInt(localStorage.getItem(SAVE_KEY)||'1',10); game.unlocked=clamp(isNaN(n)?1:n,1,CFG.LEVEL.total); }
  catch(_){ game.unlocked=1; }
}
function saveProgress(){ try{ localStorage.setItem(SAVE_KEY,String(game.unlocked)); }catch(_){} }

function makePlayer(){
  const b=CFG.BASE;
  return {
    x:0,y:0,ox:0,oy:0,r:15, hp:b.hp, maxHp:b.hp, speed:b.speed, pickup:b.pickup,
    armor:b.armor, damage:b.damage, fireRate:b.fireRate, cooldown:b.cooldown, crit:b.crit, regen:b.regen,
    level:1, xp:0, xpNext:CFG.PROGRESSION.xpCosts[0], invuln:0, faceX:1, faceY:0,
    weapons:{}, passives:{}, auraTick:0, novaTick:0,
    sq:0, sqT:0, walk:0,
  };
}

// === 开启一关：每关从 Lv1 开始，关卡之间不继承任何数值 ===
function startLevel(n){
  n=clamp(n,1,CFG.LEVEL.total);
  const theme=isBossLevel(n);
  Object.assign(game,{
    state:'playing', level:n, levelTime:0, levelKills:0,
    time:0, kills:0, totalXp:0, spawnT:0.8, eliteT:45, eliteCount:0, propT:6, lastWave:1,
    sporeMutated:false, bossSpawned:false, bossIntro:false, boss:null, bossEntry:null,
    bossKind:theme?bossInfo(n):guardInfo(n), bossGuard:!theme,
    cards:[], nextLevelAt:0, nextRewardAt:0, chestQueue:0, firstUpgradeShown:false, draftCount:0,
    enemies:[], bullets:[], ebullets:[], gems:[], chests:[], props:[], parts:[], dmgTexts:[], fx:[], hazards:[], blades:[], mines:[], timeFields:[],
    shake:0, flash:0,
  });
  game.cam.x=-VIEW.w/2; game.cam.y=-VIEW.h/2;
  Juice.trauma=0; Juice.stop=0; Juice._last={};
  Juice.clock=0;
  player=makePlayer();
  aimLock.ref=null; aimLock.until=0; game.aimTarget=null;   // 每关重置目标锁定

  // 第 1 关与第 20 关起手完全一致：Lv1 + 星芒一把，无起跑线加成
  addWeapon('bolt');

  hide('menu'); hide('levels'); hide('result'); hide('levelup'); showBossBar(false);
  hudCache={};
  updateHUD(true);
  const act=actOf(n);
  toast(`第 ${n} 关 · ${act.name} · ${fmtTime(CFG.LEVEL.bossAt)} 后迎战${game.bossKind.title}`);
}

// === 刷怪 & 掉落 ===
function spawnEnemy(type, x, y){
  if (game.enemies.length >= CFG.MAX_ENEMIES) return null;
  const t = ETYPE[type], L=CFG.LEVEL;
  // 起手武器相同，首轮普通怪保持相同血量，关卡差异从第一张卡后逐步拉开。
  const buildProgress=clamp((player.level-1)/9,0,1);
  const scale=1+(game.level-1)*L.diffStep*buildProgress+(player.level-1)*L.diffLv;
  const ang = Math.random()*TAU;
  const border=Math.min(VIEW.w*.5/Math.max(.001,Math.abs(Math.cos(ang))),
                          VIEW.h*.5/Math.max(.001,Math.abs(Math.sin(ang))));
  const rad=border+rand(35,100);
  const px = x!==undefined ? x : player.x+Math.cos(ang)*rad;
  const py = y!==undefined ? y : player.y+Math.sin(ang)*rad;
  let hp=t.hp*scale;
  // 关底血量：主题 Boss 与关底守卫分开定价，满级构筑下也能打 40-90 秒
  if(type==='boss') hp=game.bossGuard
    ? L.guardHpBase+game.level*L.guardHpStep
    : L.bossHpBase+game.level*L.bossHpStep;
  const color=type==='boss'&&game.bossKind?game.bossKind.color:t.color;
  const enemy={
    id:uid++, type, x:px, y:py, ox:px, oy:py, r:t.r,
    hp, maxHp:hp, speed:t.speed*rand(.9,1.1), dmg:t.dmg, xp:t.xp,
    color, pal:t.pal, mech:t.mech, tier:t.tier||0,
    displayName:type==='boss'&&game.bossKind?game.bossKind.name:t.name,
    hit:0, kx:0, ky:0, atk:rand(0,2), dead:false, slow:0,
    born:game.time, sq:0, phase:rand(0,TAU), face:rand(0,TAU),
    stealth:0, dashT:rand(0,2), fuse:-1, summonT:rand(3,6),
    stealT:rand(4,8), carrying:0, phaseStage:1, zig:rand(0,TAU),
    isChild:false,
    toxic:!(type==='spore' && game.time<CFG.SPORE.safeTime),
  };
  game.enemies.push(enemy);
  return enemy;
}
// 关内波次：本关可用怪池按关内时间逐波释放（阵容表给"可用池"，波次给"登场节奏"）
// 与旧的"全体从开局混编"相比：L1 只有 3 种怪打一整局，靠波次维持变化。
const WAVE_TIME=[0,12,65,95,125,155,185,215,245,280,315,350];
function spawnTarget(){
  const S=CFG.SPAWN, R=levelRoster(game.level);
  const base=S.targetBase+Math.floor(game.levelTime/S.targetInterval)*S.targetGain;
  return Math.min(S.targetCap,Math.round(base*R.density));
}
function pickEnemyType(){
  const S=CFG.SPORE, t=game.levelTime;
  if(t>=S.safeTime && !game.sporeMutated){
    game.sporeMutated=true; toast('✨ 棉棉长大了：倒下会留下糖霜云！');
  }
  const roster=levelRoster(game.level).pool;
  // 先让第一种敌人独立登场，然后逐波放开怪池。
  let wave=1;
  for(let i=1;i<WAVE_TIME.length;i++) if(t>=WAVE_TIME[i]) wave=i+1;
  const open=Math.min(roster.length, wave);
  const active=roster.slice(0,open);
  const type=active[randInt(0,active.length-1)];
  if(open>game.lastWave && active.indexOf(type)===open-1){
    game.lastWave=open; toast('新伙伴登场 · '+ETYPE[type].name);
  }
  return type;
}
function dropGem(x,y,val){
  game.gems.push({x,y,vx:rand(-40,40),vy:rand(-40,40),ox:x,oy:y,val,r:6,life:26});
}
function openChest(x,y){ game.chests.push({x,y,r:15,t:rand(0,6)}); }

// === 资源物：随机刷新的星星水晶（可破坏，掉经验 + 小回血） ===
function spawnProp(x,y){
  const P=CFG.PROP;
  const a=rand(0,TAU), d=x!==undefined?0:rand(170,300);
  const px=x!==undefined?x:player.x+Math.cos(a)*d;
  const py=y!==undefined?y:player.y+Math.sin(a)*d;
  game.props.push({id:uid++, prop:true, x:px, y:py, r:P.r, hp:P.hp, maxHp:P.hp,
    dead:false, t:rand(0,6), hit:0, phase:rand(0,TAU)});
}
function damageProp(p,dmg,kx,ky){
  if(p.dead) return;
  const d=dmg*player.damage;
  p.hp-=d; p.hit=0.12;
  addDmgText(p.x,p.y-p.r-6,Math.round(d),false);
  spawnParts(p.x,p.y,'#bff3ff',5,90);
  if(p.hp<=0){
    p.dead=true;
    const P=CFG.PROP;
    for(let k=0;k<P.gems;k++) dropGem(p.x+rand(-12,12),p.y+rand(-12,12),1);
    const heal=player.maxHp*P.healPct/100;
    player.hp=Math.min(player.maxHp,player.hp+heal);
    addDmgText(p.x,p.y-p.r-18,'+'+Math.round(heal),false,'#8fe3ff');
    spawnParts(p.x,p.y,'#8fe3ff',18,170);
    Juice.feedback('small',p.x,p.y,'#8fe3ff');
    Sound.pickup();
  } else Sound.hit();
}
function updateProps(dt){
  for(let i=game.props.length-1;i>=0;i--){
    const p=game.props[i];
    p.t+=dt; if(p.hit>0) p.hit-=dt;
    if(p.dead) game.props.splice(i,1);
  }
}

// === 武器与被动获取 ===
function addWeapon(id){
  if(player.weapons[id]) player.weapons[id].level++;
  else player.weapons[id]={id,level:1,timer:0.4};
  if (WEAPONS[id].cd===0 && id==='orbit') makeOrbits();
}
function addPassive(id){
  const p=player.passives; if(!p[id]) p[id]=0; p[id]++;
  const L=p[id];
  switch(id){
    case 'damage': player.damage=1+0.18*L; break;
    case 'firerate': player.fireRate=1+0.14*L; break;
    case 'speed': player.speed=CFG.BASE.speed*(1+0.10*L); break;
    case 'maxhp': player.maxHp+=25; player.hp=Math.min(player.maxHp,player.hp+25); break;
    case 'pickup': player.pickup=CFG.BASE.pickup*(1+0.28*L); break;
    case 'armor': player.armor=L; break;
    case 'cooldown': player.cooldown=1-0.08*L; break;
    case 'crit': player.crit=0.06*L; break;
    case 'regen': player.regen=0.6*L; break;
  }
}
function makeOrbits(){ player.orbAngle = player.orbAngle||0; }

// === 卡牌系统 ===
function buildCards(chest){
  game.cardMode = chest ? 'chest' : 'level';
  const act=1+Math.floor((game.level-1)/CFG.LEVEL.perAct);
  const weaponCount=Object.keys(player.weapons).length;
  const passiveCount=Object.keys(player.passives).length;
  const weapons=[], passives=[];
  for (const k in WEAPONS){
    const lv=player.weapons[k]?player.weapons[k].level:0;
    if(lv<WEAPONS[k].max && (WEAPONS[k].act||1)<=act &&
      (lv>0 || (!chest && weaponCount<CFG.MAX_WEAPONS))) weapons.push({kind:'weapon',id:k});
  }
  for (const k in PASSIVES){
    const lv=player.passives[k]||0;
    if(lv<PASSIVES[k].max && (PASSIVES[k].act||1)<=act &&
      (lv>0 || passiveCount<CFG.MAX_PASSIVES)) passives.push({kind:'passive',id:k});
  }
  const firstUpgrade=!chest && !game.firstUpgradeShown;
  const weighted=!chest && game.draftCount<3;
  let picks;
  if(chest){
    shuffle(weapons);
    shuffle(passives);
    picks=weapons.concat(passives).slice(0,3);
  } else {
    const pool=weapons.concat(passives);
    picks=firstUpgrade?['bolt','orbit','nova'].map(id=>pool.find(card=>card.id===id)).filter(Boolean):[];
    const weight=card=>(weighted && (WEAPONS[card.id]||PASSIVES[card.id]).act===act)?2:1;
    function drawCard(candidates){
      let roll=Math.random()*candidates.reduce((total,card)=>total+weight(card),0);
      for(const card of candidates){
        roll-=weight(card);
        if(roll<0){ picks.push(card); return; }
      }
    }
    if(weaponCount<2 && !picks.some(c=>c.kind==='weapon'&&!player.weapons[c.id])){
      drawCard(weapons.filter(c=>!player.weapons[c.id]));
    }
    while(picks.length<3 && pool.length>picks.length) drawCard(pool.filter(c=>!picks.includes(c)));
    game.firstUpgradeShown=true;
    game.draftCount++;
  }
  if(!picks.length) return false;
  game.cards=picks;
  const box=document.getElementById('cards'); box.innerHTML='';
  picks.forEach((c,i)=>{
    const isW=c.kind==='weapon', data=isW?WEAPONS[c.id]:PASSIVES[c.id];
    const lv=isW?(player.weapons[c.id]?player.weapons[c.id].level:0):(player.passives[c.id]||0);
    const el=document.createElement('button');
    el.type='button';
    el.className='card card-'+c.id+(isW?' weapon':'');
    el.innerHTML=`<span class="card-back" aria-hidden="true"></span>
      <span class="card-front">
        <span class="cn">${data.name}</span>
        <span class="ci">${itemIcon(c.id)}</span>
        <span class="cl">${lv===0?`新获得 · Lv.${lv+1}`:`Lv.${lv} <span aria-hidden="true">→</span> Lv.${lv+1}`}</span>
        <span class="cd">${isW?data.desc(lv+1):data.desc}</span>
        <span class="ck" aria-hidden="true">${i+1}</span>
      </span>`;
    el.addEventListener('click',()=>chooseCard(i));
    box.appendChild(el);
  });
  document.getElementById('upTitle').textContent = chest?'挑选宝箱奖励':firstUpgrade?'选一种打法':'选择强化';
  document.getElementById('upHint').textContent = '';
  document.getElementById('skipCardBtn').innerHTML =
    (chest?'放弃宝箱奖励':'放弃本次强化')+' <span aria-hidden="true">→</span>';
  game.state='levelup';
  presentReward();
  return true;
}
function popChest(){
  while(game.chestQueue>0){
    game.chestQueue--;
    if(buildCards(true)) return true;
  }
  return false;
}
function chooseCard(i){
  const c=game.cards[i];
  if(!c || game.state!=='levelup') return;
  playRewardSelection(i,()=>{
    if(c.kind==='weapon') addWeapon(c.id); else addPassive(c.id);
    Sound.chest();
    resolveCardChoice();
  });
}
function skipCard(){
  if(game.state==='levelup') playRewardSelection(-1,resolveCardChoice);
}
function resolveCardChoice(){
  game.cards=[];
  closeReward();
}

// === 伤害与击杀 ===
function damageEnemy(e, dmg, kx=0, ky=0, canCrit=true, knockback=70){
  if(e.dead || e.activateAt>game.time) return;
  let d=dmg*player.damage*(e.mech==='shield'?.4:1), crit=false;
  if(canCrit && Math.random()<player.crit){ d*=2+.25*(player.passives.critdmg||0); crit=true; }
  e.hp-=d; e.hit=0.10; e.sq=1; e.sqT=0.18;
  const kl=Math.hypot(kx,ky)||1;
  const kb=e.type==='boss'||isEliteEnemy(e)?0.12:1;
  e.kx+=kx/kl*knockback*kb; e.ky+=ky/kl*knockback*kb;
  addDmgText(e.x,e.y-e.r-6,Math.round(d),crit);
  if(crit || e.type==='boss' || isEliteEnemy(e))
    Juice.addTrauma(crit?0.22:0.18, CFG.FEEL.hitCap, 'hit', CFG.FEEL.hitGap);
  spawnParts(e.x,e.y,crit?CFG.ART.hi:e.color,crit?9:4,crit?130:90);
  if(e.hp<=0) killEnemy(e);
  else Sound.hit();
}
function killEnemy(e){
  e.dead=true; game.kills++; game.levelKills++;
  const isBoss=e.type==='boss', isElite=isEliteEnemy(e);
  spawnParts(e.x,e.y,e.color,isBoss?46:isElite?24:10,isBoss?230:150);
  Sound.kill();
  let drop=e.xp;
  if(e.carrying) drop+=e.carrying*2;
  if(drop>0) dropGem(e.x,e.y,drop);

  if(e.mech==='poison' && e.toxic!==false){
    const S=CFG.SPORE;
    const clouds=game.hazards.filter(h=>!h.kind);
    if(clouds.length>=S.hazardMax) game.hazards.splice(game.hazards.indexOf(clouds[0]),1);
    game.hazards.push({x:e.x,y:e.y,r:S.hazardR,life:S.hazardLife,max:S.hazardLife,tick:0.3});
    spawnParts(e.x,e.y,'#ffc7e0',10,90);
  }
  if(e.mech==='split' && !e.isChild){
    for(let k=0;k<2;k++){
      const a=rand(0,TAU);
      const c=spawnEnemy('split', e.x+Math.cos(a)*20, e.y+Math.sin(a)*20);
      if(c){ c.isChild=true; c.r=e.r*0.68; c.hp=c.maxHp=e.maxHp*0.42; c.xp=Math.max(1,Math.floor(e.xp/2)); }
    }
  }
  if(e.mech==='goo') addSlowPool(e.x,e.y,42,'goo-syrup','#df9758');
  if(e.mech==='shield' || (e.mech==='frostSplit' && !e.isChild)){
    const frozen=e.mech==='frostSplit', count=frozen?4:2;
    addMotion('ice-break',e.x,e.y,e.r*4);
    for(let i=0;i<count;i++){
      const a=TAU*i/count;
      const child=spawnEnemy(frozen?e.type:'split',e.x+24*Math.cos(a),e.y+24*Math.sin(a));
      if(!child) break;
      child.isChild=true;
      if(frozen){
        child.r*=.6; child.tier=0; child.hp=child.maxHp=e.maxHp*.25; child.xp=2;
      }
    }
  }
  if(isElite){
    openChest(e.x,e.y); toast('🎁 '+e.displayName+'倒下！宝箱掉落'); Sound.chest();
    Juice.feedback('large',e.x,e.y,e.color);
  } else if(isBoss){
    game.flash=1; Juice.feedback('large',e.x,e.y,e.color);
    Juice.addTrauma(0.3); showBossBar(false);
    levelClear();
  }
}
function hurtPlayer(dmg,source){
  if(player.invuln>0||game.state!=='playing') return;
  const real=Math.max(1, Math.round(dmg)-player.armor);
  if(real<Math.round(dmg)){
    player.shieldHitAt=game.time;
    player.shieldAngle=source?Math.atan2(source.y-player.y,source.x-player.x):Math.atan2(player.faceY,player.faceX);
  }
  player.hp-=real; player.invuln=0.65; game.flash=.5; player.sq=1; player.sqT=0.22;
  Juice.feedback('large',player.x,player.y,CFG.ART.boss.main);
  addDmgText(player.x,player.y-player.r-8,real,false,'#ff6f92');
  spawnParts(player.x,player.y,CFG.ART.boss.main,10,130);
  Sound.hurt();
  if(player.hp<=0){
    if(player.passives.revive && !player.revived){
      player.revived=true; player.hp=player.maxHp*.5; player.invuln=2;
      addMotion('aura',player.x,player.y,106);
      toast('星愿 · 已复活');
    } else { player.hp=0; gameover(); }
  }
}
function gainXp(v){
  // 满级停经验：Lv20 后经验球转为微量回血，避免"满级还在捡垃圾"
  if(player.level>=CFG.LEVEL.playerMax){ player.hp=Math.min(player.maxHp,player.hp+v*0.5); return; }
  v*=1+.15*(player.passives.xp||0);
  player.xp+=v; game.totalXp+=v;
}
function updateRunRewards(){
  const t=game.levelTime, P=CFG.PROGRESSION;
  if(game.state!=='playing' || game.bossIntro || t<game.nextRewardAt) return;
  if(player.level<CFG.LEVEL.playerMax && player.xp>=player.xpNext && t>=game.nextLevelAt){
    player.xp-=player.xpNext; player.level++;
    player.xpNext=P.xpCosts[player.level-1] ?? 0;
    if(player.level>=CFG.LEVEL.playerMax) player.xp=0;
    let gap=0;
    for(const [from,seconds] of P.levelGaps) if(player.level>=from) gap=seconds;
    game.nextLevelAt=t+gap;
    player.hp=Math.min(player.maxHp,player.hp+8);
    Sound.levelup(); spawnParts(player.x,player.y,CFG.ART.xp.light,20,180);
    Juice.feedback('medium',player.x,player.y,CFG.ART.xp.main);
    if(buildCards(false)){
      game.nextRewardAt=t+P.rewardGap;
      return;
    }
  }
  if(player.level>1 && popChest()) game.nextRewardAt=t+P.rewardGap;
}

// === 定时关底序列：清场 → 星光演出 → Boss/守卫降临 ===
function beginBossSequence(){
  if(game.bossSpawned||game.bossIntro||game.state!=='playing') return;
  game.bossIntro=true;
  clearToast();
  // 清场：残留小怪与弹幕化星光消散，给决战留出干净场地
  for(const e of game.enemies){ if(e.type!=='boss'){ spawnParts(e.x,e.y,CFG.ART.xp.light,8,120); e.dead=true; } }
  game.enemies=game.enemies.filter(e=>e.type==='boss');
  game.ebullets.length=0;
  game.hazards.length=0;
  game.flash=1; Juice.addTrauma(0.35);
  Juice.feedback('large',player.x,player.y,CFG.ART.xp.main);
  Sound.levelup();
  toast(`🌟 ${game.bossKind.title}·${game.bossKind.name} 正在降临…`);
  // 用游戏内计时而非 setTimeout：暂停/切场景时不会错乱（step 循环里递减 bossSeqT）
  game.bossSeqT=CFG.LEVEL.bossSequence;
  game.bossEntry={x:player.x,y:player.y-Math.min(VIEW.w,VIEW.h)*.32};
}
function spawnBoss(){
  const entry=game.bossEntry||{x:player.x,y:player.y-Math.min(VIEW.w,VIEW.h)*.32};
  game.boss=spawnEnemy('boss',entry.x,entry.y);
  if(!game.boss) return;
  game.bossSpawned=true; game.bossIntro=false;
  game.boss.maxPhase=game.bossGuard?2:game.level===20?4:3;
  game.boss.atk=1.5;
  showBossBar(true);
  toast(`⚔️ ${game.bossKind.title}·${game.bossKind.name} 登场！`); Sound.boss();
  Juice.feedback('large',game.boss.x,game.boss.y,game.bossKind.color);
}

// === 特效构造 ===
function spawnParts(x,y,color,n,spd){
  for(let i=0;i<n;i++){
    if(game.parts.length>=CFG.MAX_PARTICLES) break;
    const a=Math.random()*TAU, s=rand(spd*.3,spd);
    game.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.6),max:.6,color,
      size:rand(2,5),spark:Math.random()<0.4,spin:rand(0,TAU)});
  }
}
function addDmgText(x,y,v,crit,color){
  const txt = typeof v==='string' ? v : '−'+v;
  game.dmgTexts.push({x,y,v:txt,crit,color:color||(crit?'#ffb43c':'#ffffff'),life:.8,drift:rand(-16,16)});
  if(game.dmgTexts.length>60) game.dmgTexts.shift();
}

// === 更新：世界 ===
function update(dt){
  game.time+=dt; game.levelTime+=dt;
  if(player.invuln>0) player.invuln-=dt;
  if(player.regen) player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);
  if(player.sqT>0) player.sqT-=dt; else player.sq=0;
  if(game.flash>0) game.flash-=dt;
  if(game.toastT>0){ game.toastT-=dt; if(game.toastT<=0) document.getElementById('toast').classList.remove('show'); }

  const v=Input.vector();
  if(v.x||v.y){ player.faceX=v.x; player.faceY=v.y; }
  player.ox=player.x; player.oy=player.y;
  const slowed=game.time<(player.slowUntil||0) || game.hazards.some(h=>h.kind && game.time>=h.activeAt &&
    dist2(player.x,player.y,h.x,h.y)<h.r*h.r);
  const speed=player.speed*(slowed?.75:1);
  player.x+=v.x*speed*dt; player.y+=v.y*speed*dt;
  Rig.trackWalk(player,Math.hypot(player.x-player.ox,player.y-player.oy),dt,70);

  if(game.levelTime>=CFG.LEVEL.bossAt && !game.bossSpawned && !game.bossIntro) beginBossSequence();

  // 刷怪：按实战时间抬高目标存活数，保留每秒补怪频率与同屏上限。
  game.spawnT-=dt;
  if(game.spawnT<=0 && !game.bossIntro && !game.bossSpawned){
    game.spawnT=1/CFG.SPAWN.refillPerSec;
    const target=spawnTarget();
    let alive=0; for(const e of game.enemies) if(!e.dead&&e.type!=='boss') alive++;
    if(alive<target){
      // 第一只棉棉在场内给玩家一个明确的攻击与拾取目标。
      if(game.levelTime<1 && alive===0) spawnEnemy('spore',player.x,player.y-Math.min(200,VIEW.h*.26));
      else spawnCrowdEnemy(pickEnemyType(),target-alive);
    }
  }
  game.eliteT-=dt;
  if(game.eliteT<=0 && !game.bossIntro && !game.bossSpawned){
    game.eliteT=30;
    spawnEncounterElite();
  }

  // 资源物：随机在玩家附近刷新星星水晶（打碎掉经验 + 小回血）
  game.propT-=dt;
  if(game.propT<=0){
    game.propT=CFG.PROP.interval*rand(0.8,1.25);
    if(game.props.length<4) spawnProp();
  }

  // 演出计时（游戏内时间，暂停时不推进）
  if(game.bossIntro){
    game.bossSeqT-=dt;
    if(game.bossSeqT<=0) spawnBoss();
  }

  updateEnemies(dt);
  updateWeapons(dt);
  updateExpansionEntities(dt);
  updateBullets(dt);
  updateEBullets(dt);
  updateGems(dt);
  updateChests(dt);
  updateProps(dt);
  updateHazards(dt);
  updateParts(dt);
  updateDmgTexts(dt);
  updateFx(dt);
  updateRunRewards();

  // 过关唯一条件：击杀关底（主题 Boss / 关底守卫），见 killEnemy→levelClear

  const tx=player.x-VIEW.w/2, ty=player.y-VIEW.h/2;
  game.cam.x+=(tx-game.cam.x)*Math.min(1,9*dt);
  game.cam.y+=(ty-game.cam.y)*Math.min(1,9*dt);
}

function updateEnemies(dt){
  const list=game.enemies;
  const buffers=game.level>=13?list.filter(e=>!e.dead && e.mech==='buff'):[];
  const retireDistance=Math.hypot(VIEW.w,VIEW.h)*.73+240;
  for(let i=list.length-1;i>=0;i--){
    const e=list[i];
    if(e.dead || (e.type!=='boss' && dist2(e.x,e.y,player.x,player.y)>retireDistance**2)){
      list.splice(i,1);
      continue;
    }
    if(e.activateAt){
      if(e.activateAt>game.time) continue;
      e.activateAt=0;
      e.hidden=false;
    }
    e.ox=e.x; e.oy=e.y;
    if(e.hit>0) e.hit-=dt;
    if(e.sqT>0) e.sqT-=dt; else e.sq=0;
    if(e.slow>0) e.slow-=dt;

    const dx=player.x-e.x, dy=player.y-e.y, d=Math.hypot(dx,dy)||1;
    const ux=dx/d, uy=dy/d;
    e.face=Math.atan2(dy,dx);
    const timeSlowed=game.timeFields.some(f=>dist2(e.x,e.y,f.x,f.y)<f.r*f.r);
    e.inClockField=timeSlowed;
    const boosted=buffers.some(b=>b!==e && !b.dead && dist2(e.x,e.y,b.x,b.y)<115**2);
    let spd=e.speed*(e.slow>0?.45:timeSlowed?.6:1)*(boosted?1.3:1), mvx=ux, mvy=uy;

    switch(e.mech){
      case 'goo': case 'shot': case 'heal': case 'blink': case 'buff':
        if(updateSpecialEnemy(e,d)) continue;
        break;
      case 'dash': {
        e.dashT-=dt;
        if(e.dashT<=0){
          e.dashT=rand(1.35,1.85);
          e.dashLeft=.32; e.dashAngle=e.face;
        }
        const charging=e.dashT<0.32;
        e.dashLeft=Math.max(0,(e.dashLeft||0)-dt);
        const lunging=e.dashLeft>0;
        if(lunging){ mvx=Math.cos(e.dashAngle); mvy=Math.sin(e.dashAngle); }
        spd*=charging?.25:lunging?2.05:.72;
        break;
      }
      case 'stealth': {
        e.stealth+=dt;
        e.hidden=(e.stealth%5.2)>3.0;
        if(e.hidden) spd*=0.55;
        break;
      }
      case 'steal': {
        e.stealT-=dt;
        if(!e.carrying && e.stealT<=0 && game.gems.length){
          let gi=-1,bd=1e9;
          for(let g=0;g<game.gems.length;g++){
            const dd=dist2(game.gems[g].x,game.gems[g].y,e.x,e.y);
            if(dd<bd){bd=dd;gi=g;}
          }
          if(gi>=0 && bd<220*220){
            e.carrying=game.gems[gi].val;
            spawnParts(game.gems[gi].x,game.gems[gi].y,'#ffc174',6,90);
            game.gems.splice(gi,1); e.stealT=rand(5,8);
          }
        }
        if(e.carrying){ mvx=-ux; mvy=-uy; spd*=1.15; }
        break;
      }
      case 'explode': {
        if(e.fuse<0 && d<e.r+player.r+52){ e.fuse=1.5; toast('💥 爆米点着引信啦！'); }
        if(e.fuse>=0){
          e.fuse-=dt; spd*=1.35;
          if(e.fuse<=0){ explodeBomber(e); continue; }
        }
        break;
      }
      case 'summon': {
        e.summonT-=dt;
        if(e.summonT<=0 && game.enemies.length<CFG.MAX_ENEMIES-3){
          e.summonT=rand(4.5,7);
          const n=2;
          for(let k=0;k<n;k++){
            const a=rand(0,TAU);
            spawnEnemy('spore', e.x+Math.cos(a)*e.r*1.4, e.y+Math.sin(a)*e.r*1.4);
          }
          spawnParts(e.x,e.y,'#ffd97a',12,120);
        }
        break;
      }
      case 'phase': {
        const pct=e.hp/e.maxHp;
        // 守卫两阶段，黑森林额外在 25% 血量进入狂暴。
        const maxP=e.maxPhase||3;
        const st=Math.min(maxP,pct>.66?1:pct>.33?2:pct<.25?4:3);
        if(st!==e.phaseStage){
          e.phaseStage=st; game.shake=0; flashScreen(0.4);
          Juice.feedback('large',e.x,e.y,e.color);
          toast(st===2?'第二形态 · 召唤伙伴':st===4?'狂暴形态 · 躲避红蓝双束':'第三形态 · 留意地面预警');
          showBossPhase(st);
        }
        if(e.atk>2.1 && st===3) spd*=0.12;
        if(st===4) spd*=1.5;
        e.atk-=dt;
        if(e.atk<=0){
          const bc=e.color;
          if(st===1){
            e.atk=2.1; const base=Math.atan2(dy,dx), n=12;
            for(let k=0;k<n;k++){ const a=base+k/n*TAU;
              game.ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*185,vy:Math.sin(a)*185,r:7,life:4.2,dmg:14,color:bc}); }
          } else if(st===2){
            e.atk=2.6; const base=Math.atan2(dy,dx), n=14;
            for(let k=0;k<n;k++){ const a=base+k/n*TAU;
              game.ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*200,vy:Math.sin(a)*200,r:7,life:4.2,dmg:14,color:bc}); }
            for(let k=0;k<3 && game.enemies.length<CFG.MAX_ENEMIES-3;k++){
              const a=rand(0,TAU); spawnEnemy('swift',e.x+Math.cos(a)*e.r*1.5,e.y+Math.sin(a)*e.r*1.5);
            }
          } else {
            e.atk=3.2;
            const a=Math.atan2(dy,dx);
            const len=Math.max(VIEW.w,VIEW.h)*1.4;
            if(game.level===20){
              const attack={hit:false};
              const angles=st===4?[a-.28,a+.28]:[a];
              for(let i=0;i<angles.length;i++){
                const color=st===4?(i===0?'#e85b85':'#668dff'):bc;
                game.fx.push({type:'laserWarn',owner:e,x:e.x,y:e.y,a:angles[i],len,life:1.05,max:1.05,color,attack});
              }
              if(st===4) addMotion('forest-rage',e.x,e.y,135,a,154,1.05);
            } else {
              // 莓莓铺开三连糖霜，抹茶封目标周边，云朵沿移动方向落下云团。
              const offsets=game.level===5?[-75,0,75]:game.level===10?[0]:[0,80];
              const attack={pushed:false};
              const key=game.level===5?'berry-frost':game.level===10?'matcha-pool':'souffle-gust';
              for(const offset of offsets){
                const x=player.x+offset*(game.level===15?ux:-uy);
                const y=player.y+offset*(game.level===15?uy:ux);
                const life=game.level===10?1.15:.8;
                game.fx.push({type:'bossCircle',owner:e,x,y,r:game.level===10?104:48,
                  life,max:life,color:bc,key,attack});
              }
            }
          }
          Sound.hit();
        }
        break;
      }
    }

    e.x+=(mvx*spd+e.kx)*dt; e.y+=(mvy*spd+e.ky)*dt;
    // Knockback translates the body without accelerating the feet.
    const advancing=e.mech==='dash' && e.dashT<.32?0:Math.hypot(mvx,mvy)*spd*dt;
    Rig.trackWalk(e,advancing,dt,e.type==='boss'?34:isEliteEnemy(e)?29:25);
    e.kx*=Math.pow(0.02,dt); e.ky*=Math.pow(0.02,dt);
    if(e.mech!=='explode' && game.time>=(e.contactAt||0) && d<e.r+player.r-4) hurtPlayer(e.dmg,e);
  }
}

function flashScreen(v){ game.flash=Math.max(game.flash,v); }
function explodeBomber(e){
  e.dead=true; game.kills++; game.levelKills++;
  spawnParts(e.x,e.y,'#ff9ba6',26,200);
  spawnParts(e.x,e.y,'#fff3c4',14,120);
  game.fx.push({type:'boom',x:e.x,y:e.y,r:20,R:96,life:0.32,max:0.32});
  Juice.feedback('medium',e.x,e.y,'#ff9ba6');
  Sound.kill();
  if(dist2(e.x,e.y,player.x,player.y)<96*96) hurtPlayer(18,e);
  dropGem(e.x,e.y,e.xp);
}

function updateHazards(dt){
  for(let i=game.hazards.length-1;i>=0;i--){
    const h=game.hazards[i]; h.life-=dt;
    if(h.life<=0){ game.hazards.splice(i,1); continue; }
    if(h.kind && (game.time<h.activeAt || !h.damage)) continue;
    h.tick-=dt;
    if(h.tick<=0){
      h.tick=CFG.SPORE.hazardTick;
      if(dist2(h.x,h.y,player.x,player.y)<h.r*h.r) hurtPlayer(h.damage??CFG.SPORE.hazardDmg,h);
    }
  }
}

// === 武器更新 ===
function updateWeapons(dt){
  const w=player.weapons;
  for(const id in w){
    const wp=w[id], def=WEAPONS[id];
    if(id==='bolt'){
      wp.timer-=dt*player.fireRate;
      if(wp.timer<=0){
        const t=nearestEnemy();
        if(t){
          // 有目标才进入冷却：怪进圈的第一时间就开火，不会白等一个 CD
          wp.timer=def.cd*player.cooldown/(1+0.05*(wp.level-1));
          const n=1+Math.floor(wp.level/2)+extraShots();
          const flight=Math.min(.45,Math.hypot(t.x-player.x,t.y-player.y)/470);
          const lead=t.prop?0:flight/CFG.STEP;
          const aimX=t.prop?t.x:t.x+(t.x-t.ox)*lead;
          const aimY=t.prop?t.y:t.y+(t.y-t.oy)*lead;
          const ang=Math.atan2(aimY-player.y,aimX-player.x);
          Rig.startCast(player,game.time,ang);
          for(let k=0;k<n;k++){
            const a=ang+(k-(n-1)/2)*0.16;
            game.bullets.push({x:player.x,y:player.y,ox:player.x,oy:player.y,vx:Math.cos(a)*470,vy:Math.sin(a)*470,r:7,life:1.5,dmg:12,pierce:1+Math.floor(wp.level/2),hit:new Set(),kind:'bolt'});
          }
          Sound.shoot();
        }
      }
    } else if(id==='lightning'){
      wp.timer-=dt*player.fireRate;
      if(wp.timer<=0){
        const targets=nearestEnemies(1+Math.floor(wp.level/2)+extraShots());
        if(targets.length){
          wp.timer=def.cd*player.cooldown;
          const target=targets[0];
          Rig.startCast(player,game.time,Math.atan2(target.y-player.y,target.x-player.x));
          for(const t of targets){
            game.fx.push({type:'lightning',x1:t.x-95,y1:t.y-235,x2:t.x,y2:t.y,
              life:.18,max:.18,damage:26+wp.level*8,r:34*areaScale()});
          }
          Sound.shoot();
        }
      }
    } else if(id==='nova'){
      wp.timer-=dt*player.fireRate;
      if(wp.timer<=0){
        wp.timer=def.cd*player.cooldown;
        Rig.startCast(player,game.time);
        const R=(180+wp.level*26)*areaScale();
        game.fx.push({type:'nova',x:player.x,y:player.y,r:10,R,life:.42,max:.42});
        for(const e of game.enemies){
          if(!e.dead && dist2(e.x,e.y,player.x,player.y)<R*R)
            damageEnemy(e,20+wp.level*10,e.x-player.x,e.y-player.y,false);
        }
        for(const p of game.props){
          if(!p.dead && dist2(p.x,p.y,player.x,player.y)<R*R)
            damageProp(p,20+wp.level*10,p.x-player.x,p.y-player.y);
        }
        Sound.nova();
        Juice.feedback('medium',player.x,player.y,null,CFG.FEEL.hitCap,'nova',0.5);
      }
    } else if(id==='orbit'){
      player.orbAngle=(player.orbAngle||0)+dt*2.4;
      const n=2+wp.level, R=(54+wp.level*3)*areaScale();
      const dmg=9+wp.level*4;
      for(let k=0;k<n;k++){
        const a=player.orbAngle+k/n*TAU;
        const bx=player.x+Math.cos(a)*R, by=player.y+Math.sin(a)*R;
        for(const e of game.enemies){
          if(e.dead) continue;
          if(dist2(bx,by,e.x,e.y)<(e.r+9)*(e.r+9)){
            const key='o'+wp.id+k;
            e._ohit=e._ohit||{};
            if((e._ohit[key]||0)<game.time){ e._ohit[key]=game.time+0.35; damageEnemy(e,dmg,Math.cos(a)*60,Math.sin(a)*60,false); }
          }
        }
        for(const p of game.props){
          if(p.dead) continue;
          if(dist2(bx,by,p.x,p.y)<(p.r+9)*(p.r+9)){
            const key='o'+wp.id+k;
            p._ohit=p._ohit||{};
            if((p._ohit[key]||0)<game.time){ p._ohit[key]=game.time+0.35; damageProp(p,dmg,Math.cos(a)*60,Math.sin(a)*60); }
          }
        }
      }
    } else if(id==='aura'){
      player.auraTick-=dt;
      const R=(70+wp.level*13)*areaScale();
      if(player.auraTick<=0){
        player.auraTick=0.5;
        for(const e of game.enemies){
          if(!e.dead && dist2(e.x,e.y,player.x,player.y)<(R+e.r)*(R+e.r)){
            damageEnemy(e,7+wp.level*3,e.x-player.x,e.y-player.y,false);
            e.slow=.6*durationScale();
          }
        }
        for(const p of game.props){
          if(!p.dead && dist2(p.x,p.y,player.x,player.y)<(R+p.r)*(R+p.r))
            damageProp(p,7+wp.level*3,p.x-player.x,p.y-player.y);
        }
      }
    } else updateExpansionWeapon(wp,dt);
  }
}
// === 自动攻击选敌：射程门控 + 分层优先级 + 同层就近 ===
// 规则（对应设计）：角色有攻击范围，怪进入范围才开始自动攻击；
// 范围内优先级 最终Boss > 小Boss > 精英 > 普通怪 > 资源物，同层取最近的。
// 锁定保持：同层目标短时间不切换，避免两只同级怪之间来回摇摆。
let aimLock={ref:null,until:0,tier:0};
function targetTier(e){
  const T=CFG.AIM.tier;
  if(e.prop) return T.res;
  if(e.type==='boss') return game.level>=CFG.LEVEL.total ? T.finalBoss : T.miniBoss;
  if(isEliteEnemy(e) || e.mech==='heal') return T.elite;
  return T.mob;
}
function pickTargets(count, range){
  if(count<=0) return [];
  const R=range!==undefined?range:CFG.AIM.range.bolt, R2=R*R;
  const list=[];
  for(const e of game.enemies){
    if(e.dead||e.hidden) continue;
    const d2=dist2(e.x,e.y,player.x,player.y);
    if(d2>R2) continue;                       // 射程外的怪不参与选敌
    list.push({e,d2,tier:targetTier(e)});
  }
  for(const p of game.props){
    if(p.dead) continue;
    const d2=dist2(p.x,p.y,player.x,player.y);
    if(d2>R2) continue;
    list.push({e:p,d2,tier:targetTier(p)});
  }
  if(!list.length){ aimLock.ref=null; return []; }
  list.sort((a,b)=> (b.tier-a.tier) || (a.d2-b.d2));

  // 锁定保持：上一目标仍存活、仍在射程内且层级不低于当前最优时，继续打它
  if(aimLock.ref && game.time<aimLock.until){
    const i=list.findIndex(o=>o.e===aimLock.ref);
    if(i>0 && list[i].tier>=list[0].tier) list.unshift(list.splice(i,1)[0]);
  }
  const best=list[0];
  if(aimLock.ref!==best.e) aimLock.until=game.time+CFG.AIM.stick;
  aimLock.ref=best.e; aimLock.tier=best.tier;
  game.aimTarget=best.e;
  return list.slice(0,count).map(o=>o.e);
}
function nearestEnemy(){ return pickTargets(1, CFG.AIM.range.bolt)[0]||null; }
function nearestEnemies(n){ return pickTargets(n, CFG.AIM.range.lightning); }

function updateBullets(dt){
  for(let i=game.bullets.length-1;i>=0;i--){
    const b=game.bullets[i]; b.ox=b.x; b.oy=b.y;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    let gone=b.life<=0;
    if(!gone) for(const e of game.enemies){
      if(e.dead||e.activateAt>game.time||b.hit.has(e.id)) continue;
      if(dist2(b.x,b.y,e.x,e.y)<(e.r+b.r)*(e.r+b.r)){
        b.hit.add(e.id); damageEnemy(e,b.dmg,b.vx,b.vy,true);
        if(--b.pierce<0){ gone=true; break; }
      }
    }
    if(!gone) for(const p of game.props){
      if(p.dead||b.hit.has('p'+p.id)) continue;
      if(dist2(b.x,b.y,p.x,p.y)<(p.r+b.r)*(p.r+b.r)){
        b.hit.add('p'+p.id); damageProp(p,b.dmg,b.vx,b.vy);
        if(--b.pierce<0){ gone=true; break; }
      }
    }
    if(gone) game.bullets.splice(i,1);
  }
}
function updateEBullets(dt){
  for(let i=game.ebullets.length-1;i>=0;i--){
    const b=game.ebullets[i]; b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    let gone=b.life<=0;
    if(!gone && dist2(b.x,b.y,player.x,player.y)<(b.r+player.r)*(b.r+player.r)){
      hurtPlayer(b.dmg,b);
      if(b.kind==='bubble-shot') player.slowUntil=game.time+.8;
      gone=true;
    }
    if(gone) game.ebullets.splice(i,1);
  }
}
function updateGems(dt){
  for(let i=game.gems.length-1;i>=0;i--){
    const g=game.gems[i]; g.life-=dt;
    g.x+=g.vx*dt; g.y+=g.vy*dt; g.vx*=Math.pow(.02,dt); g.vy*=Math.pow(.02,dt);
    const d=Math.hypot(player.x-g.x,player.y-g.y);
    if(d>0 && d<player.pickup){
      const s=Math.min(1, 12*dt), pull=(player.pickup-d)*5.5;
      g.x+=(player.x-g.x)/d*s*pull; g.y+=(player.y-g.y)/d*s*pull;
    }
    if(d<player.r+g.r+2){ game.gems.splice(i,1); gainXp(g.val); Sound.pickup(); }
    else if(g.life<=0) game.gems.splice(i,1);
  }
}
function updateChests(dt){
  for(let i=game.chests.length-1;i>=0;i--){
    const c=game.chests[i]; c.t+=dt;
    if(dist2(c.x,c.y,player.x,player.y)<(player.r+c.r+6)*(player.r+c.r+6)){
      game.chests.splice(i,1);
      game.chestQueue++;
    }
  }
}
function updateParts(dt){
  for(let i=game.parts.length-1;i>=0;i--){
    const p=game.parts[i]; p.life-=dt;
    if(p.life<=0){ game.parts.splice(i,1); continue; }
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=Math.pow(.06,dt); p.vy*=Math.pow(.06,dt);
  }
}
function updateDmgTexts(dt){
  for(let i=game.dmgTexts.length-1;i>=0;i--){
    const t=game.dmgTexts[i]; t.life-=dt; t.y-=26*dt;
    if(t.life<=0) game.dmgTexts.splice(i,1);
  }
}
function updateFx(dt){
  for(let i=game.fx.length-1;i>=0;i--){
    const f=game.fx[i]; f.life-=dt;
    if(f.type==='nova') f.r+=(f.R-f.r)*Math.min(1,10*dt);
    if(f.life>0) continue;
    game.fx.splice(i,1);
    if(f.type==='lightning' && game.state==='playing'){
      game.fx.push({...f,type:'meteorImpact',life:.24,max:.24});
      const radius=f.r||34;
      for(const e of game.enemies){
        if(!e.dead && dist2(e.x,e.y,f.x2,f.y2)<radius**2){
          damageEnemy(e,f.damage,e.x-f.x2,e.y-f.y2);
        }
      }
      for(const p of game.props){
        if(!p.dead && dist2(p.x,p.y,f.x2,f.y2)<radius**2){
          damageProp(p,f.damage,p.x-f.x2,p.y-f.y2);
        }
      }
      spawnParts(f.x2,f.y2,'#ffe08a',6,120);
      if(Juice.ready('meteor-sound',.1)) Sound.meteor();
    }
    if(f.type==='bossCircle' && !f.owner.dead && game.state==='playing'){
      if(f.key) addMotion(f.key,f.x,f.y,f.r*2.7);
      else game.fx.push({...f,type:'bossBurst',life:.38,max:.38});
      if(dist2(f.x,f.y,player.x,player.y)<f.r*f.r){
        hurtPlayer(22,f);
        if(f.key==='souffle-gust' && !f.attack.pushed){
          f.attack.pushed=true;
          const a=Math.atan2(player.y-f.owner.y,player.x-f.owner.x);
          player.x+=64*Math.cos(a); player.y+=64*Math.sin(a);
        }
      }
      if(f.key==='matcha-pool') addSlowPool(f.x,f.y,f.r,f.key,f.color,CFG.SPORE.hazardDmg);
    }
    if(f.type==='laserWarn' && !f.owner.dead && game.state==='playing'){
      game.fx.push({...f,type:'laser',life:.28,max:.28});
      const px=player.x-f.x, py=player.y-f.y;
      const along=px*Math.cos(f.a)+py*Math.sin(f.a);
      const across=Math.abs(-px*Math.sin(f.a)+py*Math.cos(f.a));
      if(along>0 && along<f.len && across<26 && !f.attack?.hit){
        if(f.attack) f.attack.hit=true;
        hurtPlayer(22,f);
      }
      Juice.addTrauma(.24);
    }
  }
}

// === 关卡结算 ===
function gameover(){ game.state='gameover'; Sound.lose(); showResult(false); }
function levelClear(){
  if(game.state!=='playing') return;
  clearToast();
  const cleared=game.level;
  if(cleared>=game.unlocked && cleared<CFG.LEVEL.total){ game.unlocked=cleared+1; saveProgress(); }
  const allDone=cleared>=CFG.LEVEL.total;
  game.state=allDone?'complete':'clear';
  Sound.win();
  // 状态已切换（世界停止推进），结算面板延迟弹出，留出通关庆祝时间
  setTimeout(()=>showResult(true, allDone), 900);
}
function showResult(win, allDone=false){
  clearToast();
  showBossBar(false);
  const t=document.getElementById('resTitle');
  const s=document.getElementById('resSub');
  if(allDone){
    t.textContent='星光全收集！'; t.style.color='var(--gold)';
    s.textContent='你守护了所有场景，是最闪耀的星光卫士！';
  } else if(win){
    t.textContent=`第 ${game.level} 关通过`; t.style.color='var(--gold)';
    s.textContent=game.bossGuard?'击败关底守卫，继续下一关吧':'击败主题伙伴，继续下一关吧';
  } else {
    t.textContent='再试一次吧'; t.style.color='var(--red)';
    s.textContent=`第 ${game.level} 关 · 坚持到了 ${player.level} 级`;
  }
  document.getElementById('rTime').textContent=fmtTime(game.levelTime);
  document.getElementById('rLevel').textContent=player.level+' / '+CFG.LEVEL.playerMax;
  document.getElementById('rKills').textContent=game.levelKills;
  // 最终构筑：武器 + 被动清单（带等级），让每局的养成结果可见
  const build=[];
  for(const k in player.weapons) build.push(`<span>${itemIcon(k)}${WEAPONS[k].name} ${player.weapons[k].level}</span>`);
  for(const k in player.passives) if(player.passives[k]>0) build.push(`<span>${itemIcon(k)}${PASSIVES[k].name} ${player.passives[k]}</span>`);
  const rb=document.getElementById('rBuild'); if(rb) rb.innerHTML=build.length?build.join(''):'—';
  // 按钮：失败=重试；过关=下一关；通关=再玩一次
  const again=document.getElementById('againBtn');
  const next=document.getElementById('nextBtn');
  again.textContent = win ? '重玩本关' : '重试本关';
  if(win && !allDone){ next.classList.remove('hidden'); }
  else { next.classList.add('hidden'); }
  show('result');
}
