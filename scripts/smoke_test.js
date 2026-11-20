const fs=require('fs'),vm=require('vm');
// 用法：在项目根目录执行  node scripts/smoke_test.js
// 说明：拼接 js/ 核心脚本到 vm 沙箱，用最小 DOM 桩跑关卡/机制/选敌/渲染回归。
const files=['js/config.js','js/core.js','js/rig.js','js/sprites.js','js/slicerig.js','js/effects.js','js/expansion.js','js/logic.js','js/tilemap.js','js/render.js'];
let code=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');

// --- DOM / browser stubs ---
const store={};
function mkEl(){return {
  style:{}, _cls:'', classList:{add(){},remove(){},contains(){return false},toggle(){return true}},
  textContent:'', innerHTML:'',
  appendChild(){}, addEventListener(){}, focus(){},
  setAttribute(){}, getContext(){return ctx2d},
  get style(){return this._style||(this._style={setProperty(name,value){this[name]=value;}})},
};}
const gradient={addColorStop(){}};
// Path2D 最小桩：rig 骨骼动画用 Path2D 画部件，这里只需吞掉所有路径调用
const Path2DStub=function(){};
Path2DStub.prototype.moveTo=function(){};Path2DStub.prototype.lineTo=function(){};
Path2DStub.prototype.quadraticCurveTo=function(){};Path2DStub.prototype.bezierCurveTo=function(){};
Path2DStub.prototype.ellipse=function(){};Path2DStub.prototype.arc=function(){};
Path2DStub.prototype.closePath=function(){};
const ctx2d=new Proxy({}, {get(t,k){
  if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>gradient;
  if(k==='measureText')return ()=>({width:10});
  if(typeof k==='string'&&['canvas','fillStyle','strokeStyle','font','globalAlpha','globalCompositeOperation','lineWidth','lineCap','lineJoin','textAlign','shadowColor','shadowBlur','filter'].includes(k))return t[k];
  return ()=>{};
}, set(t,k,v){t[k]=v;return true;}});
const els={};
const document={
  getElementById(id){ if(!els[id]) els[id]=mkEl(); return els[id]; },
  createElement(){ return mkEl(); },
};
const localStorage={ getItem(k){return store[k]||null}, setItem(k,v){store[k]=v} };
const window={ devicePixelRatio:1, innerWidth:800, innerHeight:600, addEventListener(){}, AudioContext:null };
const Image=function(){this.complete=false;this.naturalWidth=0;};
const sandbox={ document, window, localStorage, Image, Path2D:Path2DStub,
  addEventListener(){}, removeEventListener(){},
  matchMedia(){return {matches:false}},
  requestAnimationFrame(){}, setTimeout(fn){ /* 不执行延迟回调，避免污染 */ },
  console, Math, Date, performance:{now(){return 0}},
  innerWidth:800, innerHeight:600,
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox);

function run(expr){ return vm.runInContext(expr,sandbox); }
let pass=0,fail=0;
function ok(name,cond){ if(cond){pass++;console.log('  ✓',name);}else{fail++;console.log('  ✗ FAIL',name);} }

console.log('\n[1] 初始状态与配置');
ok('总关卡=20', run('CFG.LEVEL.total')===20);
ok('满级=20', run('CFG.LEVEL.playerMax')===20);
ok('经验表覆盖 Lv1→20，首抽 5 点且后续门槛递增', run(`(()=>{
  const costs=CFG.PROGRESSION.xpCosts;
  return costs.length===CFG.LEVEL.playerMax-1 && costs[0]===5 &&
    costs.slice(1).every((cost,i)=>cost>costs[i]);
})()`));
ok('初始已解锁=1', run('game.unlocked')===1);
ok('第5关是主题Boss关', run('isBossLevel(5)')===true);
ok('第6关不是主题Boss关', run('isBossLevel(6)')===false);
ok('第1关场景=阳光草地', run("actOf(1).name")==='阳光草地');
ok('第7关场景=糖果森林', run("actOf(7).name")==='糖果森林');
ok('第13关场景=云端天空', run("actOf(13).name")==='云端天空');
ok('第18关场景=星光城堡', run("actOf(18).name")==='星光城堡');
ok('第20关Boss=黑森林', run("bossInfo(20).name")==='黑森林');

