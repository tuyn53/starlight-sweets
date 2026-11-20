/* ================================================================
 * 甜星大作战 SWEET STAR BLITZ — 关卡制 Q 版可爱幸存者 H5
 * 结构：CONFIG → 关卡/场景数据 → 数据表 → 世界 → 系统 → 渲染 → 主循环
 * 风格：明亮糖果色 / Q版卡通 / 魔法少女星光
 * ================================================================ */

// === CONFIG === 可调参数集中区（改这里就能调玩法）
const CFG = {
  STEP: 1 / 60,          // 物理固定步长
  MAX_ENEMIES: 120,      // 敌人上限（维持屏幕数量模型 + 移动端性能保护）
  MAX_PARTICLES: 280,
  BASE: {
    hp: 100, speed: 195, pickup: 62, armor: 0,
    damage: 1, fireRate: 1, cooldown: 1, crit: 0, regen: 0,
  },
  // 刷怪：维持屏幕数量模型（替代旧的"间隔指数收紧"）
  // 目标存活数按战斗时间增长，升级不会立刻增加可刷经验的怪物量。
  SPAWN: { targetBase: 16, targetGain: 3, targetInterval: 18, targetCap: 70, refillPerSec: 6 },
  MAX_WEAPONS: 4, MAX_PASSIVES: 6,
  PROGRESSION: {
    // Lv1→2 到 Lv19→20；首抽保留原门槛，后段靠连续作战攒经验。
    xpCosts: [5,12,18,25,34,44,55,66,78,90,102,114,126,138,150,162,174,186,198],
    // 键为当前等级下限；数字为两次升级至少相隔的实战秒数。
    levelGaps: [[2,10],[5,16],[10,24]],
    rewardGap: 10,        // 宝箱和升级都不能紧接着再次打断战斗
  },

  // === 自动攻击：射程门控 + 分层优先级 ===
  // range：武器射程（像素半径）。敌人进入射程才会被自动锁定攻击，出场瞬间不会隔屏开火。
  // tier ：同射程内的目标优先级（数值越大越优先），同层按距离由近到远。
  //        5=最终Boss  4=小Boss  3=精英怪  2=普通怪  1=可破坏资源物
  //        资源物排在普通怪之后：它不会伤人，优先清掉正在咬你的怪更安全。
  //        若想让资源优先，把 res 改成 2.5 即可（一行配置，不用改逻辑）。
  // stick：同层目标的锁定保持时长（秒），避免两个同级目标间来回摇摆。
  AIM: {
    range: { bolt: 330, lightning: 420 },
    tier: { finalBoss: 5, miniBoss: 4, elite: 3, mob: 2, res: 1 },
    stick: 0.45,
  },
  // 随机刷新的可破坏资源物（星星水晶）：打碎掉经验 + 少量回血
  PROP: { interval: 11, hp: 42, r: 13, healPct: 4, gems: 2 },

  // === 关卡系统（每关重新从 Lv1 起步）===
  LEVEL: {
    total: 20,
    perAct: 5,            // 每 5 关一幕、每 5 关一个主题 Boss
    bossEvery: 5,         // 第 5/10/15/20 关是主题 Boss 关
    playerMax: 20,        // 关内等级上限，与关底出场独立
    diffStep: 0.032,      // 关卡差异随本局构筑成形逐步开放
    diffLv: 0.026,        // 普通敌人血量随本局等级逐步提升
    // 主题 Boss 和守卫使用独立血量曲线
    bossHpBase: 4800, bossHpStep: 330,
    guardHpBase: 2400, guardHpStep: 220,
    bossAt: 395,          // 实战 6:35 进入关底演出（不含暂停或选卡）
    bossSequence: 3.0,    // 清场演出→Boss 降临的时长（秒）
  },

  // === 4 幕场景（1-5 / 6-10 / 11-15 / 16-20）===
  ACTS: [
    { key:'meadow', name:'阳光草地', icon:'🌼', from:1,  to:5,
      skyTop:'#bdeaff', skyBot:'#eafbff', ground:'#d3ebae', groundAlt:'#abd9aa',
      line:'rgba(255,255,255,.5)', deco:'flower', decoColor:'#fff6a8', dot:'#ffffff' },
    { key:'forest', name:'糖果森林', icon:'🍄', from:6,  to:10,
      skyTop:'#ffe0f2', skyBot:'#fff5e8', ground:'#f3e5d9', groundAlt:'#e8d6dc',
      line:'rgba(255,255,255,.55)', deco:'tree', decoColor:'#ff9ec4', dot:'#fff0f6' },
    { key:'sky',    name:'云端天空', icon:'☁️', from:11, to:15,
      skyTop:'#d6ecff', skyBot:'#f6ebff', ground:'#e9f2ff', groundAlt:'#dbe9ff',
      line:'rgba(255,255,255,.7)', deco:'cloud', decoColor:'#ffffff', dot:'#ffe9a8' },
    { key:'castle', name:'星光城堡', icon:'🏰', from:16, to:20,
      skyTop:'#e7dfff', skyBot:'#ffe9f4', ground:'#e2d8f7', groundAlt:'#d5c8ef',
      line:'rgba(255,255,255,.55)', deco:'star', decoColor:'#fff0a0', dot:'#ffffff' },
  ],

  // === 每 5 关主题 Boss ===
  BOSSES: {
    5:  { name:'莓莓',   title:'草莓大福',   color:'#ff85a8', sprite:'boss' },
    10: { name:'抹茶',   title:'抹茶慕斯',   color:'#8fd07a', sprite:'matcha' },
    15: { name:'云朵',   title:'云朵舒芙蕾', color:'#8fc6ff', sprite:'souffle' },
    20: { name:'黑森林', title:'黑森林女皇', color:'#b57bd8', sprite:'forestQueen' },
  },

  // 棉棉平衡：开局保护期 + 糖霜云收敛
  SPORE: {
    safeTime: 20,
    hazardR: 40, hazardLife: 3.5, hazardDmg: 2, hazardTick: 0.7, hazardMax: 4,
  },

  COLORS: {
    bg:'#eafbff', grid:'rgba(255,255,255,0.5)', player:'#54dcff',
    gem:'#5ad6ff', elite:'#ffcf5a', boss:'#ff85a8', flash:'#ffd3e6',
  },

  // === 视觉系统：Q版可爱描边/三段明度/左上光 ===
  ART: {
    outline:'#4a3d63', hi:'#ffffff',
    friend:{main:'#54dcff', dark:'#1f88b8', light:'#dcf9ff'},
    xp:    {main:'#4fd2ff', dark:'#1a7bb0', light:'#e6faff'},
    slime: {main:'#8fe3a8', dark:'#3d9a63', light:'#e3ffe9'},
    bat:   {main:'#c79bff', dark:'#7a4fc0', light:'#f0e4ff'},
    pink:  {main:'#ffb2d5', dark:'#d5629a', light:'#ffe6f3'},
    cyan:  {main:'#7fe8e8', dark:'#2fa5a8', light:'#e2ffff'},
    orange:{main:'#ffc174', dark:'#c97926', light:'#fff0d8'},
    red:   {main:'#ff9ba6', dark:'#cf5266', light:'#ffe3e7'},
    elite: {main:'#ffd97a', dark:'#c9962e', light:'#fff7d6'},
    boss:  {main:'#ff85a8', dark:'#b83f68', light:'#ffdbe7'},
    hazard:{main:'#ffc7e0', dark:'#d97ba8', light:'#fff0f7'}, // 糖霜云=粉
  },

  // === 手感参数（保留分级反馈与可访问性）===
  FEEL: {
    traumaDecay: 1.7, shakeMax: 9, shakeRoll: 0.02,
    hitCap: 0.28, hitGap: 0.10,
    hitStop: { small:0, medium:0.045, large:0.10 },
    startShake: 1.0, startFlash: 1.0,
  },
};

