import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import { DrawSimulation, initializePhysics, MODEL_VERSION, randomGenerator } from '../src/physics.ts';
await initializePhysics();
const count = Number(process.env.DRAW_TEST_COUNT || 12);
const offset=Number(process.env.DRAW_TEST_OFFSET||0);
let totalTicks = 0; const results = [];
for (let i = offset; i < count; i++) {
  const special=[0,1,4294967295,42];
  const seed=i<12?14021+i*193:i<16?special[i-12]:Math.floor(randomGenerator(723145+i)()*4294967296);
  const sim = new DrawSimulation(seed); sim.start();
  while (!['complete', 'failed'].includes(sim.phase)) sim.step();
  const s = sim.snapshot(); results.push({ seed: sim.seed, phase: s.phase, seconds: Number((s.tick / 120).toFixed(2)), events: s.events, error: s.error }); sim.free();
  assert.equal(s.phase, 'complete', JSON.stringify(results.at(-1)));
  const red = s.events.filter(e => e.color === 'red'), blue = s.events.filter(e => e.color === 'blue');
  assert.equal(red.length, 6); assert.equal(new Set(red.map(e => e.number)).size, 6); assert.equal(blue.length, 1);
  assert(red.every(e => e.number >= 1 && e.number <= 33)); assert(blue[0].number >= 1 && blue[0].number <= 16); assert(blue[0].tick > red[5].tick);
  totalTicks += s.tick;
  console.log(`Draw ${i+1}/${count}: ${s.tick/120}s, ${s.events.map(e=>e.number).join(',')}`);
}
const a = new DrawSimulation(9821), b = new DrawSimulation(9821); a.start(); b.start();
for (let i = 0; i < 1500; i++) { a.step(); b.step(); }
assert.deepEqual(a.snapshot(), b.snapshot(), 'Fixed input must replay identically'); a.free(); b.free();
const report={ model: MODEL_VERSION, passed: count-offset, averageSeconds: totalTicks / (count-offset) / 120, replay: 'pass', results };
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/physics-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({model:MODEL_VERSION,passed:report.passed,averageSeconds:report.averageSeconds,replay:'pass',report:'artifacts/physics-report.json'}));