console.log('\n[2] 关卡初始化：起手完全一致，不继承数值');
run('startLevel(1)');
ok('状态=playing', run('game.state')==='playing');
ok('关卡=1', run('game.level')===1);
ok('玩家=Lv1', run('player.level')===1);
ok('初始1把星芒', run('Object.keys(player.weapons).length')===1 && run("!!player.weapons.bolt"));
ok('起手伤害=1', run('player.damage')===1);
ok('甜系命名:棉棉', run("ETYPE.spore.name")==='棉棉');
ok('第1关有怪池表', run('levelRoster(1).pool.length')===3);
run('startLevel(20)');
ok('第20关同样Lv1起手', run('player.level')===1);
ok('第20关同样只1把星芒', run('Object.keys(player.weapons).length')===1);
ok('第20关伤害仍=1(无起跑线加成)', run('player.damage')===1);
ok('第20关起手HP=100', run('player.maxHp')===100);
run('startLevel(10)');
ok('第10关是主题Boss关', run('isBossLevel(game.level)')===true);
ok('第10关关底=抹茶', run('game.bossKind.name')==='抹茶');
ok('主题Boss非守卫', run('game.bossGuard')===false);
run('startLevel(6)');
ok('第6关关底=关底守卫', run('game.bossGuard')===true);
ok('普通关也有bossKind(守卫)', run('game.bossKind!==null')===true);

console.log('\n[3] 定时触发关底，击杀才过关');
run('startLevel(2)');
run('player.level=CFG.LEVEL.playerMax; game.levelTime=CFG.LEVEL.bossAt-1; update(CFG.STEP)');
ok('提前满级也不提前开关底', run('!game.bossIntro && !game.bossSpawned'));
run('player.level=8; player.xp=player.xpNext; game.levelTime=CFG.LEVEL.bossAt; update(CFG.STEP)');
ok('到点未满级也进入演出，演出期间不弹卡', run('game.bossIntro && game.state==="playing" && player.level===8'));
ok('演出中Boss未降临', run('game.bossSpawned')===false);
run('for(let i=0;!game.bossSpawned&&i<300;i++) update(CFG.STEP)');
ok('演出结束Boss降临', run('game.bossSpawned')===true);
ok('第2关关底=守卫', run('game.bossGuard')===true);
ok('守卫血量按守卫公式(2400+2*220=2840)', run('game.boss.maxHp')===2840);
ok('守卫两阶段(maxPhase=2)', run('game.boss.maxPhase')===2);
ok('关底战仍能消耗库存经验升级', run('player.level===9 && game.state==="levelup"'));
run('skipCard()');
run('killEnemy(game.boss)');
ok('击杀守卫→clear', run('game.state')==='clear');
ok('解锁推进到3', run('game.unlocked')===3);
ok('进度已存localStorage', store['starlight_guard_progress']==='3');
run('startLevel(2); game.levelTime=9999; game.levelKills=9999; update(CFG.STEP)');
ok('存活再久、击杀再多也不自动过关', run('game.state')==='playing');

console.log('\n[4] 主题Boss关流程（到时→主题Boss三阶段）');
run('startLevel(5)');
ok('开场Boss未降临', run('game.bossSpawned')===false);
run('game.levelTime=CFG.LEVEL.bossAt; update(CFG.STEP)');
ok('到时进入演出', run('game.bossIntro')===true);
run('for(var i=0;i<300;i++) update(CFG.STEP)');
ok('Boss已降临', run('game.bossSpawned')===true);
ok('主题Boss显示名=莓莓', run('game.boss.displayName')==='莓莓');
ok('主题Boss血量(4800+5*330=6450)', run('game.boss.maxHp')===6450);
ok('主题Boss三阶段(maxPhase=3)', run('game.boss.maxPhase')===3);
run('killEnemy(game.boss)');
ok('击杀主题Boss→clear', run('game.state')==='clear');

console.log('\n[5] 失败流程');
run('startLevel(3)');
run('player.invuln=0; hurtPlayer(9999)');
ok('HP归零', run('player.hp')===0);
ok('状态=gameover', run('game.state')==='gameover');

