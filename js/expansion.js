// 扩展战斗规则，与基础武器共用选敌、伤害、弹丸及粒子上限。
function areaScale(){ return 1+.12*(player.passives.area||0); }
function durationScale(){ return 1+.15*(player.passives.duration||0); }
function extraShots(){ return player.passives.multishot||0; }
function isEliteEnemy(enemy){ return enemy.tier===2 && !enemy.isChild; }

function hitTarget(target,damage,x,y,knockback=70){
  if(target.prop) damageProp(target,damage,target.x-x,target.y-y);
  else damageEnemy(target,damage,target.x-x,target.y-y,false,knockback);
}

function strikeCircle(x,y,r,damage,knockback){
  const count=game.enemies.length;
  for(let i=0;i<count;i++){
    const enemy=game.enemies[i];
    if(!enemy.dead && dist2(x,y,enemy.x,enemy.y)<(r+enemy.r)**2) hitTarget(enemy,damage,x,y,knockback);
  }
  for(const prop of game.props){
    if(!prop.dead && dist2(x,y,prop.x,prop.y)<(r+prop.r)**2) hitTarget(prop,damage,x,y);
  }
}

function nearestLive(x,y,range,excluded){
  let best=null, bestDistance=range*range;
  for(const enemy of game.enemies){
    if(enemy.dead || enemy.hidden || excluded?.has(enemy.id)) continue;
    const distance=dist2(x,y,enemy.x,enemy.y);
    if(distance<bestDistance || (distance===bestDistance && (!best || enemy.id<best.id))){
      best=enemy; bestDistance=distance;
    }
  }
  return best;
}

function starlingCount(level){ return Math.min(5,1+Math.floor(level/2)); }
function starlingPosition(i,count){
  const a=game.time*1.7+TAU*i/count;
  return {x:player.x+Math.cos(a)*35,y:player.y+Math.sin(a)*27};
}

const spareMines=[];
function updateExpansionWeapon(weapon,dt){
  weapon.timer-=dt*player.fireRate;
  if(weapon.timer>0) return;
  const {id,level}=weapon, {x,y}=player;
  const area=areaScale();
  let angle;
  switch(id){
    case 'wave': {
      const r=(150+15*level)*area;
      strikeCircle(x,y,r,12+4*level,60);
      addMotion(id,x,y,r*2.8);
      break;
    }
    case 'boomer':
    case 'beam': {
      const target=nearestEnemy();
      if(!target) return;
      angle=Math.atan2(target.y-y,target.x-x);
      if(id==='boomer'){
        const count=1+extraShots();
        for(let i=0;i<count;i++){
          const a=angle+(i-(count-1)/2)*.17;
          game.blades.push({x,y,angle:a,travel:0,returnTime:0,damage:10+3*level,hit:new Set()});
        }
      } else {
        const length=Math.hypot(VIEW.w,VIEW.h);
        const halfWidth=(26+2*level)*area/2;
        const ux=Math.cos(angle), uy=Math.sin(angle);
        const count=game.enemies.length;
        for(let i=0;i<count+game.props.length;i++){
          const target=i<count?game.enemies[i]:game.props[i-count];
          if(target.dead) continue;
          const dx=target.x-x, dy=target.y-y;
          const along=dx*ux+dy*uy, across=dy*ux-dx*uy;
          if(along>=0 && along<=length && Math.abs(across)<halfWidth+target.r) hitTarget(target,14+5*level,x,y);
        }
        addMotion(id,x+ux*length/2,y+uy*length/2,halfWidth*5,angle,length);
      }
      break;
    }
    case 'chain': {
      let target=nearestEnemy();
      if(!target) return;
      const visited=new Set();
      let sx=x, sy=y, damage=9+2*level;
      for(let hop=0;target && hop<3+Math.floor(level/2);hop++){
        const tx=target.x, ty=target.y;
        const direction=Math.atan2(ty-sy,tx-sx);
        addMotion(id,(sx+tx)/2,(sy+ty)/2,42,direction,Math.hypot(tx-sx,ty-sy));
        hitTarget(target,damage,sx,sy);
        visited.add(target.id);
        target=nearestLive(tx,ty,150*area,visited);
        sx=tx; sy=ty; damage*=.85;
      }
      break;
    }
    case 'mine': {
      const mines=game.mines, limit=Math.min(8,3+Math.floor(level/2));
      const mine=mines.length>=limit?mines.shift():(spareMines.pop()||{});
      Object.assign(mine,{x,y,armAt:game.time+.3,end:game.time+8*durationScale(),damage:18+6*level,r:35*area});
      mines.push(mine);
      break;
    }
    case 'sprite': {
      const count=starlingCount(level), shots=count+extraShots();
      let fired=false;
      for(let i=0;i<shots;i++){
        const origin=starlingPosition(i%count,count);
        const target=nearestLive(origin.x,origin.y,240*area);
        if(!target) continue;
        const a=Math.atan2(target.y-origin.y,target.x-origin.x)+(i>=count?.14:0);
        game.bullets.push({...origin,ox:origin.x,oy:origin.y,vx:390*Math.cos(a),vy:390*Math.sin(a),
          life:.7,r:5,dmg:6+2*level,pierce:0,hit:new Set(),kind:'sprite'});
        fired=true;
      }
      if(!fired) return;
      break;
    }
    case 'chrono': {
      const r=(120+10*level)*area, max=2.5*durationScale();
      strikeCircle(x,y,r,5);
      game.timeFields.push({x,y,r,life:max,max});
      break;
    }
  }
  weapon.timer=WEAPONS[id].cd*player.cooldown;
  Rig.startCast(player,game.time,angle);
  if(Juice.ready('expansion-cast',.06)) Sound.shoot();
}

