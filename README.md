# 甜星大作战 · SWEET STAR BLITZ

一款 Q 版可爱风的类吸血鬼幸存者 H5 小游戏。原生 Canvas 2D + Web Audio，**零依赖、零构建**，用浏览器打开就能玩。

![no dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![no build](https://img.shields.io/badge/build-none-blue)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

<!-- TODO: 放游戏截图。建议 1280×800 存到 docs/screenshots/hero.png，再启用下面这行
![screenshot](docs/screenshots/hero.png)
-->

## 玩法

- **移动**：键盘 `WASD` / 方向键，或触屏虚拟摇杆
- **攻击**：全自动，专心走位和吃星星
- **升级**：拾取星光经验升级，首抽选择星芒、星环或星爆，后续三选一抽卡（键盘 `1` `2` `3` 或点击）
- **目标**：20 关逐关闯，每关从 Lv1 练到 Lv20 满级 → 击杀关底过关。4 幕场景（阳光草地 / 糖果森林 / 云端天空 / 星光城堡），5/10/15/20 是甜点主题 Boss（三阶段），其余关是两阶段关底守卫；第 1 关与第 20 关起手完全一致，关卡间不继承数值
- **设置**：左上角齿轮 → 音乐 / 音效 / 震屏强度 / 闪光强度（`Esc` 关闭）

进度存在浏览器 `localStorage`（key：`starlight_guard_progress`）。调试时在控制台执行：

```js
localStorage.setItem('starlight_guard_progress', '20') // 解锁全部 20 关
```

## 特性

- **20 关 + 4 幕场景**：草地 / 森林 / 天空 / 城堡，每幕有独立地块集，同幕关卡按关卡编号拼出不同布局；每关一次完整 Lv1→Lv20 单局，满级触发关底战
- **8 种原创甜系怪物**：每位一个独特机制（毒云、突进、分裂、隐身、偷经验、自爆、召唤、Boss 三阶段）
- **5 把星光武器 + 9 种被动**：各满 5 级，升级三选一，精英掉宝箱额外抽卡
- **新版角色动画**：13 张透明 WebP 角色图，沿用步态采样，按角色切片并驱动双腿或裙摆，步频随战斗移动距离变化
- **程序化音频**：Web Audio 现场合成音效与 8 小节循环 BGM，不依赖任何音频素材
- **手感系统**：trauma² 衰减震屏、分级 hit-stop、命中 squash & stretch、伤害数字弹出
- **可访问性**：震屏 / 闪光三档开关，`prefers-reduced-motion` 降级，触摸目标 ≥44px
- **移动端优先**：390×844 竖屏与 667×375 横屏均无裁切

## 快速开始

不需要 npm、不需要打包。因为用了 `Image` 预加载与多文件脚本，建议起一个静态服务器，而不是直接双击 `index.html`：

```bash
# 任选其一
python3 -m http.server 8080
py -m http.server 8080          # Windows
npx serve .                     # Node
```

然后打开 <http://localhost:8080>。

## 目录结构

```
.
├── index.html                 # DOM 结构：HUD / 首页 / 选关 / 升级卡 / 结算 / 转场
├── style.css                  # 加载、菜单、战斗 HUD、卡牌与弹窗样式
├── js/
│   ├── config.js              # ★ 所有数值与数据表：CFG / WEAPONS / PASSIVES / ETYPE / ACTS / BOSSES
│   ├── core.js                # 画布与 DPR、工具函数、Juice 震动、Sound 音效、Input 输入
│   ├── music.js               # 程序化 BGM：合成 + lookahead 调度
│   ├── rig.js                 # 动作状态机：只算关节角度，不画
│   ├── sprites.js             # 精灵预加载与绘制
│   ├── logic.js               # 游戏状态机、关卡流程、刷怪、伤害、怪物机制
│   ├── slicerig.js            # 新版角色的关节遮罩与走路切片缓存
│   ├── tilemap.js             # 四幕地块数据、按关卡拼图与区块缓存
│   ├── render.js              # 场景光照 / 特效 / 角色 / HUD
│   └── main.js                # 主循环、选关、首页、转场、事件绑定
├── assets/
│   ├── characters/            # 13 张 512² 透明 WebP 游戏精灵及旧版 PNG
│   │   └── _source/           # AI 生图原图，溯源用
│   ├── manifest.json          # 资产清单（来源 / 验收状态）
│   └── settings-gear.svg      # 设置齿轮图标
├── scripts/
│   ├── make_sprite.py         # 精灵归一化：去背 / 去水印 / 裁切 / 缩放（纯标准库）
│   ├── preview_scale.py       # 游戏实际尺寸验收
│   └── smoke_test.js          # 逻辑回归测试
├── docs/                      # 设计文档（见下方文档索引）
├── 部署说明.md                 # nginx 部署与踩坑
└── LICENSE
```

**脚本加载顺序不可调换**（classic script 共享全局作用域）：

```
config → core → music → rig → sprites → slicerig → logic → tilemap → render → main
```

## 开发与验证

```bash
# 1. 语法检查
for f in js/*.js; do node --check "$f" || exit 1; done

# 2. 逻辑回归
node scripts/smoke_test.js

# 3. 实机验收
python3 -m http.server 8080
```

推送到 GitHub 后，`.github/workflows/ci.yml` 会自动跑上面第 1、2 步。

### 调参入口

改平衡只需要动 `js/config.js`：

| 想改什么 | 改哪里 |
|---|---|
| 关卡数量、每幕关数、主题 Boss 间隔 | `CFG.LEVEL`（`total` / `perAct` / `bossEvery`） |
| 满级目标、关底血量、演出时长、敌人成长 | `CFG.LEVEL`（`playerMax` / `bossHp*` / `guardHp*` / `bossSequence` / `diff*`） |
| 刷怪密度（目标存活数 / 补怪速率） | `CFG.SPAWN`（`targetBase/targetPerLv/targetCap` / `refillPerSec`）+ `UNLOCK_TABLE` 的 `density` |
| 每关可用怪池 | `UNLOCK_TABLE`（`pool` 为该关可用池，关内按时间分波次） |
| 升级经验曲线 | `CFG.XP_BASE` / `CFG.XP_GROW`（满级总需经验 ≈800） |
| 武器与被动 | `WEAPONS` / `PASSIVES` |
| 怪物属性与机制 | `ETYPE`（`mech` 字段驱动行为） |
| 4 幕场景与主题 Boss | `CFG.ACTS` / `CFG.BOSSES` / `guardInfo()`（独立守卫与主题 Boss 精灵） |
| 震屏与打击反馈 | `CFG.FEEL` |

⚠️ 内部怪物 `type` key（`spore/swift/split/mimic/thief/bomber/elite/boss`）**不要改**，选敌、击杀、Boss 流程都依赖它；改显示名只动 `ETYPE[type].name`。

## 技术栈

| 层 | 方案 |
|---|---|
| 渲染 | 原生 Canvas 2D，固定步长 `update(dt)` + 插值渲染，DPR 适配 |
| 动画 | 透明 WebP 角色精灵、切片步态与 Canvas 技能特效 |
| 音频 | Web Audio API 程序化合成（无素材文件），lookahead 调度 BGM |
| 输入 | 键盘 / 触屏虚拟摇杆统一输入层 |
| 依赖 | 无。无 npm、无打包器、无框架 |
| 部署 | 任意静态托管（nginx 配置见 `部署说明.md`，务必 `include mime.types`） |

## 美术资产

新版角色与怪物精灵由 ImageGen 生成，裁切并归一化为 512² 透明 WebP。视觉契约与生图提示词见 [`docs/art-direction-brief.md`](docs/art-direction-brief.md)，资产来源与验收状态见 [`assets/manifest.json`](assets/manifest.json)。原图保留在 `assets/characters/_source/` 供溯源。

> 商用前请自行确认第三方库许可证与素材版权。

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/开发流程.md](docs/开发流程.md) | 环境准备、目录职责、常见改动指南、验证流程、部署踩坑 |
| [docs/art-direction-brief.md](docs/art-direction-brief.md) | 美术契约与 9 个角色的生图提示词 |
| [docs/内容扩展设计.md](docs/内容扩展设计.md) | 武器 5→12、被动 9→15、怪物 8→16 的扩展设计 |
| [docs/关卡循环设计.md](docs/关卡循环设计.md) | 关卡循环修正：每关 1→20 级满级解锁 Boss 的设计稿 |
| [部署说明.md](部署说明.md) | nginx 部署步骤与最高频翻车点 |

## 路线图

- [x] **关卡循环改造**：每关从 Lv1 练到 Lv20 → 触发关底 Boss → 击杀过关（2026-11-19 完成，见 `docs/关卡循环设计.md`）
- [ ] **内容扩展**：武器 5→12、被动 9→15、怪物 8→16，按幕逐步解锁
- [ ] 武器进化合成
- [x] 游戏暂停
- [ ] 排行榜
- [x] 4 位主题 Boss 独立精绘及终极招式

## 已知限制

- 普通怪在 44px 实际尺寸下五官细节偏糊，剪影与配色仍可辨（AI 精灵的物理限制）
- 移动端性能目标是 60fps，极端满屏场景会先降粒子数
- 玩家进度存在浏览器本地，不清缓存不会丢，但换设备不跟随

## License

[MIT](LICENSE)