console.log('\n[6] 敌人机制保留');
run('startLevel(4)');
run("spawnEnemy('spore',0,0)");
ok('棉棉幼体无糖霜云标记', run('game.enemies[game.enemies.length-1].toxic')===false);
run('game.time=100');
run("spawnEnemy('spore',0,0)");
ok('100秒后棉棉是成体有毒', run('game.enemies[game.enemies.length-1].toxic')===true);
run("spawnEnemy('split',0,0)");
ok('团子有分裂机制', run('game.enemies[game.enemies.length-1].mech')==='split');
run("spawnEnemy('mimic',0,0)");
ok('果冻有隐身机制', run('game.enemies[game.enemies.length-1].mech')==='stealth');

console.log('\n[6.1] 满级停经验');
run('startLevel(1); player.level=CFG.LEVEL.playerMax; player.hp=50; player.xp=0;');
run('gainXp(100)');
ok('满级后等级不变', run('player.level')===20);
ok('满级后经验不累积', run('player.xp')===0);
ok('满级经验转微量回血', run('player.hp')>50);

console.log('\n[7] 选敌优先级');
run('startLevel(1); game.enemies=[]; player.x=0; player.y=0;');
run("spawnEnemy('spore',100,0); spawnEnemy('elite',1200,0);");
ok('远处精英不抢近处普通目标', run('pickTargets(1)[0].type')==='spore');
run('game.enemies=[];');
run("spawnEnemy('spore',100,0); spawnEnemy('elite',200,0);");
ok('附近精英优先于普通怪', run('pickTargets(1)[0].type')==='elite');
run('game.enemies=[];');
run("spawnEnemy('boss',200,0); spawnEnemy('elite',30,0);");
ok('Boss优先于精英', run('pickTargets(1)[0].type')==='boss');

console.log('\n[7.1] 射程门控');
run('startLevel(1); game.enemies=[]; game.props=[]; player.x=0; player.y=0; aimLock.until=0;');
run("spawnEnemy('boss',900,0); spawnEnemy('elite',800,0); spawnEnemy('spore',700,0);");
ok('射程外无目标(不隔屏开火)', run('pickTargets(1).length')===0);
ok('射程外射程环半径合理(330)', run('CFG.AIM.range.bolt')===330);
run('game.enemies=[];');
run("spawnEnemy('spore',300,0); spawnEnemy('spore',120,0);");
ok('同层就近优先', run('pickTargets(1)[0].x')===120);
run('game.enemies=[];');
run("spawnProp(150,0); spawnEnemy('spore',250,0);");
ok('普通怪优先于资源物', run('pickTargets(1)[0].type')==='spore');
run("game.enemies=[];");
ok('无怪时打资源物', run("pickTargets(1)[0].prop")===true);
ok('资源物层级低于普通怪', run('CFG.AIM.tier.res < CFG.AIM.tier.mob')===true);
run('game.enemies=[]; game.props=[];');
run('startLevel(20);');
ok('最终Boss层级=5', run('targetTier({type:"boss"})')===5);
run('startLevel(10);');
ok('小Boss层级=4', run('targetTier({type:"boss"})')===4);
run('startLevel(1); game.enemies=[]; player.x=0; player.y=0; aimLock.until=0;');
run("spawnEnemy('spore',150,0); pickTargets(1);");
ok('同层锁定保持(不来回摇摆)', run('aimLock.ref && Math.abs(aimLock.ref.x-150)<0.01')===true);
run('startLevel(1); game.enemies=[]; spawnProp(40,0); game.time=5;');
try{ run('render(1)'); ok('资源物渲染通过', true); }catch(e){ ok('资源物渲染', false); console.log('    ',e.message); }

console.log('\n[8] 渲染不报错(4幕+技能全开)');
for(let lv of [1,7,13,18]){
  try{
    run(`startLevel(${lv}); for(const w in WEAPONS) addWeapon(w); game.time=5; render(1);`);
    ok(`第${lv}关渲染通过`, true);
  }catch(e){ ok(`第${lv}关渲染`,false); console.log('    ',e.message); }
}