function updateExpansionEntities(dt){
  for(let i=game.blades.length-1;i>=0;i--){
    const blade=game.blades[i];
    const returning=blade.travel>=260;
    if(returning){
      blade.returnTime+=dt;
      if(blade.returnTime>=3 || dist2(blade.x,blade.y,player.x,player.y)<14**2){
        game.blades.splice(i,1);
        continue;
      }
      blade.angle=Math.atan2(player.y-blade.y,player.x-blade.x);
    }
    const distance=returning?360*dt:Math.min(360*dt,260-blade.travel);
    blade.x+=Math.cos(blade.angle)*distance;
    blade.y+=Math.sin(blade.angle)*distance;
    const count=game.enemies.length;
    for(let j=0;j<count+game.props.length;j++){
      const target=j<count?game.enemies[j]:game.props[j-count];
      if(target.dead || target.activateAt>game.time || blade.hit.has(target.id) ||
        dist2(blade.x,blade.y,target.x,target.y)>=(target.r+9)**2) continue;
      blade.hit.add(target.id);
      hitTarget(target,blade.damage,blade.x,blade.y);
    }
    if(!returning){
      blade.travel+=distance;
      if(blade.travel>=260) blade.hit.clear();
    }
  }
  for(let i=game.mines.length-1;i>=0;i--){
    const mine=game.mines[i];
    if(game.time<mine.end){
      if(game.time<mine.armAt || !game.enemies.some(e=>!e.dead && !(e.activateAt>game.time) &&
        dist2(e.x,e.y,mine.x,mine.y)<25**2)) continue;
      strikeCircle(mine.x,mine.y,mine.r,mine.damage);
      addMotion('mine',mine.x,mine.y,mine.r*2.9);
    }
    game.mines.splice(i,1);
    spareMines.push(mine);
  }
  for(let i=game.timeFields.length-1;i>=0;i--){
    const field=game.timeFields[i];
    field.life-=dt;
    if(field.life<=0) game.timeFields.splice(i,1);
  }
}

