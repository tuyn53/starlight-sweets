// === 纸娃娃切片骨骼（Slice Rig）===
// 思路：不重画角色，直接把原来的 AI 精绘 PNG 切成「躯干 / 左臂 / 右臂 / 左腿 / 右腿」，
//       各片绕关节旋转。像素来自原图 → 画风 100% 保留；分片旋转 → 手脚真的能动。
// 关节处理：切片区比挖空区大一圈，根部留一条在躯干上当"关节填充"，旋转时盖住缝隙。
const SliceRig = (() => {
  const CUT = {
    // rect = 切片范围（含根部余量）；erase = 从躯干挖掉的范围（比 rect 小，留根部）
    // 坐标归一化到源图 512；pivot 是旋转关节
    player: {
      armL:{rect:[0,0.52,0.22,0.19], erase:[0,0.53,0.195,0.17], pivot:[0.215,0.575]},
      armR:{rect:[0.78,0.52,0.22,0.19], erase:[0.805,0.53,0.195,0.17], pivot:[0.785,0.575]},
      legL:{rect:[0.375,0.84,0.105,0.16], erase:[0.38,0.86,0.095,0.14], pivot:[0.425,0.86]},
      legR:{rect:[0.475,0.84,0.105,0.16], erase:[0.485,0.86,0.095,0.14], pivot:[0.53,0.86]},
    },
    // 怪物用同一套近似比例（Q版结构类似），44px 下细节不敏感
    _default: {
      armL:{rect:[0,0.55,0.24,0.18], erase:[0,0.56,0.21,0.16], pivot:[0.235,0.60]},
      armR:{rect:[0.76,0.55,0.24,0.18], erase:[0.79,0.56,0.21,0.16], pivot:[0.765,0.60]},
      legL:{rect:[0.36,0.84,0.13,0.16], erase:[0.37,0.86,0.115,0.14], pivot:[0.425,0.86]},
      legR:{rect:[0.51,0.84,0.13,0.16], erase:[0.515,0.86,0.115,0.14], pivot:[0.575,0.86]},
    },
  };
  const cache = {};   // kind -> { body, parts:{armL,...}, conf }

  function build(kind){
    if(cache[kind]) return cache[kind];
    const im = SPRITES[kind];
    if(!spriteOK(kind)) return null;
    const S = im.naturalWidth;
    const conf = CUT[kind] || CUT._default;
    // 躯干 = 原图挖掉各切片根部
    const body = document.createElement('canvas'); body.width=body.height=S;
    const bc = body.getContext('2d');
    bc.drawImage(im,0,0,S,S);
    bc.globalCompositeOperation='destination-out';
    for(const k in conf){
      const e=conf[k].erase;
      bc.fillRect(e[0]*S,e[1]*S,e[2]*S,e[3]*S);
    }
    bc.globalCompositeOperation='source-over';
    // 各切片 = 从原图裁出对应矩形
    const parts={};
    for(const k in conf){
      const r=conf[k].rect;
      const c=document.createElement('canvas');
      c.width=Math.ceil(r[2]*S); c.height=Math.ceil(r[3]*S);
      c.getContext('2d').drawImage(im, r[0]*S,r[1]*S,c.width,c.height, 0,0,c.width,c.height);
      parts[k]={canvas:c, rx:r[0]*S, ry:r[1]*S, pivot:[conf[k].pivot[0]*S, conf[k].pivot[1]*S]};
    }
    return (cache[kind]={body,parts,conf,S});
  }

  // 用已加载的原图做切片骨骼绘制。pose 来自 Rig.sample。
  // x,y = 脚底中心；h = 角色目标像素高。
  // 做法：把"源图坐标"整体映射到"目标矩形"，所有切片与躯干都画在这套目标坐标里，
  //       旋转的 pivot 也先换算到目标坐标，避免多层嵌套变换出错。
  function draw(kind, x, y, h, pose, opts){
    if(!CFG.USE_SLICE || !spriteOK(kind)) return false;
    const data=build(kind); if(!data) return false;
    const o=opts||{}, c=o.ctx, S=data.S;
    const drawH=h/0.92;                 // 源图内容占 92% 高，反推实际绘制高度
    const scale=drawH/S;                // 源图像素 → 屏幕像素
    // 源图 (sx,sy) → 屏幕：left = x-drawW/2；top = y-drawH*0.98（脚底锚点）
    const drawW=drawH;                  // 精灵是正方形
    const ox = x - drawW/2, oy = y - drawH*0.98;
    const TX = sx => ox + sx*scale;     // 源图 X → 屏幕 X
    const TY = sy => oy + sy*scale;     // 源图 Y → 屏幕 Y

    c.save();
    if(o.alpha!==undefined) c.globalAlpha=o.alpha;
    if(o.hue) c.filter=`hue-rotate(${o.hue}deg)`;
    const sq=pose.squash||1;
    // 以脚底中心为锚做纵向压扁 + 左右翻转
    if(sq!==1 || o.flipX){ c.translate(x,y); c.scale(o.flipX?-1:1,sq); c.translate(-x,-y); }

    const rot=(k, ang)=>{
      const p=data.parts[k]; if(!p) return;
      const px=TX(p.pivot[0]), py=TY(p.pivot[1]);   // pivot 换算到屏幕坐标
      c.save();
      c.translate(px,py); c.rotate(ang||0); c.translate(-px,-py);
      c.drawImage(p.canvas, TX(p.rx), TY(p.ry), p.canvas.width*scale, p.canvas.height*scale);
      c.restore();
    };
    // 腿在躯干后，手臂在躯干前；关节根部由躯干余量覆盖缝隙
    rot('legL',pose.legL); rot('legR',pose.legR);
    c.drawImage(data.body, ox, oy, drawW, drawH);
    rot('armL',pose.armL); rot('armR',pose.armR);
    c.restore();
    return true;
  }
  return { draw, build, CUT };
})();
