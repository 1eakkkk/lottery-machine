import {GAMES,eventZone,type GameId} from './games';
import type {DrawEvent} from './physics';
export function orderedEvents(game:GameId,events:DrawEvent[],sorted:boolean) {
  if(game==='fc3d'||!sorted)return [...events];
  if(game==='qlc')return [...events.filter(e=>!e.special).sort((a,b)=>a.number-b.number),...events.filter(e=>e.special)];
  return [...events].sort((a,b)=>eventZone(a)-eventZone(b)||a.number-b.number);
}
export function resultText(game:GameId,events:DrawEvent[],sorted=false) {
  const list=orderedEvents(game,events,sorted),pad=(n:number)=>String(n).padStart(2,'0');
  if(game==='fc3d')return list.map(e=>e.number).join('');
  if(game==='qlc')return list.filter(e=>!e.special).map(e=>pad(e.number)).join(' ')+' + 特别号 '+list.filter(e=>e.special).map(e=>pad(e.number)).join(' ');
  return GAMES[game].counts.length===1?list.map(e=>pad(e.number)).join(' '):GAMES[game].zones.map((_,i)=>list.filter(e=>eventZone(e)===i).map(e=>pad(e.number)).join(' ')).join(' + ');
}