function spawnCrowdEnemy(type,space){
  const first=spawnEnemy(type);
  if(type!=='swarm' || !first) return;
  const available=Math.floor(CFG.MAX_ENEMIES*.25)-game.enemies.filter(e=>e.type==='swarm'&&!e.dead).length;
  const count=Math.min(space-1,available,randInt(2,4));
  const activateAt=game.time+.1;
  first.activateAt=first.born=activateAt;
  first.hidden=true;
  addMotion('swarm-spawn',first.x,first.y,65);
  for(let i=0;i<count;i++){
    const a=TAU*i/count;
    const child=spawnEnemy('swarm',first.x+18*Math.cos(a),first.y+18*Math.sin(a));
    if(!child) break;
    child.activateAt=child.born=activateAt;
    child.hidden=true;
  }
}

function spawnEncounterElite(){
  const limit=game.level<8?0:game.level<11?1:game.level<16?2:3;
  if(game.eliteCount>=limit) return;
  const alive=game.enemies.filter(e=>isEliteEnemy(e)&&!e.dead).length;
  if(alive>=(game.level===19?2:1)) return;
  const types=game.level>=18?['frost-emperor','millefeuille','elite']:game.level>=13?['millefeuille','elite']:['elite'];
  const enemy=spawnEnemy(types[game.eliteCount%types.length]);
  if(enemy){ game.eliteCount++; toast('精英'+enemy.displayName+'出现'); }
}

function addSlowPool(x,y,r,kind,color,damage=0){
  const limit=4, same=game.hazards.filter(h=>h.kind===kind);
  if(same.length>=limit) game.hazards.splice(game.hazards.indexOf(same[0]),1);
  const goo=kind==='goo-syrup', warn=goo?.3:0, max=goo?2.5:3;
  game.hazards.push({x,y,r,kind,color,damage,life:max+warn,max:max+warn,tick:0,activeAt:game.time+warn});
}

function updateSpecialEnemy(enemy,distance){
  const windup=enemy.windup;
  if(windup && game.time>=windup.at){
    enemy.windup=null;
    if(enemy.mech==='shot'){
      const a=windup.angle;
      game.ebullets.push({x:enemy.x,y:enemy.y,vx:150*Math.cos(a),vy:150*Math.sin(a),
        r:8,life:2,dmg:enemy.dmg,color:enemy.color,kind:'bubble-shot'});
    } else if(enemy.mech==='blink'){
      enemy.x=enemy.ox=windup.x; enemy.y=enemy.oy=windup.y;
      enemy.contactAt=game.time+.25;
      addMotion('mirror-blink',enemy.x,enemy.y,75);
      return true;
    } else {
      for(const ally of game.enemies){
        if(ally!==enemy && !ally.dead && dist2(ally.x,ally.y,enemy.x,enemy.y)<95**2){
          ally.hp=Math.min(ally.maxHp,ally.hp+4);
        }
      }
    }
  }
  if(!enemy.behaviorAt) enemy.behaviorAt=game.time+({goo:3,shot:2.6,heal:2,blink:4,buff:1.1})[enemy.mech];
  if(game.time<enemy.behaviorAt) return false;
  switch(enemy.mech){
    case 'goo':
      addSlowPool(enemy.x,enemy.y,42,'goo-syrup','#df9758');
      enemy.behaviorAt=game.time+3;
      break;
    case 'shot':
      if(distance>200) break;
      enemy.windup={angle:enemy.face,at:game.time+.35};
      enemy.behaviorAt=game.time+2.6;
      addMotion('bubble-shot',enemy.x,enemy.y,42,enemy.face,42,.35);
      break;
    case 'heal':
      enemy.windup={at:game.time+.13};
      enemy.behaviorAt=game.time+2;
      addMotion('cloud-heal',enemy.x,enemy.y,210);
      break;
    case 'blink': {
      const x=player.x-player.faceX*80, y=player.y-player.faceY*80;
      enemy.windup={x,y,at:game.time+.45};
      enemy.behaviorAt=game.time+4;
      addMotion('mirror-blink',x,y,100,0,100,.45);
      break;
    }
    case 'buff':
      enemy.behaviorAt=game.time+1.1;
      addMotion('millefeuille-buff',enemy.x,enemy.y,240);
      break;
  }
  return false;
}
