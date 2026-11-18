/* ================================================================
 * 星光保卫战 Starlight Sweets — 关卡制 Q 版可爱幸存者 H5
 * 结构：CONFIG → 关卡/场景数据 → 数据表 → 世界 → 系统 → 渲染 → 主循环
 * 风格：明亮糖果色 / Q版卡通 / 魔法少女星光
 * ================================================================ */

// === CONFIG === 可调参数集中区（改这里就能调玩法）
const CFG = {
  STEP: 1 / 60,          // 物理固定步长
  MAX_ENEMIES: 220,      // 敌人上限（性能保护）
  MAX_PARTICLES: 280,
  USE_SLICE: true,       // 纸娃娃切片骨骼：用原 PNG 像素切出四肢旋转，画风不变但手脚能动
  USE_RIG: false,        // 备用：程序化简笔骨骼（已弃用，视觉降级；仅在无精灵图时回退）
  BASE: {
    hp: 100, speed: 195, pickup: 62, armor: 0,
    damage: 1, fireRate: 1, cooldown: 1, crit: 0, regen: 0,
  },
  SPAWN: { start: 0.85, min: 0.17, decay: 0.987 }, // 刷怪间隔（随关卡再收紧）
  XP_BASE: 5, XP_GROW: 1.15,   // 关内经验曲线

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

  // === 关卡系统 ===
  LEVEL: {
    total: 20,
    perAct: 5,            // 每 5 关一幕、每 5 关一个主题 Boss
    bossEvery: 5,         // 第 5/10/15/20 关是 Boss 关
    timeBase: 30, timeStep: 1.6,   // 普通关存活目标 = timeBase + level*timeStep 秒
    killBase: 18, killStep: 2,     // 普通关击杀目标 = killBase + level*killStep 只
    diffStep: 0.16,       // 每关敌人强度递增系数
    bossDelay: 2.2,       // Boss 关开场几秒后 Boss 降临
  },

  // === 4 幕场景（1-5 / 6-10 / 11-15 / 16-20）===
  ACTS: [
    { key:'meadow', name:'阳光草地', icon:'🌼', from:1,  to:5,
      skyTop:'#bdeaff', skyBot:'#eafbff', ground:'#b9e89a', groundAlt:'#a9dd8c',
      line:'rgba(255,255,255,.5)', deco:'flower', decoColor:'#fff6a8', dot:'#ffffff' },
    { key:'forest', name:'糖果森林', icon:'🍄', from:6,  to:10,
      skyTop:'#ffe0f2', skyBot:'#fff5e8', ground:'#c8efb6', groundAlt:'#b4e3a4',
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
    5:  { name:'莓莓',   title:'草莓大福',   color:'#ff85a8', hue:0 },
    10: { name:'抹茶',   title:'抹茶慕斯',   color:'#8fd07a', hue:110 },
    15: { name:'云朵',   title:'云朵舒芙蕾', color:'#8fc6ff', hue:-140 },
    20: { name:'黑森林', title:'黑森林女皇', color:'#b57bd8', hue:-70 },
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
    desc:l=>`向最近敌人发射 ${1+Math.floor(l/2)} 枚星光弹，伤害随等级提升。` },
  orbit:{ name:'星环', icon:'💫', max:5, cd:0,
    desc:l=>`${2+l} 颗小星星环绕你旋转，触碰敌人造成持续伤害。` },
  aura:{ name:'星辉结界', icon:'🌈', max:5, cd:0,
    desc:l=>`身边形成半径 ${70+l*13} 的闪耀结界，周期净化敌人。` },
  lightning:{ name:'流星', icon:'🌟', max:5, cd:1.7,
    desc:l=>`召唤 ${1+Math.floor(l/2)} 颗流星砸向敌人，可暴击。` },
  nova:{ name:'星爆', icon:'🎆', max:5, cd:3.2,
    desc:l=>`以自身为中心绽放星芒，${180+l*26} 范围群体伤害。` },
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
};

// === 敌人类型：8 位原创 Q 版甜系娘化怪，每位一个独特机制「动词」 ===
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
};
const NORMAL_TYPES = ['spore','swift','split','mimic','thief','bomber'];

// === 工具函数：由关卡号推导场景/主题 Boss ===
function actOf(level){ return CFG.ACTS[clamp(Math.floor((level-1)/CFG.LEVEL.perAct),0,CFG.ACTS.length-1)]; }
function bossInfo(level){ return CFG.BOSSES[level] || CFG.BOSSES[20]; }
function isBossLevel(level){ return level % CFG.LEVEL.bossEvery === 0; }
function levelTargets(level){
  const L=CFG.LEVEL;
  return { time: L.timeBase + level*L.timeStep, kills: L.killBase + level*L.killStep };
}