console.log('\n[9] 新版战斗回归');
run('startLevel(1); gainXp(player.xpNext); updateRunRewards()');
ok('首抽给出星芒、星环与星爆', run("game.cards.map(c=>c.id).join(',')")==='bolt,orbit,nova');
run('chooseCard(1)');
ok('取得星环并回到战斗', run("player.weapons.orbit.level===1 && game.state==='playing'"));
run('startLevel(1)');
ok('开局只有棉棉', run("Array.from({length:16},()=>pickEnemyType()).every(t=>t==='spore')"));
run("spawnEnemy('split',0,0); damageEnemy(game.enemies[0],1000)");
ok('过量击杀产生两只仍有生命的分裂怪', run('game.enemies.filter(e=>e.isChild && e.hp>0).length')===2);
for(const [n, count, kind] of [[5,3,'bossCircle'],[10,1,'bossCircle'],[15,2,'bossCircle'],[20,2,'laserWarn']]){
  run(`startLevel(${n}); spawnBoss(); player.x=30; game.boss.x=-120; game.boss.y=0;
    game.boss.hp=game.boss.maxHp*.24; game.boss.atk=0; updateEnemies(.01);`);
  ok(`第${n}关独立预警`,run(`game.fx.filter(f=>f.type==='${kind}').length`)===count);
  ok(`第${n}关预警无即时伤害`,run('player.hp===player.maxHp'));
  ok(`第${n}关预警按模拟步推进`,run(`updateFx(1.16); game.fx.every(f=>f.type!=='${kind}')`));
}

run("startLevel(20); spawnEnemy('spore',0,0);");
ok('后期关卡首轮普通怪仍能用初始星芒击杀',run('game.enemies[0].hp===ETYPE.spore.hp'));
run("startLevel(1); spawnEnemy('elite',3000,0); updateEnemies(CFG.STEP)");
ok('远处过期的精英释放刷怪名额',run('game.enemies.length')===0);
run("startLevel(1); spawnEnemy('spore',50,0); addWeapon('lightning'); player.weapons.lightning.timer=0; updateWeapons(.01)");
ok('流星先显示落点预警',run("game.fx.some(f=>f.type==='lightning') && game.enemies[0].hp===game.enemies[0].maxHp"));
run('updateFx(.2)');
ok('流星落地后产生实际命中',run("game.enemies[0].dead && game.fx.some(f=>f.type==='meteorImpact')"));
run('Juice.stop=0; Juice.hitStop(.09); Juice.tick(.03); Juice.hitStop(.02); Juice.tick(.03)');
ok('重叠命中不会提前解除较长停顿',run('Juice.stop>.02'));
run('Juice.tick(.04)');
ok('统一实时钟让停顿恢复',run('Juice.stop')===0);

console.log('\n[10] 栅格地图');
ok('200 个种子可复现且能组合出 200 份区块布局',run(`(()=>{
  const layout=seed=>Array.from({length:25},(_,i)=>terrainChunkVariant(seed,i%5-2,Math.floor(i/5)-2)).join(',');
  const seeds=Array.from({length:200},(_,i)=>i+1);
  return new Set(seeds.map(layout)).size===200 && seeds.every(seed=>layout(seed)===layout(seed));
})()`));
ok('四幕区块由固定数量的有效地块组成',run(`CFG.ACTS.every(({key})=>
  Array.from({length:CHUNK_VARIANTS},(_,i)=>terrainChunkTiles(key,i)).every(tiles=>
    tiles.length===CHUNK_SIDE**2 && tiles.every(tile=>TERRAIN_TILES[key].details.includes(tile))))`));
ok('远距离移动复用已缓存的区块，切幕替换缓存',run(`(()=>{
  for(let i=-20;i<=20;i++) drawTilemap(ctx,'meadow',1,{x:i*10000,y:i*-20000},390,844,20);
  if(terrainChunks.size!==CHUNK_VARIANTS) return false;
  const meadow=[...terrainChunks.values()];
  drawTilemap(ctx,'forest',6,{x:-273,y:270},390,844,20);
  return terrainTheme==='forest' && terrainChunks.size>0 && [...terrainChunks.values()].every(chunk=>!meadow.includes(chunk));
})()`));

console.log('\n[11] 走路骨骼');
ok('走路双腿反相，步态相位取决于行进距离',run(`(()=>{
  const fast={}, slow={};
  Rig.trackWalk(fast,15,.06,60);
  for(let i=0;i<5;i++) Rig.trackWalk(slow,3,.06,60);
  const pose=Rig.walkPose(fast,1);
  return Math.abs(fast.walk-slow.walk)<1e-12 && pose.legL>.4 && pose.legR<-.4;
})()`));
ok('停止移动时步态收回且相位停在最后一步',run(`(()=>{
  const actor={};
  Rig.trackWalk(actor,15,.06,60);
  const lastStep=actor.walk;
  for(let i=0;i<30;i++) Rig.trackWalk(actor,0,CFG.STEP,60);
  return actor.walk===lastStep && Rig.walkPose(actor,1).strength===0;
})()`));