// === 数据表：武器 & 被动（星光系 / 去暗黑）===
const WEAPONS = {
  bolt:{ name:'星芒', icon:'✨', max:5, cd:0.95,
    desc:l=>`拉开距离，发射 ${1+Math.floor(l/2)} 枚穿透星弹。` },
  orbit:{ name:'星环', icon:'💫', max:5, cd:0,
    desc:l=>`贴近怪群边缘，让 ${2+l} 颗环绕星星持续命中。` },
  aura:{ name:'星辉结界', icon:'🌈', max:5, cd:0,
    desc:l=>`身边形成半径 ${70+l*13} 的闪耀结界，周期净化敌人。` },
  lightning:{ name:'流星', icon:'🌟', max:5, cd:1.7,
    desc:l=>`召唤 ${1+Math.floor(l/2)} 颗流星砸向敌人，可暴击。` },
  nova:{ name:'星爆', icon:'🎆', max:5, cd:3.2,
    desc:l=>`等怪群靠拢，周期性引爆周围 ${180+l*26} 范围。` },
  wave:{ name:'星潮', max:5, cd:3.5, act:1, desc:l=>`冲击波推开周围敌人，造成 ${12+4*l} 点伤害。` },
  boomer:{ name:'星刃', max:5, cd:1.3, act:2, desc:l=>`回旋星刃飞出并折返，去返各可造成 ${10+3*l} 点伤害。` },
  chain:{ name:'星链', max:5, cd:1.9, act:2, desc:l=>`电弧在敌人间跳跃，最多命中 ${3+Math.floor(l/2)} 个目标。` },
  beam:{ name:'光棱', max:5, cd:2.8, act:3, desc:l=>`贯穿一条直线，造成 ${14+5*l} 点伤害。` },
  mine:{ name:'星尘雷', max:5, cd:2.4, act:3, desc:l=>`脚下布雷，踩中时爆炸造成 ${18+6*l} 点伤害。` },
  sprite:{ name:'星灵', max:5, cd:.8, act:4, desc:l=>`${1+Math.floor(l/2)} 只随行星灵会自动向附近敌人发射星弹。` },
  chrono:{ name:'星钟', max:5, cd:6, act:4, desc:l=>`展开半径 ${120+10*l} 的时钟领域，范围内敌人减速 40%。` },
};
const PASSIVES = {
  damage:{ name:'勇气', icon:'💪', max:5, desc:'全部伤害 +18%' },
  firerate:{ name:'迅捷', icon:'⏩', max:5, desc:'攻击频率 +14%' },
  speed:{ name:'轻快', icon:'🌀', max:5, desc:'移动速度 +10%' },
  maxhp:{ name:'活力', icon:'💗', max:5, desc:'最大生命 +25 并立即回复' },
  pickup:{ name:'引力', icon:'🧲', max:5, desc:'拾取范围 +28%' },
  armor:{ name:'护盾', icon:'🛡️', max:5, desc:'受到的伤害 -1（可叠加）' },
  cooldown:{ name:'专注', icon:'⏳', max:5, desc:'技能冷却 -8%' },
  crit:{ name:'幸运', icon:'🍀', max:5, desc:'暴击率 +6%（暴击 2 倍伤害）' },
  regen:{ name:'治愈', icon:'✚', max:5, desc:'每秒回复 0.6 生命' },
  multishot:{ name:'幻影', max:2, act:3, desc:'星芒、流星、星刃和星灵的投射物 +1' },
  area:{ name:'星域', max:5, act:3, desc:'技能半径与宽度 +12%' },
  duration:{ name:'恒辉', max:5, act:4, desc:'减速领域及星尘雷等持续时间 +15%' },
  critdmg:{ name:'星怒', max:5, act:2, desc:'暴击倍率 +0.25' },
  xp:{ name:'慧心', max:5, act:2, desc:'拾取经验 +15%' },
  revive:{ name:'星愿', max:1, act:4, desc:'每关复活一次，回复 50% 生命并无敌 2 秒' },
};

