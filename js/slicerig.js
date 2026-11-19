// Reuse Rig's walk poses with masks calibrated to the current WebP artwork.
// Each entry starts with the joint, followed by the limb polygon, in a 200×200 reference grid.
const SliceRig=(()=>{
  const CUT={
    player: [
      [71,137, 63,132,83,135,72,162,60,199,39,199,39,158],
      [104,137, 93,134,115,131,137,171,142,199,101,199,95,165],
    ],
    spore: [
      [91,159, 82,158,98,159,98,183,76,185,75,168],
      [103,166, 98,162,112,163,116,199,94,199,96,177],
    ],
    swift: [
      [94,167, 83,162,101,166,100,180,71,199,54,199,59,185],
      [111,167, 106,163,119,160,143,170,151,199,117,199,112,183],
    ],
    split: [
      [95,174, 86,172,104,172,105,199,86,199],
      [113,174, 106,172,123,172,124,199,106,199],
    ],
    mimic: [
      [87,165, 79,161,97,162,98,199,71,199],
      [109,165, 100,162,117,161,124,199,98,199],
    ],
    thief: [
      [65,162, 58,159,79,158,77,182,68,199,40,199,42,181],
      [100,162, 92,159,109,158,124,183,127,199,95,199],
    ],
    bomber: [
      [88,167, 81,163,99,164,98,184,88,199,70,199,74,182],
      [110,167, 100,164,120,163,124,199,101,199],
    ],
    elite: [
      [89,158, 81,154,100,154,97,179,92,199,69,199,71,174],
      [115,158, 104,154,123,154,131,180,132,199,108,199],
    ],
    guard: [
      [78,145, 72,141,86,141,83,154,78,165,74,178,75,198,51,198,53,180,60,165,68,153],
      [110,145, 101,142,115,142,119,155,123,169,124,178,140,188,141,198,108,198,109,178,104,166],
    ],
    souffle: [
      [88,172, 82,168,98,166,96,181,99,196,75,198,76,181],
      [111,173, 105,168,116,168,123,178,130,184,132,198,104,198,102,184],
    ],
    forestQueen: [
      [79,171, 71,168,91,165,87,181,83,198,63,198,64,183],
      [113,170, 104,165,123,168,126,184,135,198,109,198,105,181],
    ],
    // These designs hide their shoes. Animate the two sides of the hem instead.
    boss: [
      [71,174, 39,176,96,180,99,199,41,199,32,185],
      [128,174, 104,180,162,176,169,186,160,199,101,199],
    ],
    matcha: [
      [74,175, 43,179,97,182,99,199,32,199,31,188],
      [127,175, 104,182,157,179,176,189,177,199,102,199],
    ],
  };
  // The sleeve, fingers and wand are one piece so the grip stays attached.
  const WAND_ARM=[114,65, 111,60,119,59,124,58,132,56,140,58,146,57,152,55,157,57,
    160,52,165,51,167,42,171,42,175,49,184,51,184,57,176,60,174,67,167,65,164,61,
    158,63,154,66,151,69,143,70,137,72,130,74,120,74,111,71];
  const cache=new Map();
  const size=256;
  const unit=size/200;

  function build(kind){
    if(cache.has(kind)) return cache.get(kind);
    if(!CUT[kind] || !spriteOK(kind)) return null;

    const source=document.createElement('canvas');
    source.width=source.height=size;
    const original=source.getContext('2d');
    original.imageSmoothingQuality='high';
    original.drawImage(SPRITES[kind],0,0,size,size);
    const body=document.createElement('canvas');
    body.width=body.height=size;
    const painter=body.getContext('2d');
    painter.drawImage(source,0,0);
    painter.globalCompositeOperation='destination-out';

    function slice([jointX,jointY,...outline],arm=false){
      const mask=new Path2D();
      const xs=[],ys=[];
      for(let i=0;i<outline.length;i+=2){
        const x=outline[i]*unit,y=outline[i+1]*unit;
        if(i===0) mask.moveTo(x,y); else mask.lineTo(x,y);
        xs.push(x); ys.push(y);
      }
      mask.closePath();
      const left=Math.floor(Math.min(...xs)), top=Math.floor(Math.min(...ys));
      const right=Math.ceil(Math.max(...xs)), bottom=Math.ceil(Math.max(...ys));
      const image=document.createElement('canvas');
      image.width=right-left; image.height=bottom-top;
      const layer=image.getContext('2d');
      layer.translate(-left,-top);
      layer.clip(mask);
      layer.drawImage(source,0,0);

      // Leave a narrow overlap at each joint so rotation doesn't reveal a gap.
      painter.save();
      if(arm){
        const eraseX=jointX*unit;
        painter.beginPath(); painter.rect(eraseX,top,right-eraseX,image.height);
      } else {
        const overlap=kind==='boss'||kind==='matcha'?7:1;
        const eraseY=Math.max(top,(jointY+overlap)*unit);
        painter.beginPath(); painter.rect(left,eraseY,image.width,bottom-eraseY);
      }
      painter.clip();
      painter.fill(mask);
      painter.restore();
      return {image,left,top,x:jointX*unit,y:jointY*unit};
    }
    const legs=CUT[kind].map(outline=>slice(outline));
    const arm=kind==='player'?slice(WAND_ARM,true):null;
    if(arm){
      // Restore the small area of cape and hair behind the forearm.
      painter.globalCompositeOperation='destination-over';
      painter.scale(unit,unit);
      painter.fillStyle='#79b9ac';
      painter.beginPath(); painter.moveTo(123,68); painter.lineTo(140,65);
      painter.quadraticCurveTo(153,65.5,160,72);
      painter.lineTo(133,74); painter.lineTo(121,73); painter.closePath(); painter.fill();
    }
    const rig={body,legs,arm,hem:kind==='boss'||kind==='matcha'};
    cache.set(kind,rig);
    return rig;
  }

  function draw(kind,x,y,h,pose,{ctx:c,alpha=1,flipX=false,flash=false}){
    if(!pose.strength && !pose.cast) return false;
    const rig=build(kind);
    if(!rig) return false;
    const drawH=h/.92, scale=drawH/size;
    const swing=[pose.legL,pose.legR];
    c.save();
    c.globalAlpha=alpha;
    c.translate(x,y);
    c.scale(flipX?-1:1,1);
    c.translate(-drawH/2,-drawH*.98);
    c.scale(scale,scale);
    for(let i=0;i<rig.legs.length;i++){
      const leg=rig.legs[i], phase=swing[i]*pose.strength;
      const angle=phase*(rig.hem?.17:kind==='player'?.85:.63);
      c.save();
      c.translate(leg.x,leg.y);
      c.rotate(angle);
      c.scale(1,1-Math.max(phase,0)*(rig.hem?.07:.23));
      c.drawImage(leg.image,leg.left-leg.x,leg.top-leg.y);
      c.restore();
    }
    c.drawImage(rig.body,0,0);
    if(rig.arm){
      const {arm}=rig;
      c.save();
      c.translate(arm.x,arm.y);
      c.rotate(pose.cast?.angle||0);
      c.drawImage(arm.image,arm.left-arm.x,arm.top-arm.y);
      if(pose.cast?.flash){
        c.globalAlpha=alpha*pose.cast.flash;
        c.fillStyle='#fff5c0';
        c.shadowColor='#ffd25f'; c.shadowBlur=8;
        c.beginPath();
        c.arc(171*unit-arm.x,54*unit-arm.y,3.5*unit,0,TAU);
        c.fill();
      }
      c.restore();
    }
    if(flash){
      c.globalAlpha=alpha*.45;
      c.filter='brightness(0) invert(1)';
      c.drawImage(rig.body,0,0);
    }
    c.restore();
    return true;
  }

  return {draw};
})();
