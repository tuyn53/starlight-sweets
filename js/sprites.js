// === 精灵图系统 ===
// AI 生成的 512x512 透明 PNG，脚底锚点。加载失败自动回退程序化绘制，绝不白屏。
const SPRITES = {};
const SPRITE_SRC = {
  player:'assets/characters/player.png',
  spore :'assets/characters/spore.png',
  swift :'assets/characters/swift.png',
  split :'assets/characters/split.png',
  mimic :'assets/characters/mimic.png',
  thief :'assets/characters/thief.png',
  bomber:'assets/characters/bomber.png',
  elite :'assets/characters/elite.png',
  boss  :'assets/characters/boss.png',
};
let spritesReady = false;

function loadSprites(onDone){
  let left = Object.keys(SPRITE_SRC).length;
  const done = ()=>{ if(--left<=0){ spritesReady=true; if(onDone) onDone(); } };
  for(const k in SPRITE_SRC){
    const img = new Image();
    img.onload = done;
    img.onerror = ()=>{ console.warn('[sprites] 加载失败，使用程序化回退:',k); done(); };
    img.src = SPRITE_SRC[k];
    SPRITES[k] = img;
  }
}
function spriteOK(k){ const im=SPRITES[k]; return im && im.complete && im.naturalWidth>0; }

// 在当前坐标系下画精灵，脚底对齐原点 (0,0)，精灵内容高度 = h。
// 归一化脚本把内容放在图高 6%~98% 之间，故用 0.92 反推绘制高度、0.98 对齐脚底。
// opts: { alpha, flash(受击白), bob(呼吸像素), flipX, sx, sy }
// 注意：sx/sy 默认 1（不额外变形）。敌人的 squash/呼吸由外部坐标系统一处理，勿重复传。
function drawSprite(k, x, y, h, opts){
  if(!spriteOK(k)) return false;
  const im=SPRITES[k], o=opts||{};
  const sx=o.sx===undefined?1:o.sx, sy=o.sy===undefined?1:o.sy;
  const alpha=o.alpha===undefined?1:o.alpha;
  const bob=o.bob||0;
  const drawH=h/0.92, drawW=drawH*(im.naturalWidth/im.naturalHeight);
  const dx=x-drawW/2, dy=y-drawH*0.98+bob;
  ctx.save();
  ctx.globalAlpha=alpha;
  if(sx!==1||sy!==1||o.flipX){ ctx.translate(x,y+bob); ctx.scale(sx*(o.flipX?-1:1),sy); ctx.translate(-x,-(y+bob)); }
  ctx.drawImage(im, dx, dy, drawW, drawH);
  if(o.flash){
    // 闪白只作用于精灵形状：用 filter 把同一张图刷白再叠一次（比 source-atop 安全，不误伤背景）
    ctx.save();
    ctx.globalAlpha=alpha*0.9;
    ctx.filter='brightness(0) invert(1)';
    ctx.drawImage(im, dx, dy, drawW, drawH);
    ctx.restore();
  }
  ctx.restore();
  return true;
}
