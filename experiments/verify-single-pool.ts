import assert from 'node:assert/strict';
import {initializePhysics,PORT_Z,BALL_RADIUS} from '../src/physics';
import {SinglePoolPrototype,POOL_RULES,type PoolGame} from './single-pool';
await initializePhysics();
const game=(process.argv[2]==='kl8'?'kl8':'qlc') as PoolGame;
const a=new SinglePoolPrototype(42,game),b=new SinglePoolPrototype(42,game);
while(a.phase==='running'){a.step();b.step();}
const s=a.snapshot(),rules=POOL_RULES[game];assert.equal(s.phase,'complete',s.error);assert.deepEqual(s,b.snapshot());
assert.equal(s.events.length,rules.draw);assert.equal(new Set(s.events.map(e=>e.number)).size,rules.draw);
assert(s.events.every(e=>e.number>=1&&e.number<=rules.count));
if(game==='qlc'){assert(s.events.slice(0,7).every(e=>e.role==='基本号'));assert.equal(s.events[7].role,'特别号');}
for(const ball of s.balls.filter(b=>b.selected)) {
  assert(Math.abs(ball.position.z-PORT_Z)<a.chamber.tray.halfWidth-BALL_RADIUS+.004);
  assert(ball.position.x>a.chamber.tray.centerX-a.chamber.tray.halfLength&&ball.position.x<a.chamber.tray.centerX+a.chamber.tray.halfLength);
}
console.log(JSON.stringify({game,seed:42,numbers:s.events.map(e=>e.number),seconds:s.tick/120,replay:'pass',status:'prototype-only'}));a.free();b.free();
