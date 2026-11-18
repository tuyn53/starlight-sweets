const fs=require('fs'),vm=require('vm');
// 用法：在项目根目录执行  node scripts/smoke_test.js
// 说明：拼接 js/ 核心脚本到 vm 沙箱，用最小 DOM 桩跑关卡/机制/选敌/渲染回归。
const files=['js/config.js','js/core.js','js/rig.js','js/sprites.js','js/slicerig.js','js/logic.js','js/render.js'];
let code=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');

// --- DOM / browser stubs ---
const store={};
function mkEl(){return {
  style:{}, _cls:'', classList:{add(){},remove(){},contains(){return false},toggle(){return true}},
  textContent:'', innerHTML:'',
  appendChild(){}, addEventListener(){},
  setAttribute(){}, getContext(){return ctx2d},
  get style(){return this._style||(this._style={})},
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
ok('初始已解锁=1', run('game.unlocked')===1);
ok('第5关是Boss关', run('isBossLevel(5)')===true);
ok('第6关不是Boss关', run('isBossLevel(6)')===false);
ok('第1关场景=阳光草地', run("actOf(1).name")==='阳光草地');
ok('第7关场景=糖果森林', run("actOf(7).name")==='糖果森林');
ok('第13关场景=云端天空', run("actOf(13).name")==='云端天空');
ok('第18关场景=星光城堡', run("actOf(18).name")==='星光城堡');
ok('第20关Boss=黑森林', run("bossInfo(20).name")==='黑森林');

console.log('\n[2] 关卡初始化');
run('startLevel(1)');
ok('状态=playing', run('game.state')==='playing');
ok('关卡=1', run('game.level')===1);
ok('初始1把星芒', run('Object.keys(player.weapons).length')===1 && run("!!player.weapons.bolt"));
ok('甜系命名:棉棉', run("ETYPE.spore.name")==='棉棉');
ok('甜系命名:爆米', run("ETYPE.bomber.name")==='爆米');
run('startLevel(10)');
ok('第10关有2把武器(星芒4级+星环)', run('Object.keys(player.weapons).length')===2 && run('player.weapons.bolt.level')===4);
ok('第10关起跑伤害>1', run('player.damage')>1);
ok('第10关是Boss关', run('isBossLevel(game.level)')===true);
ok('第10关Boss=抹茶', run('game.bossKind.name')==='抹茶');

console.log('\n[3] 普通关通关判定');
run('startLevel(2)');
// 直接把目标拉满
run('startLevel(2); game.levelTime=levelTargets(2).time+1; game.levelKills=levelTargets(2).kills+1;');
run('update(CFG.STEP)');
ok('双目标达成→clear', run('game.state')==='clear');
ok('解锁推进到3', run('game.unlocked')===3);
ok('进度已存localStorage', store['starlight_guard_progress']==='3');

console.log('\n[4] Boss关流程');
run('startLevel(5)');
ok('Boss未降临', run('game.bossSpawned')===false);
run('game.levelTime=CFG.LEVEL.bossDelay+0.1; update(CFG.STEP)');
ok('Boss已降临', run('game.bossSpawned')===true);
ok('Boss显示名=莓莓', run('game.boss.displayName')==='莓莓');
ok('Boss血量按关卡(900+5*180=1800)', run('game.boss.maxHp')===1800);
// 击杀Boss
run('killEnemy(game.boss)');
ok('击杀Boss→clear', run('game.state')==='clear');

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

console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail?1:0);
