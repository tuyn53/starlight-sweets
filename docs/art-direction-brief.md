# 星光保卫战 Starlight Sweets — 角色精灵美术契约

> 用途：AI 生成角色精灵的统一约束。每次生成必须对照本契约，禁止凭"好看"这种词judge。
> 最后更新：2026-11-18（整体风格改为 Q 版卡通可爱；角色新增甜系显示名，内部 type key 不变）
>
> **命名对照（内部 key → 甜系显示名）**：spore→棉棉 / swift→跳跳 / split→团子 / mimic→果冻 /
> thief→焦糖 / bomber→爆米 / elite→泡芙 / boss→按关卡为 莓莓(5)/抹茶(10)/云朵(15)/黑森林(20)。
> 下方提示词沿用角色原始视觉特征（精灵图不变），仅游戏内显示名为甜系。

## 1. 技术框（Technical frame）

| 项 | 值 |
|---|---|
| 引擎 | 原生 Canvas 2D（H5），无构建，nginx 静态托管 |
| 维度 | 2D 精灵，正面朝向（面朝屏幕），轻微 3/4 俯视感 |
| 生图尺寸 | 512×512 超分源图，运行时缩放到目标尺寸 |
| 运行时目标 | 普通怪 ~44px 高 / 精英 52px / Boss 104px / 玩家 30px |
| 透明度 | 必须真透明背景（alpha），不用棋盘格假透明 |
| 锚点 | 脚底中心（bottom-center）；角色脚在画布底边居中 |
| 留白 | 脚底贴画布底边，头顶留白 ≤ 10%，左右留白对称 |
| 过滤 | 运行时 canvas 平滑缩放（非像素画） |
| 纹理预算 | 9 张 512² PNG，压缩后总量目标 < 3MB |
| 目标平台 | 移动端微信内置浏览器 + 桌面 Chrome |

## 2. 视觉系统（Visual system）

| 轴 | 定义 |
|---|---|
| 形状语言 | 圆润有机 = 友方/普通怪；尖锐几何 = 危险；星芒/角冠 = 精英与 Boss。二头身 Q 版，头身比约 1:1.2，大头占视觉主体 |
| 剪影优先级 | 每个角色靠 1 个专属配饰一眼可辨：苔姬=红白蘑菇帽、夜燕=蝙蝠耳+膜翅、绯樱=双丸子头、蜃影=半透明+呆毛、金狐=猫耳+眼罩、花火=炸弹发髻+引信、蜂姬=蜂翅+王冠、夜魇=恶魔角+王冠；玩家=青色双马尾+金色星星发饰+白青魔法短裙 |
| 明度 | 每角色 3 段：左上高光 / 主体色 / 右下暗部；灰度下仍能分离头、身、配饰 |
| 配色角色 | 友方青 `#54dcff` / 经验蓝 / 苔姬薄荷绿 `#57dc98` / 夜燕紫 `#b27bff` / 绯樱樱粉 `#ff8fc7` / 蜃影青绿 `#5ce0e0` / 金狐橘 `#ffa94d` / 花火珊瑚红 `#ff6b7a` / 蜂姬金 `#ffcf5a` / 夜魇危险红 `#ff5470` |
| 边缘 | 统一深色描边 `#070a16`，约 2-3px（512 图上 8-12px），不用纯黑生硬边；左上轮廓光 |
| 材质 | 果冻/布料柔和哑光；蜂翅半透明膜；王冠/金属硬边高光；魔法部位发光；忌塑料高反光 |
| 光照 | 统一左上方柔光源；高光在左上、暗部在右下，所有角色方向一致；不接受逆光或顶光 |
| 细节密度 | 低-中。缩到 44px 时五官（大眼+腮红）和专属配饰必须清晰；细小花纹会消失故不画 |
| 相机 | 正交、正面、正面偏俯视 5-10°，无透视畸变；全身入镜，不画地面阴影（运行时程序化画） |
| 运动 | 待机为轻微呼吸浮动；运行时由代码叠加 squash/stretch、命中闪白、隐身半透明、出生弹出——**精灵必须是静态中性 pose，不要预画动作** |

## 3. 每角色专属提示词块（生成时替换 CHARACTER_BLOCK）

公共锁定块（每次都带）：
```
ROLE: production 2D game sprite for a top-down roguelite survivor H5 game.
VIEW: orthographic front-facing, slight 5-10 degree top-down, full body, centered, feet at bottom edge of canvas.
ART DIRECTION: chibi Q-version anime girl, head-to-body ratio about 1:1.2, oversized head, large expressive eyes, simple soft matte shading, 3 value bands, clean dark outline #070a16 about 2-3px, upper-left soft key light with highlight upper-left and shadow lower-right, consistent lighting across all characters.
GAME-SCALE READ: at 44 pixels tall the silhouette and one signature accessory must remain identifiable.
TECHNICAL OUTPUT: 512x512 PNG, transparent background with real alpha channel, no checkerboard, no platform, no ground shadow, no motion lines.
LOCKS: single neutral idle pose, static, no pre-painted animation, no weapon effects.
EXCLUDE: text, labels, watermark, signature, mockup frame, scenery, duplicate characters, cropped edges, extra limbs.
```

各角色 CHARACTER_BLOCK：

- **player 玩家·星澜小法师**：`青色双马尾小法师少女, teal twin-tail mage girl, NO HAT and NO HOOD, full cute face visible, golden star hair clips, white-and-teal magical-girl short dress, short capelet behind shoulders, glowing cyan magic orb brooch, friendly happy expression, palette teal #54dcff.`
- **spore 苔姬**：`薄荷绿双马尾少女, mint-green twin-tail girl, RED MUSHROOM CAP with white spots as signature hat, gentle expression, palette mint green #57dc98.`
- **swift 夜燕**：`紫色长发少女, purple long-haired girl, BAT EARS and small membranous wings as signature, sharp confident eyes, palette purple #b27bff.`
- **split 绯樱**：`樱粉色双丸子头发型少女, pink twin-bun hair girl, cherry-blossom hair ornaments, cheerful expression, palette cherry pink #ff8fc7.`
- **mimic 蜃影**：`青绿色透明感少女, translucent cyan-green girl, single prominent ahoge cowlick, slightly mischievous smoky outline, palette cyan-green #5ce0e0.`
- **thief 金狐**：`橘色短发猫耳少女, orange short-haired girl with CAT EARS and a dark eye-patch over one eye, sly grin, palette orange #ffa94d.`
- **bomber 花火**：`珊瑚红少女, coral-red girl, BOMB-SHAPED hair bun with a burning fuse cowlick, excited expression, palette coral red #ff6b7a.`
- **elite 蜂姬**：`金色少女 queen, golden girl, TRANSPARENT BEE WINGS behind, queen crown with antennae, regal expression, taller proportions, palette gold #ffcf5a.`
- **boss 夜魇**：`暗红色魔王少女, dark-red demon queen girl, large DEMON HORNS and ornate crown, fierce angry eyes, larger imposing proportions, palette danger red #ff5470.`

## 4. 验收门槛（release gate）

- [ ] `asset_report.py` 每张通过：512×512、真 alpha（非全不透明）
- [ ] contact sheet 目视：八角色剪影互相可区分，描边宽度一致，光照方向一致
- [ ] 44px 缩略图目视：专属配饰仍可辨
- [ ] 真实游戏截图：与深色网格背景对比可读，不糊成一团
- [ ] 导入后动态叠加（squash/闪白/隐身）不破形
- [ ] manifest 每条有 source/license，`technical_checks_passed: true`
