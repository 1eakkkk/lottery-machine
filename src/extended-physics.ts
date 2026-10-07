import RAPIER from '@dimforge/rapier3d-compat';
import {Chamber,DT,randomGenerator,DrawSimulation,type Phase,type Snapshot} from './physics';
import {GAMES,receivingTray,type GameId} from './games';
export class ExtendedSimulation {
  world=new RAPIER.World({x:0,y:-9.81,z:0});chambers:Chamber[];
  tick=0;phase:Phase='ready';active=0;zoneStart=240;gateAt=960;error?:string;private phaseOffset:number;
  constructor(public seed:number,public game:GameId) {
    this.world.timestep=DT;this.world.numSolverIterations=8;
    const rng=randomGenerator(seed),config=GAMES[game];this.phaseOffset=rng()*6;
    this.chambers=config.offsets.map((x,i)=>new Chamber(this.world,game==='fc3d'?'blue':'red',x,config.counts[i],rng,config.mixing==='airflow',receivingTray(game),config.mixing==='mechanical'?6:8));
    if(game==='kl8') {
      const slots=Array.from({length:80},(_,i)=>i);
      for(let i=79;i>0;i--){const j=Math.floor(rng()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
      this.chambers[0].balls.forEach((b,i)=>{const s=slots[i];b.body.setTranslation({x:(s%5-2)*.18,y:2.7+(Math.floor(s/20)-1.5)*.18,z:(Math.floor(s/5)%4-1.5)*.18},true);});
    }
  }
  start(){if(this.phase==='ready')this.phase='loading';}
  step() {
    if(['ready','complete','failed'].includes(this.phase))return;
    this.tick++;const config=GAMES[this.game];
    this.phase=this.tick<240?'loading':this.tick<960?'mixing':(['red','blue','third'] as const)[this.active];
    this.chambers.forEach((c,i)=>{
      c.drive(this.game==='fc3d'?Math.max(0,this.tick-this.zoneStart):this.tick,i===this.active&&this.tick>=this.zoneStart&&c.events.length<config.draws[i],this.phaseOffset+i);
      if(i===this.active&&this.tick>=this.gateAt&&this.tick>=c.nextOpen&&c.lockTick<0&&c.events.length<config.draws[i])c.setGate(true);
      c.advanceLock(this.tick);
    });
    this.world.step();this.chambers.forEach(c=>c.readCrossings(this.tick));
    const current=this.chambers[this.active];
    if(this.game==='kl8'&&current.events.length)current.nextOpen=Math.max(current.nextOpen,current.events.at(-1)!.tick+480);
    if(current.events.length===config.draws[this.active]&&this.tick>=current.events.at(-1)!.tick+(this.game==='kl8'?480:240)){
      if(this.active===this.chambers.length-1)this.phase='complete';
      else{this.active++;this.zoneStart=this.tick;this.gateAt=this.tick+720;this.phase=(['red','blue','third'] as const)[this.active];}
    }
    for(const [i,c]of this.chambers.entries()) {
      if(c.events.length>config.draws[i])this.fail('出球阀检测到额外球体，请重新开始。');
      for(const b of c.balls){const p=b.body.translation();if(!Number.isFinite(p.y)||(!b.selected&&(p.y<1.5||p.y>4||Math.abs(p.x-c.offset)>1.3||Math.abs(p.z)>1.3)))this.fail('球体超出机器边界，请重新开始。');}
    }
    if(this.tick>120*300)this.fail('出球超时，请重新开始。');
  }
  private fail(message:string){this.phase='failed';this.error=message;this.chambers.forEach(c=>c.setGate(false));}
  snapshot():Snapshot {
    return {seed:this.seed,tick:this.tick,phase:this.phase,error:this.error,activeZone:this.active,
      gate:this.chambers.map(c=>c.open),outlet:this.chambers.map(c=>c.outletOpen),
      rotorRotations:this.chambers.map(c=>c.rotors.flatMap(r=>{const q=r.rotation();return[q.x,q.y,q.z,q.w];})),
      events:this.chambers.flatMap((c,i)=>c.events.map((e,j)=>({...e,number:this.game==='fc3d'?e.number-1:e.number,zone:i,color:(this.game==='qlc'&&j===7)||i>0?'blue' as const:'red' as const,special:this.game==='qlc'&&j===7}))),
      balls:this.chambers.flatMap(c=>c.balls.flatMap(b=>{const p=b.body.translation(),q=b.body.rotation();return[p.x,p.y,p.z,q.x,q.y,q.z,q.w,b.selected?1:0];})),
    };
  }
  free(){this.world.free();}
}
export function createSimulation(seed:number,game:GameId){return game==='ssq'||game==='dlt'?new DrawSimulation(seed,game):new ExtendedSimulation(seed,game);}
