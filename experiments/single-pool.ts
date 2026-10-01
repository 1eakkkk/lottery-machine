import RAPIER from '@dimforge/rapier3d-compat';
import {Chamber,DT,randomGenerator,TRAY} from '../src/physics';
export const POOL_RULES={qlc:{count:30,draw:8,airflow:false},kl8:{count:80,draw:20,airflow:true}} as const;
export type PoolGame=keyof typeof POOL_RULES;
/** Development-only pools: seven basic plus one special ball from the same pool,
 * and a dense 80-ball chamber with a longer physical receiving lane. */
export class SinglePoolPrototype {
  world=new RAPIER.World({x:0,y:-9.81,z:0});chamber:Chamber;
  tick=0;phase:'running'|'complete'|'failed'='running';error?:string;private phaseOffset:number;
  constructor(public seed:number,public game:PoolGame) {
    this.world.timestep=DT;this.world.numSolverIterations=8;
    const config=POOL_RULES[game],rng=randomGenerator(seed);this.phaseOffset=rng()*6;
    const tray=game==='kl8'?{...TRAY,centerX:-1.7,halfLength:2.1,slope:.04,y:.70}:TRAY;
    this.chamber=new Chamber(this.world,'red',0,config.count,rng,config.airflow,tray);
    if(game==='kl8') {
      // Pack all 80 balls inside the volume without initial overlap; assign slots
      // by seed so identifiers cannot correlate with a fixed spatial location.
      const slots=Array.from({length:80},(_,i)=>i);
      for(let i=79;i>0;i--){const j=Math.floor(rng()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
      this.chamber.balls.forEach((ball,i)=>{const slot=slots[i];ball.body.setTranslation({x:(slot%5-2)*.18,y:2.7+(Math.floor(slot/20)-1.5)*.18,z:(Math.floor(slot/5)%4-1.5)*.18},true);});
    }
  }
  step() {
    if(this.phase!=='running') return;
    this.tick++;const c=this.chamber,target=POOL_RULES[this.game].draw;
    c.drive(this.tick,this.tick>=240&&c.events.length<target,this.phaseOffset);
    if(this.tick>=960&&this.tick>=c.nextOpen&&c.lockTick<0&&c.events.length<target)c.setGate(true);
    c.advanceLock(this.tick);this.world.step();c.readCrossings(this.tick);
    if(c.events.length===target&&this.tick>=c.events.at(-1)!.tick+240)this.phase='complete';
    if(c.events.length>target)this.fail('Extra ball crossed the extraction gate');
    for(const ball of c.balls){const p=ball.body.translation();if(!Number.isFinite(p.y)||(!ball.selected&&(p.y<1.5||p.y>4||Math.abs(p.x)>1.3||Math.abs(p.z)>1.3)))this.fail('Pool chamber boundary violation');}
    if(this.tick>120*300)this.fail('Pool extraction timeout');
  }
  private fail(message:string){this.phase='failed';this.error=message;}
  snapshot() {
    return {seed:this.seed,game:this.game,tick:this.tick,phase:this.phase,error:this.error,
      events:this.chamber.events.map((e,i)=>({number:e.number,tick:e.tick,role:this.game==='qlc'&&i===7?'特别号':'基本号'})),
      balls:this.chamber.balls.map(b=>({number:b.number,position:b.body.translation(),rotation:b.body.rotation(),selected:b.selected})),
    };
  }
  free(){this.world.free();}
}
