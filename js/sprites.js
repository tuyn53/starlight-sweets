// === 精灵图系统 ===
// AI 生成的 512x512 透明 PNG，脚底锚点。加载失败自动回退程序化绘制，绝不白屏。
const SPRITES = {};
const BATTLE_SPRITES = {};
const SPRITE_SRC = {
  player:'assets/characters/player-star.webp',
  spore :'assets/characters/spore-star.webp',
  swift :'assets/characters/swift-star.webp',
  split :'assets/characters/split-star.webp',
  mimic :'assets/characters/mimic-star.webp',
  thief :'assets/characters/thief-star.webp',
  bomber:'assets/characters/bomber-star.webp',
  elite :'assets/characters/elite-star.webp',
  boss  :'assets/characters/boss-star.webp',
  matcha:'assets/characters/matcha-star.webp',
  guard:'assets/characters/guard-star.webp',
  souffle:'assets/characters/souffle-star.webp',
  forestQueen:'assets/characters/forest-queen-star.webp',
};
let spritesReady = false;

function loadSprites(onDone, onProgress){
  const keys = Object.keys(SPRITE_SRC);
  const total = keys.length;
  let finished = 0;
  // 每张完成（成功或失败）都推进真实进度；失败也算"已处理"，否则进度条会卡死
  const step = (ok, k)=>{
    finished++;
    if(onProgress) onProgress(finished, total, ok, k);
    if(finished>=total){ spritesReady=true; if(onDone) onDone(); }
  };
  for(const k of keys){
    const img = new Image();
    img.onload = ()=>{
      const scaled=document.createElement('canvas');
      scaled.width=scaled.height=128;
      const painter=scaled.getContext('2d');
      painter.imageSmoothingQuality='high';
      painter.drawImage(img,0,0,128,128);
      BATTLE_SPRITES[k]=scaled;
      step(true,k);
    };
    img.onerror = ()=>{ console.warn('[sprites] 加载失败，使用程序化回退:',k); step(false, k); };
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
  const c=o.ctx||ctx;
  const art=h<=112 ? BATTLE_SPRITES[k]||im : im;
  const sx=o.sx===undefined?1:o.sx, sy=o.sy===undefined?1:o.sy;
  const alpha=o.alpha===undefined?1:o.alpha;
  const bob=o.bob||0;
  const drawH=h/0.92, drawW=drawH*(im.naturalWidth/im.naturalHeight);
  const dx=x-drawW/2, dy=y-drawH*0.98+bob;
  c.save();
  c.globalAlpha=alpha;
  if(sx!==1||sy!==1||o.flipX){ c.translate(x,y+bob); c.scale(sx*(o.flipX?-1:1),sy); c.translate(-x,-(y+bob)); }
  c.drawImage(art, dx, dy, drawW, drawH);
  if(o.flash){
    // 闪白只作用于精灵形状：用 filter 把同一张图刷白再叠一次（比 source-atop 安全，不误伤背景）
    c.save();
    c.globalAlpha=alpha*0.9;
    c.filter='brightness(0) invert(1)';
    c.drawImage(art, dx, dy, drawW, drawH);
    c.restore();
  }
  c.restore();
  return true;
}
