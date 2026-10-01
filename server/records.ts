import { GAMES, type GameId, eventZone } from '../src/games';
import type { DrawEvent } from '../src/physics';
export interface SavedDraw { id: string; game: GameId; seed: number; model: string; date: string; events: DrawEvent[] }
export function validateDraw(value: unknown): SavedDraw | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as SavedDraw;
  if (typeof r.game !== 'string' || !Object.hasOwn(GAMES, r.game)) return;
  const g = GAMES[r.game];
  if (typeof r.id !== 'string' || !/^[\w-]{8,100}$/.test(r.id) || r.model !== g.model ||
    !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff || typeof r.date !== 'string' ||
    !Number.isFinite(Date.parse(r.date)) || Date.parse(r.date) > Date.now() + 300000 ||
    !Array.isArray(r.events) || r.events.length !== g.draws.reduce((a,b) => a+b,0)) return;
  let tick = -1;
  const counts = g.draws.map(() => 0), seen = new Set<string>();
  const events: DrawEvent[] = [];
  for (let i=0;i<r.events.length;i++) {
    const e = r.events[i];
    if (!e || typeof e !== 'object' || !['red','blue'].includes(e.color) ||
      !Number.isInteger(e.number) || !Number.isInteger(e.tick) || e.tick <= tick || e.tick > 1000000 ||
      (e.zone !== undefined && !Number.isInteger(e.zone)) ||
      (e.special !== undefined && typeof e.special !== 'boolean') ||
      (r.game==='qlc' && e.zone!==undefined && e.zone!==0)) return;
    const zone = r.game==='qlc' ? 0 : eventZone(e), special = r.game === 'qlc' && i === 7;
    const expectedZone=g.draws.findIndex((_,z)=>i<g.draws.slice(0,z+1).reduce((a,b)=>a+b,0));
    if (zone !== expectedZone || ++counts[zone] > g.draws[zone] ||
      e.number < (r.game === 'fc3d' ? 0 : 1) || e.number > (r.game === 'fc3d' ? 9 : g.counts[zone]) ||
      e.color !== (special || zone>0 ? 'blue' : 'red') || Boolean(e.special) !== special || seen.has(`${zone}:${e.number}`)) return;
    seen.add(`${zone}:${e.number}`); tick=e.tick;
    events.push({ color: e.color, number: e.number, tick: e.tick, zone, ...(special ? {special:true}: {}) });
  }
  if (counts.some((n,i) => n !== g.draws[i])) return;
  return { id:r.id, game:r.game, seed:r.seed, model:r.model, date:new Date(r.date).toISOString(), events };
}
