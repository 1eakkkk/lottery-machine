import assert from 'node:assert/strict';
import { DrawSimulation, initializePhysics, MODEL_VERSION } from '../src/physics.ts';
await initializePhysics();
const count = Number(process.env.DRAW_TEST_COUNT || 12);
let totalTicks = 0; const results = [];
for (let i = 0; i < count; i++) {
  const sim = new DrawSimulation(14021 + i * 193); sim.start();
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
console.log(JSON.stringify({ model: MODEL_VERSION, passed: count, averageSeconds: totalTicks / count / 120, replay: 'pass', results }, null, 2));