// === 敌人类型：甜系 Q 版敌人，每位一个独特机制「动词」 ===
// 内部 type key 保持不变（spore/swift/... 驱动机制与精灵图），只改显示名与配色语义
const ETYPE = {
  spore:{ name:'棉棉', r:14, hp:18, speed:52, dmg:8, xp:1, color:'#8fe3a8', pal:'slime', mech:'poison', tier:0 },
  swift:{ name:'跳跳', r:12, hp:11, speed:112, dmg:6, xp:1, color:'#c79bff', pal:'bat', mech:'dash', tier:0 },
  split:{ name:'团子', r:15, hp:22, speed:50, dmg:7, xp:1, color:'#ffb2d5', pal:'pink', mech:'split', tier:0 },
  mimic:{ name:'果冻', r:13, hp:26, speed:64, dmg:8, xp:2, color:'#7fe8e8', pal:'cyan', mech:'stealth', tier:0 },
  thief:{ name:'焦糖', r:13, hp:18, speed:86, dmg:6, xp:1, color:'#ffc174', pal:'orange', mech:'steal', tier:0 },
  bomber:{ name:'爆米', r:14, hp:16, speed:68, dmg:0, xp:2, color:'#ff9ba6', pal:'red', mech:'explode', tier:0 },
  elite:{ name:'泡芙', r:26, hp:280, speed:44, dmg:18, xp:8, color:'#ffd97a', pal:'elite', mech:'summon', tier:2 },
  boss:{ name:'莓莓', r:52, hp:1800, speed:38, dmg:26, xp:0, color:'#ff85a8', pal:'boss', mech:'phase', tier:3 },
  swarm:{ name:'糖粒', r:8, hp:8, speed:135, dmg:4, xp:1, color:'#ffb2d5', pal:'pink', mech:'swarm' },
  goo:{ name:'麦芽', r:14, hp:24, speed:58, dmg:6, xp:1, color:'#ffc174', pal:'orange', mech:'goo' },
  bubble:{ name:'泡泡', r:13, hp:20, speed:48, dmg:5, xp:2, color:'#7fe8e8', pal:'cyan', mech:'shot' },
  cloud:{ name:'云绵', r:14, hp:30, speed:55, dmg:5, xp:3, color:'#ffb2d5', pal:'pink', mech:'heal' },
  mirror:{ name:'镜影', r:15, hp:26, speed:70, dmg:9, xp:2, color:'#b27bff', pal:'bat', mech:'blink' },
  ice:{ name:'雪宝', r:16, hp:70, speed:36, dmg:8, xp:3, color:'#aee7ff', pal:'cyan', mech:'shield' },
  millefeuille:{ name:'千层', r:26, hp:280, speed:44, dmg:18, xp:8, color:'#ffd97a', pal:'elite', mech:'buff', tier:2 },
  'frost-emperor':{ name:'冻皇', r:27, hp:320, speed:42, dmg:19, xp:8, color:'#7fe8e8', pal:'cyan', mech:'frostSplit', tier:2 },
};
const NORMAL_TYPES = ['spore','swift','split','mimic','thief','bomber'];

