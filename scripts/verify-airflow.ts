import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Chamber,CENTER_Y,DT,initializePhysics,randomGenerator} from '../src/physics';

await initializePhysics();
const reports=[];
for(const count of [10,12,35])for(const seed of [0,1,42,4294967295]) {
  const worlds=['red','blue'].map(()=>{const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=DT;world.numSolverIterations=8;return world;});
  const chambers=worlds.map((world,i)=>new Chamber(world,i?'blue':'red',0,count,randomGenerator(seed),true));
  const heights:number[]=[],maxima=Array<number>(count).fill(-Infinity);
  try {
    for(let tick=1;tick<=960;tick++) {
      chambers.forEach((c,i)=>{c.drive(tick,tick>=240,1);worlds[i].step();});
      if(tick>=480)chambers[0].balls.forEach((ball,i)=>{
        const p=ball.body.translation();
        assert(Number.isFinite(p.y)&&p.y<4&&p.y>1.9,'Airflow must keep balls inside the closed chamber');
        maxima[i]=Math.max(maxima[i],p.y);heights.push(p.y);
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
mkdirSync('artifacts',{recursive:true});
writeFileSync('artifacts/airflow-circulation-report.json',JSON.stringify({reports},null,2));
console.log(`Airflow circulation: ${reports.length} chamber scenarios passed, including color independence, upper-chamber coverage and bounds.`);
