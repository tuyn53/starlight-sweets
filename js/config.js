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
  // target = 目标存活数，随玩家等级线性抬升；每秒最多补 refill 只，避免后期刷屏
  SPAWN: { targetBase: 13, targetPerLv: 3, targetCap: 70, refillPerSec: 6 },
  XP_BASE: 5, XP_GROW: 1.18,   // 关内经验曲线（单局击杀量增大后调陡）

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

  // === 关卡系统（每关 = 一次完整的 Lv1→Lv20 单局）===
  LEVEL: {
    total: 20,
    perAct: 5,            // 每 5 关一幕、每 5 关一个主题 Boss
    bossEvery: 5,         // 第 5/10/15/20 关是主题 Boss 关
    playerMax: 20,        // 关内等级上限；满级触发关底战
    diffStep: 0.032,      // 关卡差异随本局构筑成形逐步开放
    diffLv: 0.026,        // 普通敌人血量随本局等级逐步提升
    // 主题 Boss 和守卫使用独立血量曲线
    bossHpBase: 4800, bossHpStep: 330,
    guardHpBase: 2400, guardHpStep: 220,
    bossSequence: 3.0,    // 满级→清场演出→Boss 降临的时长（秒）
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

// === 逐关怪池表（关卡循环用，语义 = "本关可用怪池"，非"本关刷几只"）===
// 当前用现有 6 种普通怪实现递进；内容扩展阶段在对应关的 pool 里插入新怪 key 即可，
// 新怪：糖粒swarm(6)/麦芽goo(7)/泡泡bubble(11)/云绵cloud(12)/镜影mirror(16)/雪宝ice(17)，
//       精英变体千层(13)/冻皇(18) 走 elite 换机制。
// density：维持数量模型的目标数系数（Boss 关小怪减半 0.6；回忆关峰值 1.2）。
const UNLOCK_TABLE = [
  { pool:['spore','swift','split'],                          density:1.0 }, // L1 教学 3 种
  { pool:['spore','swift','split','thief'],                  density:1.0 }, // L2 +焦糖
  { pool:['spore','swift','split','thief','mimic'],          density:1.0 }, // L3 +果冻
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L4 +爆米
  { pool:['spore','swift','split','thief','mimic','bomber'], density:0.6 }, // L5 莓莓
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L6 (+糖粒)
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L7 (+麦芽)
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L8 +精英常驻
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.2 }, // L9 峰值
  { pool:['spore','swift','split','thief','mimic','bomber'], density:0.6 }, // L10 抹茶
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L11 (+泡泡)
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L12 (+云绵)
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L13 精英千层
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.2 }, // L14 峰值
  { pool:['spore','swift','split','thief','mimic','bomber'], density:0.6 }, // L15 云朵
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L16 (+镜影)
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L17 (+雪宝)
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.0 }, // L18 精英冻皇
  { pool:['spore','swift','split','thief','mimic','bomber'], density:1.2 }, // L19 峰值
  { pool:['spore','swift','split','thief','mimic','bomber'], density:0.6 }, // L20 黑森林
];

// === 工具函数：由关卡号推导场景/主题 Boss/关底守卫 ===
function actOf(level){ return CFG.ACTS[clamp(Math.floor((level-1)/CFG.LEVEL.perAct),0,CFG.ACTS.length-1)]; }
function bossInfo(level){ return CFG.BOSSES[level] || CFG.BOSSES[20]; }
function isBossLevel(level){ return level % CFG.LEVEL.bossEvery === 0; }
function guardInfo(level){
  const theme=CFG.BOSSES[(CFG.ACTS.indexOf(actOf(level))+1)*CFG.LEVEL.bossEvery];
  return {name:theme.name, title:'关底守卫', color:theme.color, sprite:'guard', guard:true};
}
function levelRoster(level){ return UNLOCK_TABLE[clamp(level-1,0,UNLOCK_TABLE.length-1)]; }

