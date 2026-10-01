import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initializePhysics,PORT_Z,BALL_RADIUS} from '../src/physics';
import {ExtendedSimulation} from '../src/extended-physics';
import {GAMES,eventZone,receivingTray,type GameId} from '../src/games';
import {resultText,orderedEvents} from '../src/results';
await initializePhysics();
assert.equal(resultText('fc3d',[0,0,7].map((number,zone)=>({number,zone,color:'red',tick:zone})),true),'007');
for(const game of (process.argv[2]?[process.argv[2]]:['fc3d','qlc','kl8']) as GameId[]) {
  const reports=[];let first;
  const count=Number(process.env.EXTENDED_TEST_COUNT||6),config=GAMES[game],tray=receivingTray(game);
  for(const seed of [0,1,42,4294967295,14021,9821,14214,14407,14600,14793,14986,15179].slice(0,count)) {
    const sim=new ExtendedSimulation(seed,game);assert.equal(sim.snapshot().phase,'ready');sim.start();
    while(!['complete','failed'].includes(sim.phase))sim.step();
    const s=sim.snapshot();sim.free();assert.equal(s.phase,'complete',JSON.stringify(s.events)+' '+s.error);
    assert.equal(s.events.length,config.draws.reduce((a,b)=>a+b,0));
    if(game==='fc3d'){assert.deepEqual(s.events.map(e=>e.zone),[0,1,2]);assert(s.events.every(e=>e.number>=0&&e.number<=9));}
    else {assert.equal(new Set(s.events.map(e=>e.number)).size,s.events.length);assert(s.events.every(e=>e.number>=1&&e.number<=config.counts[0]));}
    if(game==='qlc') {assert.deepEqual(s.events.map(e=>e.special),[false,false,false,false,false,false,false,true]);assert.equal(orderedEvents(game,s.events,true).at(-1)?.number,s.events.at(-1)?.number);}
    let previous=-Infinity;
    for(const event of s.events) {
      const zone=eventZone(event),j=(config.counts.slice(0,zone).reduce((a,b)=>a+b,0)+event.number-(game==='fc3d'?0:1))*8;
      const [x,y,z]=s.balls.slice(j,j+3);
      assert(Math.abs(z-PORT_Z)<tray.halfWidth-BALL_RADIUS+.004,'Ball escaped single-file tray');
      assert(x-config.offsets[zone]>tray.centerX-tray.halfLength&&x-config.offsets[zone]<tray.centerX+tray.halfLength,'Ball escaped tray ends');
      assert(y>.4&&y<1.2,'Ball not resting on tray');
      if(game!=='fc3d'){assert(x>previous+BALL_RADIUS*1.6,`Extraction order lost: ${game} seed ${seed}, number ${event.number}, x ${x}, previous ${previous}`);previous=x;}
    }
    first??=s;reports.push({seed,seconds:s.tick/120,events:s.events});
    console.log(`${game} seed ${seed}: complete ${s.tick/120}s ${resultText(game,s.events)}`);
  }
  const replay=new ExtendedSimulation(first!.seed,game);replay.start();while(!['complete','failed'].includes(replay.phase))replay.step();assert.deepEqual(replay.snapshot(),first,'Full physical replay diverged');replay.free();
  mkdirSync('artifacts',{recursive:true});writeFileSync(`artifacts/${game}-physics-report.json`,JSON.stringify({model:config.model,passed:reports.length,replay:'pass',reports},null,2));
  writeFileSync(`artifacts/${game}-complete.json`,JSON.stringify(first));
}
