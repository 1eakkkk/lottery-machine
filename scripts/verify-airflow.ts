import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Chamber,CENTER_Y,FLOOR_Y,BALL_RADIUS,DT,initializePhysics,randomGenerator} from '../src/physics';

await initializePhysics();
// Frozen v2 field for a paired energy regression, never used by the production worker.
function legacyDrive(c:Chamber,tick:number,moving:boolean,phase:number) {
  for(const ball of c.balls) {
    const body=ball.body;body.resetForces(true);
    if(!moving||ball.selected)continue;
    const p=body.translation();if(p.y<FLOOR_Y)continue;
    const x=p.x-c.offset,y=p.y-CENTER_Y,z=p.z,seconds=tick*DT;
    const height=Math.max(0,Math.min(1,(y+.76)/1.84)),jet=Math.exp(-(x*x+z*z)/(.18+.42*height)),circulation=7*(y+.20),swirl=2.7;
    const v=body.linvel(),dx=circulation*x-swirl*z+1.4*Math.sin(z*7+seconds*3.7+phase)-v.x,
      dy=11*jet-1.5+1.2*Math.sin(x*6-z*5+seconds*4.1+phase)-v.y,
      dz=circulation*z+swirl*x+1.4*Math.sin(x*8-seconds*3.3+phase)-v.z;
    const drag=.5*1.225*.47*Math.PI*BALL_RADIUS**2*Math.hypot(dx,dy,dz);
    body.addForce({x:drag*dx,y:drag*dy,z:drag*dz},true);
  }
}
const reports=[];
let energy=0,legacyEnergy=0;
for(const count of [10,12,35])for(const seed of [0,1,42,4294967295]) {
  const worlds=['red','blue','baseline'].map(()=>{const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=DT;world.numSolverIterations=8;return world;});
  const chambers=worlds.map((world,i)=>new Chamber(world,i===1?'blue':'red',0,count,randomGenerator(seed),true));
  const heights:number[]=[],maxima=Array<number>(count).fill(-Infinity);
  try {
    for(let tick=1;tick<=960;tick++) {
      chambers.forEach((c,i)=>{if(i===2)legacyDrive(c,tick,tick>=240,1);else c.drive(tick,tick>=240,1);worlds[i].step();});
      if(tick>=480)chambers[0].balls.forEach((ball,i)=>{
        const p=ball.body.translation();
        assert(Number.isFinite(p.y)&&p.y<4&&p.y>1.9,'Airflow must keep balls inside the closed chamber');
        maxima[i]=Math.max(maxima[i],p.y);heights.push(p.y);
        const v=ball.body.linvel(),old=chambers[2].balls[i].body.linvel();
        energy+=v.x*v.x+v.y*v.y+v.z*v.z;
        legacyEnergy+=old.x*old.x+old.y*old.y+old.z*old.z;
      });
    }
    assert.deepEqual(chambers[0].balls.map(b=>b.body.translation()),chambers[1].balls.map(b=>b.body.translation()),'Paint color must not change blower strength');
    heights.sort((a,b)=>a-b);
    const upperFraction=heights.filter(y=>y>CENTER_Y).length/heights.length;
    const upperReach=maxima.filter(y=>y>CENTER_Y+.25).length/count;
    const p90=heights[Math.floor(heights.length*.9)];
    assert(upperFraction>.25&&upperFraction<.75,`Poor circulation for ${count} balls, seed ${seed}: ${upperFraction}`);
    assert(p90>CENTER_Y+.4,`Jet does not reach upper chamber: ${count} balls, seed ${seed}`);
    assert(upperReach>=.7,`Too many balls remain near the floor: ${count} balls, seed ${seed}`);
    reports.push({count,seed,upperFraction,upperReach,p90});
  }finally{worlds.forEach(world=>world.free());}
}
assert(energy/legacyEnergy<.85,`Mixing energy was not reduced enough: ${energy/legacyEnergy}`);
mkdirSync('artifacts',{recursive:true});
writeFileSync('artifacts/airflow-circulation-report.json',JSON.stringify({reports,energyRatio:energy/legacyEnergy},null,2));
console.log(`Airflow circulation: ${reports.length} chamber scenarios passed, including color independence, upper-chamber coverage and bounds; kinetic energy ratio ${(energy/legacyEnergy).toFixed(3)} against v2.`);
