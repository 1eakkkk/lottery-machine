import RAPIER from '@dimforge/rapier3d-compat';
import { Chamber, DT, randomGenerator } from '../src/physics';

export const FC3D_MODEL='fc3d-mechanical-prototype-v0';
export type DigitEvent={zone:'百位'|'十位'|'个位';digit:number;tick:number};
/** Three independent ten-ball chambers. Mechanical prototype, pending comparison
 * with the referenced broadcast equipment; not a published production machine. */
export class DigitDrawPrototype {
  world=new RAPIER.World({x:0,y:-9.81,z:0});
  chambers:Chamber[]; tick=0;active=0;zoneStart=240;gateAt=960;
  phase:'running'|'complete'|'failed'='running';error?:string;
  private phaseOffset:number;
  constructor(public seed:number) {
    this.world.timestep=DT;this.world.numSolverIterations=8;
    const rng=randomGenerator(seed);this.phaseOffset=rng()*6;
    this.chambers=[-2.9,0,2.9].map(x=>new Chamber(this.world,'red',x,10,rng));
  }
  step() {
    if(this.phase!=='running') return;
    this.tick++;
    this.chambers.forEach((c,index)=>{
      c.drive(Math.max(0,this.tick-this.zoneStart),index===this.active&&this.tick>=this.zoneStart&&c.events.length===0,this.phaseOffset+index);
      if(index===this.active&&c.events.length===0&&this.tick>=this.gateAt&&c.lockTick<0) c.setGate(true);
      c.advanceLock(this.tick);
    });
    this.world.step();this.chambers.forEach(c=>c.readCrossings(this.tick));
    const current=this.chambers[this.active];
    if(current.events.length&&this.tick>=current.events[0].tick+180) {
      if(this.active===2)this.phase='complete';
      else {this.active++;this.zoneStart=this.tick;this.gateAt=this.tick+720;}
    }
    for(const c of this.chambers) {
      if(c.events.length>1)this.fail('Multiple balls extracted in one digit chamber');
      for(const ball of c.balls){const p=ball.body.translation();if(!Number.isFinite(p.y)||(!ball.selected&&(p.y<1.5||p.y>4||Math.abs(p.x-c.offset)>1.3||Math.abs(p.z)>1.3)))this.fail('Digit chamber boundary violation');}
    }
    if(this.tick>120*180)this.fail('Digit extraction timeout');
  }
  private fail(message:string){this.phase='failed';this.error=message;}
  snapshot() {
    const names=['百位','十位','个位'] as const;
    return {seed:this.seed,tick:this.tick,phase:this.phase,error:this.error,
      events:this.chambers.flatMap((c,i)=>c.events.map(e=>({zone:names[i],digit:e.number-1,tick:e.tick}))),
      balls:this.chambers.map(c=>c.balls.map(b=>({digit:b.number-1,position:b.body.translation(),rotation:b.body.rotation(),selected:b.selected}))),
    };
  }
  free(){this.world.free();}
}