// 同一套图形用于强化牌与武器栏。轮廓区分技能，糖果色只作辅助。
const ITEM_GLYPHS = {
  bolt:['#75c2f3','#314a8c',`<path d="m4 36 15-13 7 8L9 40Z" fill="#49a8ee"/><path d="m24 7 4 10 11-2-6 9 6 9-11-2-4 10-4-10-11 2 6-9-6-9 11 2Z"/><path d="m24 13 3 9 8 2-8 3-3 8-3-8-9-3 9-2Z" fill="#fff5d4" stroke="none"/><path d="m34 7 2 4m5-3-2 4" fill="none" stroke="#537ac0"/>`],
  orbit:['#c6a2f5','#563d97',`<path d="M8 28c2-10 20-22 31-17 6 3-1 14-13 21-14 8-23 4-18-4Z" fill="none" stroke="#9262d7" stroke-width="3"/><path d="m24 10 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/><path d="m24 17 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff8df" stroke="none"/><circle cx="10" cy="34" r="5.5" fill="#80d6f4"/><circle cx="37" cy="13" r="5.2" fill="#f59dcd"/><circle cx="8.7" cy="32.5" r="1.6" fill="#fff5df" stroke="none"/>`],
  aura:['#8ed7b3','#386658',`<path d="M24 5c5 5 10 6 16 7v11c0 9-7 15-16 20-9-5-16-11-16-20V12c6-1 11-2 16-7Z"/><path d="M13 16c4-1 8-3 11-5v25c-7-4-11-8-11-14Z" fill="#c5f5d9" stroke="none"/><path d="m24 14 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#ffedbb"/>`],
  lightning:['#ffc068','#87532d',`<path d="M7 37c2-9 5-15 11-20-1 5 0 7 2 8 3-9 9-12 21-16-4 10-6 19-15 24 3 0 4 0 6-1-6 8-15 11-25 5Z" fill="#ee8963"/><path d="m15 34 5-11 11-7 2 9-8 10Z"/><path d="m20 31 5-7 5-3-2 7-4 4Z" fill="#fff1bf" stroke="none"/><path d="m8 16 4-4m8 1 2-5m16 27 4-4" fill="none" stroke="#c77b41"/>`],
  nova:['#f28fbe','#893b6b',`<path d="m24 4 4 11 10-5-3 11 10 3-10 5 3 10-10-5-4 10-5-10-10 5 3-10-9-5 9-3-3-11 10 5Z"/><circle cx="24" cy="24" r="10" fill="#fcc1d6"/><path d="m24 14 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#fff0bb"/><path d="M39 6v6m-3-3h6M9 37v6m-3-3h6" stroke="#fff3d1"/>`],
  damage:['#f5a08e','#873f56',`<path d="m15 38-5-5 16-18 4 4Z"/><path d="m21 28 8-20 11-4-1 12-14 16Z" fill="#ffca94"/><path d="m27 25 9-15-4 12-6 8Z" fill="#fff5cb" stroke="none"/><path d="m12 25 12 13-4 4-12-13Z" fill="#e984ad"/>`],
  firerate:['#c2a4f2','#563c91',`<path d="M8 11 20 24 8 37h9l12-13-12-13Z"/><path d="m23 11 12 13-12 13h9l12-13-12-13Z" fill="#9e7bdb"/><path d="m11 14 8 7m7-7 8 7" fill="none" stroke="#fff2dc"/>`],
  speed:['#a6dff1','#375c88',`<path d="M6 33c10-1 15-7 18-18L40 7c0 11-6 22-14 27-7 5-13 4-20-1Z"/><path d="M12 33c8-2 16-7 24-20-2 9-8 16-15 19Z" fill="#fff9e2" stroke="none"/><path d="M6 13h12M4 20h10m20 16h8" fill="none" stroke="#4d89bd"/>`],
  maxhp:['#f598ba','#8d4568',`<path d="M24 40C13 33 6 27 6 18 6 8 18 5 24 14c6-9 18-6 18 4 0 9-7 15-18 22Z"/><path d="M12 17c0-4 5-6 8-3" fill="none" stroke="#fff5dc" stroke-width="3"/><path d="M22 20h4v5h5v4h-5v5h-4v-5h-5v-4h5Z" fill="#fff3d1" stroke="none"/>`],
  pickup:['#f1a285','#88564a',`<path d="M8 8h10v18a6 6 0 0 0 12 0V8h10v18a16 16 0 0 1-32 0Z"/><path d="M8 8h10v9H8Zm22 0h10v9H30Z" fill="#b8d5f5"/><path d="m24 5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff0b6"/>`],
  armor:['#add8f6','#455881',`<path d="M24 5 40 12v11c0 8-7 16-16 20C15 39 8 31 8 23V12Z"/><path d="m24 11 11 5v7c0 6-4 11-11 15-7-4-11-9-11-15v-7Z" fill="#d8edff"/><path d="m17 24 5 5 9-10" fill="none" stroke="#507eb4" stroke-width="3.5"/>`],
  cooldown:['#ffd499','#8e5740',`<path d="M13 9h22c-1 8-5 11-11 15 6 4 10 7 11 15H13c1-8 5-11 11-15-6-4-10-7-11-15Z" fill="#bce1f0"/><path d="m17 34 7-5 7 5 1 3H16Z"/><path d="M11 6h26v5H11Zm0 31h26v5H11Z"/><path d="m20 17 4 4 4-4" fill="none" stroke="#f9aa65"/>`],
  crit:['#97d9a2','#3b6d57',`<path d="M23 23C9 23 7 8 16 8c5 0 7 3 8 7 1-4 3-7 8-7 9 0 7 15-6 15 13-2 17 10 9 13-5 2-9-1-11-7-2 6-6 9-11 7-8-3-4-15 10-13Z"/><path d="M24 27c1 6 0 10-5 15" fill="none" stroke-width="2.5"/><path d="m24 16 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff1bc" stroke="none"/>`],
  regen:['#92dac2','#3b7169',`<path d="M24 4C15 16 9 22 9 29a15 15 0 0 0 30 0c0-7-6-13-15-25Z"/><path d="M14 29c0-5 2-8 5-12" fill="none" stroke="#fff1db" stroke-width="3"/><path d="M22 20h4v6h6v4h-6v6h-4v-6h-6v-4h6Z" fill="#fff3c6" stroke="none"/>`],
};
function itemIcon(id){
  const [color,outline,shape]=ITEM_GLYPHS[id];
  return `<svg class="item-glyph" viewBox="0 0 48 48" aria-hidden="true" fill="${color}" stroke="${outline}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
}