console.log('\n[12] 持杖施法');
ok('星芒无目标时不触发挥杖',run(`(()=>{
  startLevel(1); player.weapons.bolt.timer=0; updateWeapons(CFG.STEP);
  return Rig.castPose(player,game.time)===null;
})()`));
ok('星芒、流星与星爆实际释放时触发挥杖，动作结束后复位',run(`['bolt','lightning','nova'].every(id=>{
  startLevel(1); spawnEnemy('spore',100,0);
  if(id!=='bolt'){ player.weapons={}; addWeapon(id); }
  player.weapons[id].timer=0; updateWeapons(CFG.STEP);
  const start=Rig.castPose(player,game.time);
  const swing=Rig.castPose(player,game.time+.054);
  return start?.angle>0 && swing?.angle<-.3 && Rig.castPose(player,game.time+.25)===null;
})`));

console.log('\n[13] 实战选卡间隔');
ok('经验爆量时只升一级，放弃后保留溢出经验，不连弹',run(`(()=>{
  startLevel(1); gainXp(1000); updateRunRewards();
  if(player.level!==2 || player.xp!==995 || game.state!=='levelup') return false;
  skipCard(); updateRunRewards();
  if(game.state!=='playing' || player.level!==2 || player.weapons.bolt.level!==1) return false;
  game.levelTime=9.99; updateRunRewards();
  if(game.state!=='playing' || player.level!==2) return false;
  game.levelTime=10; updateRunRewards();
  return game.state==='levelup' && player.level===3 && player.xp===983;
})()`));
ok('拾取宝箱和选卡共享间隔，满级仍可领取宝箱',run(`(()=>{
  startLevel(1); gainXp(player.xpNext); updateRunRewards();
  openChest(player.x,player.y); updateChests(0); skipCard(); updateRunRewards();
  if(game.state!=='playing'||game.chestQueue!==1) return false;
  game.levelTime=10; updateRunRewards();
  if(game.state!=='levelup'||game.cardMode!=='chest'||game.chestQueue!==0) return false;
  skipCard(); player.level=CFG.LEVEL.playerMax; openChest(player.x,player.y); updateChests(0);
  updateRunRewards();
  if(game.state!=='playing'||game.chestQueue!==1) return false;
  game.levelTime=20; updateRunRewards();
  return game.state==='levelup' && game.cardMode==='chest' && game.chestQueue===0;
})()`));
ok('即使经验无限，升级也分阶段发放且 Lv20 封顶',run(`(()=>{
  startLevel(1); gainXp(1e9);
  const reached={};
  for(let t=0;t<=450;t++){
    game.levelTime=t; const before=player.level;
    updateRunRewards();
    if(player.level!==before) reached[player.level]=t;
    if(game.state==='levelup') skipCard();
  }
  return reached[2]===0 && reached[5]===30 && reached[10]===110 &&
    reached[20]===350 && player.level===20 && player.xp===0;
})()`));
ok('同一时间升等级不增加目标怪量，时间推进才增加',run(`(()=>{
  startLevel(1); const base=spawnTarget(); player.level=15;
  if(spawnTarget()!==base) return false;
  game.levelTime=CFG.SPAWN.targetInterval;
  return spawnTarget()===base+CFG.SPAWN.targetGain;
})()`));


ok('查看战场时保持同一组强化，屏蔽快捷键选择和放弃',run(`(()=>{
  startLevel(1); gainXp(player.xpNext); updateRunRewards();
  const draft=game.cards;
  toggleRewardPeek(); chooseCard(1); skipCard();
  if(!rewardPeeking || game.state!=='levelup' || game.cards!==draft ||
    player.weapons.orbit || player.level!==2) return false;
  toggleRewardPeek(); chooseCard(1);
  return !rewardPeeking && game.state==='playing' && player.weapons.orbit.level===1;
})()`));

console.log('\n[14] 扩展玩法及资源接入');
ok('12 把武器和 15 个被动共用完整图标集',run(`Object.keys(WEAPONS).length===12 && Object.keys(PASSIVES).length===15`) &&
  run(`[...Object.keys(WEAPONS),...Object.keys(PASSIVES)].map(key=>'assets/icons/'+key+'.svg')`).every(path=>fs.existsSync(path)));
