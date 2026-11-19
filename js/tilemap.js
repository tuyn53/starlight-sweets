// Terrain is a repeating library of chunk recipes. A level and world coordinates
// select the recipe, so walking away and back always shows the same terrain.
const TILE_SIZE=34;
const CHUNK_SIDE=8;
const CHUNK_SIZE=TILE_SIZE*CHUNK_SIDE;
const CHUNK_VARIANTS=12;
const TERRAIN_TILES={
  meadow: { ground:['#b7ce72','#bed578'], details:[0,0,0,0,0,0,0,1,1,2] },
  forest: { ground:['#efdfdc','#f3e4de'], details:[0,0,0,0,0,3,3,4] },
  sky:    { ground:['#dfeafb','#e5effe'], details:[0,0,0,0,0,5,5,6] },
  castle: { ground:['#ded4ef','#e4d9f3'], details:[0,0,0,0,0,7,7,8] },
};

function terrainHash(seed,x,y){
  let n=Math.imul(seed,0x9e3779b1)^Math.imul(x,0x85ebca6b)^Math.imul(y,0xc2b2ae35);
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
}

function terrainChunkVariant(level,column,row){
  return terrainHash(level,column,row)%CHUNK_VARIANTS;
}

function terrainChunkTiles(theme,variant){
  const details=TERRAIN_TILES[theme].details;
  const tiles=new Uint8Array(CHUNK_SIDE*CHUNK_SIDE);
  for(let y=0;y<CHUNK_SIDE;y++){
    for(let x=0;x<CHUNK_SIDE;x++){
      tiles[y*CHUNK_SIDE+x]=details[terrainHash(variant+1,x,y)%details.length];
    }
  }
  return tiles;
}

// Only the active theme's recipe bitmaps are kept. Memory is independent of distance traveled.
let terrainTheme='';
const terrainChunks=new Map();

function drawTilemap(target,theme,level,cam,w,h,padding){
  if(theme!==terrainTheme){
    terrainChunks.clear();
    terrainTheme=theme;
  }
  target.fillStyle=TERRAIN_TILES[theme].ground[0];
  target.fillRect(cam.x-padding,cam.y-padding,w+2*padding,h+2*padding);
  const left=Math.floor((cam.x-padding)/CHUNK_SIZE), top=Math.floor((cam.y-padding)/CHUNK_SIZE);
  const right=Math.ceil((cam.x+w+padding)/CHUNK_SIZE), bottom=Math.ceil((cam.y+h+padding)/CHUNK_SIZE);
  for(let row=top;row<bottom;row++){
    for(let col=left;col<right;col++){
      const variant=terrainChunkVariant(level,col,row);
      let chunk=terrainChunks.get(variant);
      if(!chunk){
        chunk=paintTerrainChunk(theme,variant);
        terrainChunks.set(variant,chunk);
      }
      target.drawImage(chunk,col*CHUNK_SIZE,row*CHUNK_SIZE);
    }
  }
}

function paintTerrainChunk(theme,variant){
  const chunk=document.createElement('canvas');
  // Bleed one pixel on the trailing edges for subpixel camera positions and shake.
  chunk.width=chunk.height=CHUNK_SIZE+1;
  const c=chunk.getContext('2d',{alpha:false});
  const {ground}=TERRAIN_TILES[theme];
  const tiles=terrainChunkTiles(theme,variant);
  for(let y=0;y<CHUNK_SIDE;y++){
    for(let x=0;x<CHUNK_SIDE;x++){
      const px=x*TILE_SIZE, py=y*TILE_SIZE;
      c.fillStyle=ground[(x+y)%2];
      c.fillRect(px,py,TILE_SIZE,TILE_SIZE);
      const detail=tiles[y*CHUNK_SIDE+x];
      if(detail) paintTerrainDetail(c,detail,px+TILE_SIZE/2,py+TILE_SIZE/2);
    }
  }
  for(let i=0;i<CHUNK_SIDE;i++){
    c.fillStyle=ground[i%2];
    c.fillRect(CHUNK_SIZE,i*TILE_SIZE,1,TILE_SIZE);
    c.fillRect(i*TILE_SIZE,CHUNK_SIZE,TILE_SIZE,1);
  }
  c.fillStyle=ground[0];
  c.fillRect(CHUNK_SIZE,CHUNK_SIZE,1,1);
  return chunk;
}

function terrainEllipse(c,x,y,rx,ry,color,angle=0){
  c.fillStyle=color;
  c.beginPath(); c.ellipse(x,y,rx,ry,angle,0,TAU); c.fill();
}

function paintTerrainDetail(c,detail,x,y){
  switch(detail){
    case 1:
      for(let side=-1;side<=1;side++) terrainEllipse(c,x+side*3.4,y+Math.abs(side)*1.5,2.5,3.6,'#729d579d',side*.72);
      break;
    case 2: drawTerrainDaisy(c,x,y,.75); break;
    case 3:
      terrainEllipse(c,x,y,13,5,'#ce9ca633',-.25);
      terrainEllipse(c,x+8,y+4,2,1.2,'#fff8e8');
      break;
    case 4:
      c.fillStyle='#b68972'; c.fillRect(x-1.5,y-1,3,9);
      terrainEllipse(c,x,y-3,6,5,'#de91af');
      terrainEllipse(c,x-1.5,y-5,2,1.4,'#ffe9f4');
      break;
    case 5:
      terrainEllipse(c,x-5,y,9,4,'#fff9');
      terrainEllipse(c,x+1,y-2,10,6,'#fff9');
      terrainEllipse(c,x+7,y+1,7,3,'#fff9');
      break;
    case 6: terrainEllipse(c,x,y,3.5,2.5,'#fff3bd',-.45); break;
    case 7:
      c.strokeStyle='#fff8e99d'; c.lineWidth=1;
      c.beginPath(); c.moveTo(x-14,y); c.lineTo(x,y-7);
      c.lineTo(x+14,y); c.lineTo(x,y+7); c.closePath(); c.stroke();
      break;
    case 8:
      c.fillStyle='#fff2c4';
      c.beginPath(); c.moveTo(x-6,y); c.lineTo(x,y-8);
      c.lineTo(x+6,y); c.lineTo(x,y+8); c.closePath(); c.fill();
      break;
  }
}

function drawTerrainDaisy(c,x,y,size){
  terrainEllipse(c,x+1,y+3,6*size,3*size,'#718c5540');
  for(let i=0;i<6;i++){
    const a=i/6*TAU;
    terrainEllipse(c,x+Math.cos(a)*4*size,y+Math.sin(a)*4*size,3.5*size,2.2*size,'#fffae5',a);
  }
  terrainEllipse(c,x,y,2.7*size,2.7*size,'#f1b442');
}
