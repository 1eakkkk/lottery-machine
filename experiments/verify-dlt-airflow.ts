import assert from 'node:assert/strict';
import { initializePhysics } from '../src/physics';
import { AirflowMixingPrototype, DLT_RULES } from './dlt-airflow';

await initializePhysics();
for (const zone of ['front', 'rear'] as const) for (const seed of [0, 42, 9821]) {
  const a = new AirflowMixingPrototype(seed, zone), b = new AirflowMixingPrototype(seed, zone);
  let highest = -1;
  for (let step = 0; step < 1200; step++) {
    a.step(); b.step();
    for (const ball of a.snapshot().balls) highest = Math.max(highest, ball.position.y);
  }
  assert.equal(a.balls.length, DLT_RULES[zone].count);
  assert.equal(new Set(a.balls.map(ball => ball.number)).size, DLT_RULES[zone].count);
  assert(highest > .2, 'Air jet must lift balls into the upper chamber');
  assert.deepEqual(a.snapshot(), b.snapshot(), 'Prototype must reproduce the same physical state');
  console.log(JSON.stringify({ zone, seed, seconds: 10, highest, status: 'mixing-and-replay-pass' }));
  a.free(); b.free();
}