const authoredMotion=JSON.parse(fs.readFileSync('assets/vfx/motion.json','utf8'));
ok('23 张运行时图集与源文件时间表一致',Object.keys(authoredMotion).length===23 &&
  Object.entries(authoredMotion).every(([key,m])=>fs.existsSync(m.atlas) &&
    run(`String(VFX_CLIPS['${key}'])`)===String([m.anticipation_ms,m.release_ms,m.dissipation_ms])));
ok('早期卡池只开放当前幕，保底有未装备武器且无重复',run(`(()=>{
  startLevel(1);
  for(let i=0;i<24;i++){
    buildCards(false);
    const ids=game.cards.map(c=>c.id);
    if(new Set(ids).size!==ids.length || ids.some(id=>(WEAPONS[id]||PASSIVES[id]).act>1) ||
       !game.cards.some(c=>c.kind==='weapon'&&!player.weapons[c.id])) return false;
  }
  return true;
})()`));
ok('卡位满时只给已装备强化，宝箱不会给予新武器',run(`(()=>{
  startLevel(20);
  for(const id of ['orbit','wave','sprite']) addWeapon(id);
  for(const id of Object.keys(PASSIVES).slice(0,6)) addPassive(id);
  buildCards(false);
  if(!game.cards.every(c=>c.kind==='weapon'?player.weapons[c.id]:player.passives[c.id])) return false;
  buildCards(true);
  return game.cards.length===3 && game.cards.every(c=>player.weapons[c.id]);
})()`));
ok('卡池耗尽跳过空宝箱或空升级',run(`(()=>{
  startLevel(20);
  for(const id of ['orbit','wave','sprite']) addWeapon(id);
  for(const w of Object.values(player.weapons)) w.level=5;
  for(const key of Object.keys(PASSIVES).slice(0,6)) player.passives[key]=PASSIVES[key].max;
  game.chestQueue=2;
  gainXp(player.xpNext); updateRunRewards();
  return game.state==='playing' && player.level===2 && game.chestQueue===0;
})()`));
ok('星潮范围命中，星链跳跃，光棱只命中前方',run(`['wave','chain','beam'].every(id=>{
  startLevel(20); addWeapon(id);
  const a=spawnEnemy('ice',60,0), b=spawnEnemy('ice',120,0), behind=spawnEnemy('ice',-90,0);
  player.weapons[id].timer=0; updateExpansionWeapon(player.weapons[id],CFG.STEP);
  return a.hp<a.maxHp && b.hp<b.maxHp && (id!=='beam'||behind.hp===behind.maxHp) &&
    game.fx.some(f=>f.key===id);
})`));
ok('星刃同一个目标去返各伤一次',run(`(()=>{
  startLevel(20); addWeapon('boomer');
  const target=spawnEnemy('ice',117,0);
  player.weapons.boomer.timer=0; updateExpansionWeapon(player.weapons.boomer,CFG.STEP);
  for(let i=0;i<120;i++) updateExpansionEntities(CFG.STEP);
  return Math.abs(target.maxHp-target.hp-2*13*.4)<1e-8 && game.blades.length===0;
})()`));
ok('星尘雷有布雷时间，星钟和星灵共用强化效果',run(`(()=>{
  startLevel(20); for(const id of ['mine','chrono','sprite']) addWeapon(id);
  addPassive('area'); addPassive('duration'); addPassive('multishot');
  const enemy=spawnEnemy('ice',18,0);
  for(const id of ['mine','chrono','sprite']){
    player.weapons[id].timer=0; updateExpansionWeapon(player.weapons[id],CFG.STEP);
  }
  const afterClock=enemy.hp;
  updateExpansionEntities(CFG.STEP);
  if(game.mines.length!==1 || enemy.hp!==afterClock || game.bullets.length!==2 ||
    Math.abs(game.timeFields[0].r-130*1.12)>1e-8 || game.timeFields[0].max!==2.5*1.15) return false;
  game.time=.31; updateExpansionEntities(CFG.STEP);
  return game.mines.length===0 && enemy.hp<afterClock;
})()`));
ok('慧心保留小数经验，星愿每局只能复活一次', run(`(()=>{
  startLevel(20); addPassive('xp'); addPassive('revive'); gainXp(1);
  if(player.xp!==1.15) return false;
  hurtPlayer(1000);
  if(!player.revived || player.invuln!==2 || player.hp!==player.maxHp*.5) return false;
  player.invuln=0; hurtPlayer(1000);
  return game.state==='gameover';
})()`));
ok('六种新怪逐关加入，两个精英各有精灵和独立首登关',run(`(()=>{
  if(!EXTRA_ENEMIES.every(([level,key])=>!levelRoster(level-1).pool.includes(key) &&
    levelRoster(level).pool.includes(key) && SPRITE_SRC[key])) return false;
  return [[13,'millefeuille'],[18,'frost-emperor']].every(([level,key])=>{
    startLevel(level); spawnEncounterElite(); return game.enemies[0]?.type===key && SPRITE_SRC[key];
  });
})()`));
ok('糖粒成群补充仍受总额约束，冻皇幼体不掉宝箱或再次分裂',run(`(()=>{
  startLevel(18); spawnCrowdEnemy('swarm',3);
  if(game.enemies.length!==3) return false;
  const elite=spawnEnemy('frost-emperor',0,0); killEnemy(elite);
  const children=game.enemies.filter(e=>e.isChild);
  children.forEach(killEnemy);
  return children.length===4 && game.chests.length===1 && game.enemies.length===8;
})()`));
ok('泡泡预警后发射，云绵治疗，镜影瞬移留缓冲，麦芽糖浆先预警',run(`(()=>{
  startLevel(16);
  const enemies=['bubble','cloud','mirror','goo'].map(key=>spawnEnemy(key,60,0));
  for(const enemy of enemies){ enemy.behaviorAt=1; enemy.hp=1; }
  game.time=1;
  for(const enemy of enemies) updateSpecialEnemy(enemy,60);
  if(game.ebullets.length || game.hazards[0].activeAt!==1.3 || enemies[2].x!==60) return false;
  game.time=1.49;
  for(const enemy of enemies) updateSpecialEnemy(enemy,60);
  return game.ebullets[0]?.kind==='bubble-shot' && enemies[0].hp===5 &&
    enemies[2].x===-80 && enemies[2].contactAt>game.time;
})()`));
ok('千层只增速一次，星钟领域中减速 40%',run(`(()=>{
  startLevel(18);
  const target=spawnEnemy('spore',100,0); target.speed=60;
  spawnEnemy('millefeuille',100,20); spawnEnemy('millefeuille',100,-20);
  game.timeFields.push({x:100,y:0,r:50,life:2,max:2});
  updateEnemies(.1);
  return Math.abs(target.x-(100-60*.6*1.3*.1))<1e-8;
})()`));
ok('黑森林第三阶段单束、狂暴双束共用伤害标记',run(`(()=>{
  startLevel(20); spawnBoss(); const boss=game.boss;
  boss.x=-100; boss.y=0; boss.hp=boss.maxHp*.30; boss.atk=0; updateEnemies(.01);
  if(boss.phaseStage!==3 || game.fx.filter(f=>f.type==='laserWarn').length!==1) return false;
  game.fx=[]; boss.hp=boss.maxHp*.24; boss.atk=0; updateEnemies(.01);
  const lasers=game.fx.filter(f=>f.type==='laserWarn');
  return boss.phaseStage===4 && lasers.length===2 && lasers[0].attack===lasers[1].attack &&
    lasers[0].color!==lasers[1].color;
})()`));

ok('星澜按移动、施法、受击、升级和通关切换独立原画',run(`(()=>{
  startLevel(1);
  player.walk=0; player.moveAmount=.3;
  if(playerArtFrame(1,0)!=='step') return false;
  player.moveAmount=1;
  if(playerArtFrame(1,0)!=='run') return false;
  Rig.startCast(player,1,0);
  if(playerArtFrame(1,0)!=='ready' || playerArtFrame(1.1,0)!=='cast') return false;
  hurtPlayer(1);
  if(playerArtFrame(game.time,0)!=='recoil') return false;
  game.state='levelup'; game.cardMode='level'; player.promotedAt=100;
  if(playerArtFrame(1,420)!=='cheer' || playerArtFrame(1,1500)!=='player') return false;
  game.state='clear'; player.wonAt=100;
  return playerArtFrame(1,1500)==='cheer';
})()`));

console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail?1:0);
