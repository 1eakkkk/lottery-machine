import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import { DrawSimulation, initializePhysics, randomGenerator, TRAY, PORT_Z, BALL_RADIUS } from '../src/physics.ts';
import { GAMES, gameId } from '../src/games.ts';
await initializePhysics();
const game=gameId(process.argv[2]??null),config=GAMES[game];
const count = Number(process.env.DRAW_TEST_COUNT || 12);
const offset=Number(process.env.DRAW_TEST_OFFSET||0);
let totalTicks = 0; const results = [];let firstSnapshot;
for (let i = offset; i < count; i++) {
  const special=[0,1,4294967295,42];
  const seed=i<12?14021+i*193:i<16?special[i-12]:Math.floor(randomGenerator(723145+i)()*4294967296);
  const sim = new DrawSimulation(seed,game); sim.start();
  while (!['complete', 'failed'].includes(sim.phase)) sim.step();
  const s = sim.snapshot(); results.push({ seed: sim.seed, phase: s.phase, seconds: Number((s.tick / 120).toFixed(2)), events: s.events, error: s.error }); sim.free();
  assert.equal(s.phase, 'complete', JSON.stringify(results.at(-1)));
  firstSnapshot??=s;
  const red = s.events.filter(e => e.color === 'red'), blue = s.events.filter(e => e.color === 'blue');
  assert.equal(red.length, config.draws[0]); assert.equal(new Set(red.map(e => e.number)).size, config.draws[0]); assert.equal(blue.length, config.draws[1]);assert.equal(new Set(blue.map(e=>e.number)).size,config.draws[1]);
  assert(red.every(e => e.number >= 1 && e.number <= config.counts[0])); assert(blue.every(e=>e.number>=1&&e.number<=config.counts[1])); assert(blue[0].tick > red.at(-1)!.tick);
  let previousX = -Infinity;
  for (const event of s.events) {
    const offset=event.color==='red'?-1.45:1.45;
    const j=((event.color==='red'?0:config.counts[0])+event.number-1)*8;
    const [x,y,z]=s.balls.slice(j,j+3);
    assert(Math.abs(z-PORT_Z)<TRAY.halfWidth-BALL_RADIUS+.004,'Selected ball must stay in the single-file lane');
    assert(x-offset>TRAY.centerX-TRAY.halfLength&&x-offset<TRAY.centerX+TRAY.halfLength,'Selected ball must stay between lane end stops');
    assert(y>.5&&y<1,'Selected ball must rest on the receiving tray');
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
mkdirSync('artifacts',{recursive:true});const reportPath=`artifacts/${game}-physics-report.json`;writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({model:config.model,passed:report.passed,averageSeconds:report.averageSeconds,replay:'pass',report:reportPath}));
