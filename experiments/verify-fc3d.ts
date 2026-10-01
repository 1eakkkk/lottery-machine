import assert from 'node:assert/strict';
import {initializePhysics} from '../src/physics';
import {DigitDrawPrototype,FC3D_MODEL} from './fc3d';
await initializePhysics();
for(const seed of [0,42,9821,14021]) {
  const a=new DigitDrawPrototype(seed),b=new DigitDrawPrototype(seed);
  while(a.phase==='running'){a.step();b.step();}
  const s=a.snapshot();assert.equal(s.phase,'complete',s.error);assert.deepEqual(s,b.snapshot());
  assert.deepEqual(s.events.map(e=>e.zone),['百位','十位','个位']);
  assert(s.events.every(e=>Number.isInteger(e.digit)&&e.digit>=0&&e.digit<=9));
  assert(s.events[0].tick<s.events[1].tick&&s.events[1].tick<s.events[2].tick);
  assert(s.balls.every(group=>new Set(group.map(b=>b.digit)).size===10));
  console.log(JSON.stringify({model:FC3D_MODEL,seed,result:s.events.map(e=>e.digit).join(''),seconds:s.tick/120,replay:'pass'}));
  a.free();b.free();
}
