import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import { DrawSimulation, initializePhysics, randomGenerator, TRAY, PORT_Z, BALL_RADIUS, blowerGain } from '../src/physics.ts';
import { receivingTray } from '../src/games.ts';
import { GAMES } from '../src/games.ts';
await initializePhysics();
const game=process.argv[2]==='dlt'?'dlt':'ssq',config=GAMES[game];
const tray=receivingTray(game),portZ=game==='dlt'?0:PORT_Z;
const count = Number(process.env.DRAW_TEST_COUNT || 12);
const offset=Number(process.env.DRAW_TEST_OFFSET||0);
if(game==='dlt'){assert.equal(blowerGain(0,true),0);assert(blowerGain(3,true)<blowerGain(6,true));assert(blowerGain(6,true)<blowerGain(10,true));assert.equal(blowerGain(10,true),1);}
let totalTicks = 0; const results = [];let firstSnapshot;
for (let i = offset; i < count; i++) {
  const special=[0,1,4294967295,42];
  const seed=i<12?14021+i*193:i<16?special[i-12]:Math.floor(randomGenerator(723145+i)()*4294967296);
  const sim = new DrawSimulation(seed,game); sim.start();
  if(game==='dlt')assert(sim.snapshot().balls.filter((_,j)=>j%8===1).every(y=>y>=3.57),'Both complete ball sets must wait in the peripheral loading rack');
  let rearReleased=false;
  const outerRoute=new Set<string>();
  while (!['complete', 'failed'].includes(sim.phase)) {
    sim.step();
    if(game==='dlt') {
      assert(sim.chambers[0].events.every(e=>e.tick>=1920),'Do not capture while loading or ramping the blower');
      if(!sim.blueStart||sim.tick<sim.blueStart)assert(sim.chambers[1].balls.every(b=>b.body.translation().y>=3.57),'Rear balls must wait until the front draw finishes');
      else rearReleased=true;
      for(const chamber of sim.chambers){
        const wheel=chamber.wheel!;assert(wheel.events.length<=wheel.quota,'Never collect beyond the zone quota');
        if(wheel.events.length===wheel.quota)assert(!wheel.accepting&&wheel.gate.isEnabled(),'Close intake immediately at quota');
      }
      for(const chamber of sim.chambers)for(const ball of chamber.balls){
        const p=ball.body.translation();
        if(ball.selected&&p.x-chamber.offset<-.95&&p.y>2&&p.y<3.4)outerRoute.add(`${chamber.color}:${ball.number}`);
      }
    }
  }
  if(game==='dlt'&&sim.phase==='complete')for(const chamber of sim.chambers){
    const wheel=chamber.wheel!;assert(wheel.drained,'Every occupied pocket must drain before completion');
    assert.deepEqual(wheel.released,chamber.events.map(e=>e.number),'Quarter-turn drainage preserves capture order');
    assert.equal(wheel.quarter,wheel.quota+1,'Continue one extra turn after the last captured ball leaves the top');
    assert(wheel.pockets.every(p=>!p.ball),'No ball remains in any pocket');
  }
  const s = sim.snapshot(); results.push({ seed: sim.seed, phase: s.phase, seconds: Number((s.tick / 120).toFixed(2)), events: s.events, error: s.error }); sim.free();
  assert.equal(s.phase, 'complete', JSON.stringify(results.at(-1)));
  if(game==='dlt')assert(rearReleased,'Rear machine must release its own loading rack');
  if(game==='dlt')assert(s.events.every(e=>outerRoute.has(`${e.color}:${e.number}`)),'Every drawn ball must physically traverse the exterior left route');
  firstSnapshot??=s;
  const red = s.events.filter(e => e.color === 'red'), blue = s.events.filter(e => e.color === 'blue');
  assert.equal(red.length, config.draws[0]); assert.equal(new Set(red.map(e => e.number)).size, config.draws[0]); assert.equal(blue.length, config.draws[1]);assert.equal(new Set(blue.map(e=>e.number)).size,config.draws[1]);
  assert(red.every(e => e.number >= 1 && e.number <= config.counts[0])); assert(blue.every(e=>e.number>=1&&e.number<=config.counts[1])); assert(blue[0].tick > red.at(-1)!.tick);
  let previousX = -Infinity;
  for (const event of s.events) {
    const offset=event.color==='red'?-1.45:1.45;
    const j=((event.color==='red'?0:config.counts[0])+event.number-1)*8;
    const [x,y,z]=s.balls.slice(j,j+3);
    assert(Math.abs(z-portZ)<tray.halfWidth-BALL_RADIUS+.004,'Selected ball must stay in the single-file lane');
    assert(x-offset>tray.centerX-tray.halfLength&&x-offset<tray.centerX+tray.halfLength,'Selected ball must stay between lane end stops');
    const restY=tray.y+(x-offset-tray.centerX)*Math.tan(tray.slope)+(.025+BALL_RADIUS)/Math.cos(tray.slope);
    assert(Math.abs(y-restY)<.02,'Selected ball must rest on the tray floor, below its cover');
    if(event.color==='red') {
      assert(x>previousX+BALL_RADIUS*1.7,'Red balls must retain extraction order along the lane');
      previousX=x;
    }
  }
  totalTicks += s.tick;
    console.log(`${game} draw ${i+1}/${count}: ${s.tick/120}s, ${s.events.map(e=>e.number).join(',')}`);
}
const a = new DrawSimulation(9821,game), b = new DrawSimulation(9821,game); a.start(); b.start();
for (let i = 0; i < 1500; i++) { a.step(); b.step(); }
assert.deepEqual(a.snapshot(), b.snapshot(), 'Fixed input must replay identically'); a.free(); b.free();
const replay=new DrawSimulation(firstSnapshot!.seed,game);replay.start();while(!['complete','failed'].includes(replay.phase))replay.step();assert.deepEqual(replay.snapshot(),firstSnapshot,'A complete draw must replay identically');replay.free();
const report={ model: config.model, passed: count-offset, averageSeconds: totalTicks / (count-offset) / 120, replay: 'pass', results };
mkdirSync('artifacts',{recursive:true});const reportPath=process.env.DRAW_REPORT_PATH||`artifacts/${game}-physics-report.json`;writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({model:config.model,passed:report.passed,averageSeconds:report.averageSeconds,replay:'pass',report:reportPath}));