// === 逐关怪池表（关卡循环用，语义 = "本关可用怪池"，非"本关刷几只"）===
// 普通怪入池后续关保留；精英用单独的同屏和每局上限。
const EXTRA_ENEMIES = [[7,'swarm'],[8,'goo'],[11,'bubble'],[12,'cloud'],[16,'mirror'],[17,'ice']];
const UNLOCK_TABLE = Array.from({length:CFG.LEVEL.total}, (_,i)=>{
  const level=i+1;
  return {
    pool:[...NORMAL_TYPES.slice(0,Math.min(i+3,NORMAL_TYPES.length)),
      ...EXTRA_ENEMIES.filter(([from])=>level>=from).map(([,key])=>key)],
    density:level % 5===0 ? .6 : [9,14,19].includes(level) ? 1.2 : 1,
  };
});

// === 工具函数：由关卡号推导场景/主题 Boss/关底守卫 ===
function actOf(level){ return CFG.ACTS[clamp(Math.floor((level-1)/CFG.LEVEL.perAct),0,CFG.ACTS.length-1)]; }
function bossInfo(level){ return CFG.BOSSES[level] || CFG.BOSSES[20]; }
function isBossLevel(level){ return level % CFG.LEVEL.bossEvery === 0; }
function guardInfo(level){
  const theme=CFG.BOSSES[(CFG.ACTS.indexOf(actOf(level))+1)*CFG.LEVEL.bossEvery];
  return {name:theme.name, title:'关底守卫', color:theme.color, sprite:'guard', guard:true};
}
function levelRoster(level){ return UNLOCK_TABLE[clamp(level-1,0,UNLOCK_TABLE.length-1)]; }

// 强化牌、武器栏和结算共用同一份图标。
function itemIcon(id){
  return `<img class="item-glyph" src="assets/icons/${id}.svg" alt="" width="30" height="30">`;
}
