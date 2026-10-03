import './style.css';
import './accounts.css';
import { MachineScene } from './scene';
import { DrawSoundscape } from './soundscape';
import { DT, randomGenerator, type Snapshot, type Phase, type DrawEvent } from './physics';
import { GAMES, gameId, eventZone } from './games';
import {orderedEvents,resultText} from './results';
import { Accounts } from './accounts';
const game=gameId(new URLSearchParams(location.search).get('game')), config=GAMES[game], MODEL_VERSION=config.model;
const total=config.draws.reduce((a,b)=>a+b,0), mixingLabel=config.mixing==='mechanical'?'机械搅拌':'气流混合';
const ruleLabel=game==='fc3d'?'百位 · 十位 · 个位':game==='qlc'?'7 + 1':game==='kl8'?'80 选 20':`${config.draws[0]} + ${config.draws[1]}`;
const ruleNote=game==='fc3d'?'三个独立 0—9 球仓 · 按位保留数字':game==='qlc'?'30 个号码球 · 第八球为特别号 · 不放回':game==='kl8'?'80 个号码球 · 抽取 20 个 · 不放回':`${config.counts[0]} 个${config.zones[0]}球 · ${config.counts[1]} 个${config.zones[1]}球 · 区内不放回`;
document.title=`一刻开奖 · ${config.title}物理模拟`;
document.body.classList.add(`game-${game}`);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = (n: number) => String(n).padStart(2, '0');
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/"><span class="brand-icon">7</span>一刻开奖</a><nav class="nav"><a class="current" href="#studio">开奖实验室</a><a href="#about">工作原理</a><a class="github-nav" href="https://github.com/1eakkkk/lottery-machine" target="_blank" rel="noopener">GitHub ↗</a></nav></header>
<main><section class="intro"><div><div class="eyebrow">THE MOMENT OF CHANCE</div><h1>让偶然，真实发生。</h1><p>启动一场${config.title}开奖，观察每一次碰撞如何成为结果。</p></div><span class="mode">${config.title} · ${ruleLabel}</span></section>
<nav class="game-picker" aria-label="选择玩法">${Object.entries(GAMES).map(([key,value])=>`<a href="?game=${key}#studio" ${game===key?'aria-current="page"':''}>${value.title}</a>`).join('')}<a href="/scratch/">刮刮乐 ↗</a><span>切换玩法会重新准备机器</span></nav><section class="studio" id="studio" aria-label="三维开奖实验室"><div class="studio-top"><span class="studio-label"><i id="run-indicator"></i><span id="studio-state">DRAWING LAB / 待机</span></span><span class="studio-meta" id="elapsed">00:00</span></div><div class="stage" id="stage"><div class="loading-overlay" id="loading"><span></span>正在准备三维机器与物理引擎…</div></div><div class="studio-bottom"><div class="views" role="group" aria-label="镜头选择"><button class="active" data-view="all">全景</button>${config.zones.map((zone,i)=>`<button data-view="${['red','blue','third'][i]}">${zone}机</button>`).join('')}<button data-view="tray">接球架</button><button class="hidden" id="result-view" data-view="results">结果</button></div><span class="studio-hint">拖动旋转 · 滚轮指向缩放 · 右键移动</span><div><button class="round-control" id="drag-mode" aria-pressed="false" title="切换为拖动移动观看位置">移动</button> <button class="round-control" id="sound" aria-pressed="true" title="背景音乐、机械音效与出球提示">声音：开</button> <button class="round-control" id="fullscreen">全屏</button></div></div></section>
<div class="progress" aria-label="开奖流程"><span data-phase="loading"><b>1</b>准备球组</span><em></em><span data-phase="mixing"><b>2</b>${mixingLabel}</span>${config.zones.map((zone,i)=>`<em></em><span data-phase="${['red','blue','third'][i]}"><b>${i+3}</b>${zone}出球</span>`).join('')}<em></em><span data-phase="complete"><b>${config.zones.length+3}</b>完成</span></div>
<section class="result-panel"><div><div class="result-head">本场模拟结果 <small id="result-order">按出球顺序</small></div><div class="numbers" id="numbers" aria-label="本场开奖号码"></div><div class="result-note"><span>${ruleNote}</span><button id="sort">切换为升序</button></div></div><div><div class="actions"><button class="primary" id="start" disabled>准备中…</button><button class="secondary hidden" id="pause">暂停</button><button class="secondary hidden" id="reset">重新开始</button><button class="secondary" id="copy" disabled>复制结果</button></div></div></section>
<p class="status-line" id="status" role="status" aria-live="polite">每次开奖独立运行，结果由球体通过出球口的物理过程产生。</p>
<section class="below"><div id="about"><h2 class="section-title">每一个号码，都经过一次碰撞。<small>01 / 原理</small></h2><p class="description">${config.description}</p><div class="legend">${config.zones.map((zone,i)=>`<span><i style="background:${config.colors[i]}"></i>${zone} ${game==='fc3d'?'0—9':`01—${config.counts[i]}`}</span>`).join('')}<span>三维刚体物理</span></div><details class="details"><summary>打开物理与回放详情</summary><dl><dt>物理引擎</dt><dd>Rapier 3D · WASM</dd><dt>模拟步长</dt><dd>1 / 120 秒</dd><dt>模型版本</dt><dd>${MODEL_VERSION}</dd><dt>本场种子</dt><dd id="seed-display">—</dd><dt>物理步数</dt><dd id="tick-display">0</dd><dt>出球事件</dt><dd id="event-display">等待开始</dd></dl><p>${config.mixing==='airflow'?'气流使用经验风速与阻力场，不是完整流体计算。':'依据双向机械搅拌原理制作。'}${game==='fc3d'?'官方同类气流机器采用顶部捕球；本版本使用底部实体阀与接球槽，尚未复刻顶部捕球结构。':''}出球通道与机器外观均为简化结构。内部部件与装球结构尚未按设备实测数据校准。物理运动不等于严格等概率，模拟不能预测实际开奖。</p><p><a href="${config.reference}" target="_blank" rel="noopener">查看设备原理介绍 ↗</a></p></details></div><div><h2 class="section-title">最近的偶然<small>02 / 本机记录</small></h2><div id="history"></div><p class="description" style="font-size:10px;margin-top:15px">记录保存在当前设备。回放使用相同种子与模型重新运行物理过程。</p></div></section></main>
<footer><span>1EAK / 一刻开奖 · 仅供模拟体验，与官方开奖无关联</span><span><a href="https://github.com/1eakkkk/lottery-machine" target="_blank" rel="noopener">源码公开</a> · 独立运行，无需登录</span></footer><div id="toast" class="toast hidden" role="status"></div>`;

const accountOpen=document.createElement('button');accountOpen.id='account-open';accountOpen.className='account-nav';accountOpen.textContent='登录 / 注册';
const accountLogout=document.createElement('button');accountLogout.id='account-logout';accountLogout.className='account-nav hidden';accountLogout.textContent='退出';
document.querySelector('.nav')!.append(accountOpen,accountLogout);
const saveRound=document.createElement('button');saveRound.id='save-round';saveRound.className='secondary hidden';document.querySelector('.actions')!.append(saveRound);
document.querySelector('#history')!.previousElementSibling!.querySelector('small')!.textContent='02 / 我的记录';
document.querySelector('#history')!.nextElementSibling!.textContent='登录后自动保存，每个玩法最多保留最近 100 场。回放使用相同种子与模型重现模拟。';
let accounts:Accounts;
let roundId=crypto.randomUUID();
let scene: MachineScene | undefined, snapshot: Snapshot | undefined, running = false, paused = false, busy = false, sorted = false, sound = true, recorded = false, replaying = false, fatalError=false, panMode=false;
let id = 0, blueStart = 0, seedPhase = 0, accumulator = 0, lastTime = performance.now(), lastEventCount = 0, previousPhase: Phase | undefined;
function selectView(name: string) {
  scene?.view(name);
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===name));
}
const soundscape = new DrawSoundscape(description => { el('sound').title = description; });
const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
const phases: Record<Phase, string> = { ready: '待机', loading: '准备球组', mixing: mixingLabel, red: `${config.zones[0]}出球`, blue: `${config.zones[1]??'特别号'}出球`, third:'个位出球', complete: '开奖完成', failed: '本场未完成' };
function toast(message: string) { el('toast').textContent = message; el('toast').classList.remove('hidden'); setTimeout(() => el('toast').classList.add('hidden'), 2500); }
function drawNumbers(events: DrawEvent[]) {
  const list=orderedEvents(game,events,sorted);
  const slots=Array.from({length:total},(_,i)=>{
    const event=list[i],zone=event?eventZone(event):0;
    const color=game==='qlc'&&event?.special?'#397abd':config.colors[zone];
    const label=event?(game==='fc3d'?String(event.number):pad(event.number)):'·';
    const title=game==='fc3d'?config.zones[i]:game==='qlc'&&i===7?'特别号':`第 ${i+1} 球`;
    return `<span class="number ${event?'red':''}" title="${title}" ${event?`style="background:${color};border-color:${color}"`:''}>${label}</span>`;
  });
  if(game==='ssq'||game==='dlt')slots.splice(config.draws[0],0,'<span class="divider"></span>');
  if(game==='qlc')slots.splice(7,0,'<span class="divider"></span>');
  el('numbers').innerHTML=slots.join('');
  el('numbers').style.gridTemplateColumns=game==='kl8'?'repeat(5,minmax(0,1fr))':game==='fc3d'?'repeat(3,minmax(0,1fr))':`repeat(${game==='qlc'?7:config.draws[0]},minmax(0,1fr)) 1px repeat(${game==='qlc'?1:config.draws[1]},minmax(0,1fr))`;
}
function renderHistory() {
  const list = el('history'); list.replaceChildren();
  if(!accounts || !accounts.renderHistoryIntro(list))return;
  const history=accounts.records;
  if (!history.length) { const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = '还没有记录。启动机器，留下第一场开奖。'; list.append(p); return; }
  for (const record of history) {
    const row = document.createElement('div'); row.className = 'history-item';
    const time = document.createElement('span'); time.className = 'history-time'; time.textContent = new Date(record.date).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const nums = document.createElement('span'); nums.className = 'history-numbers';
    if(game==='ssq'||game==='dlt'||game==='qlc') {
      const base=record.events.filter(e=>e.color==='red'),extra=record.events.filter(e=>e.color==='blue');
      nums.textContent=base.map(e=>pad(e.number)).join(' ');
      const special=document.createElement('strong');special.textContent=(game==='qlc'?'特别号 ':'')+extra.map(e=>pad(e.number)).join(' ');nums.append(special);
    } else nums.textContent=resultText(game,record.events);
    const replay = document.createElement('button'); replay.textContent = '回放';replay.disabled=record.model!==MODEL_VERSION;replay.title=replay.disabled?'此记录使用旧模型，仅支持查看号码。':'重现本场物理过程'; replay.addEventListener('click', () => { if (running) return toast('请先完成或重新开始当前场次。'); void soundscape.unlock(); initialize(record.seed, true); });
    row.append(time, nums, replay); list.append(row);
  }
}
function initialize(seed = crypto.getRandomValues(new Uint32Array(1))[0], replay = false) {
  roundId=crypto.randomUUID();accounts?.clearRound();
  soundscape.setState('idle'); soundscape.setSuspended(document.hidden);
  el('result-view').classList.add('hidden');scene?.view('all');document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('active',(e as HTMLElement).dataset.view==='all'));
  id++; running = false; paused = false; busy = true; snapshot = undefined; recorded = false; replaying = replay; blueStart = 0; lastEventCount = 0; accumulator = 0; previousPhase=undefined;
  el('pause').textContent='暂停';el('event-display').textContent='等待开始';
  el('elapsed').textContent='00:00';el('studio-state').textContent='DRAWING LAB / 准备中';el('status').textContent='正在准备本场球组…';el('run-indicator').classList.remove('running');
  seedPhase = randomGenerator(seed)() * 6;
  el('start').textContent = '准备中…'; (el<HTMLButtonElement>('start')).disabled = true;
  el('pause').classList.add('hidden'); el('reset').classList.add('hidden'); el<HTMLButtonElement>('copy').disabled = true;
  el('loading').classList.remove('hidden'); drawNumbers([]); worker.postMessage({type:'init',seed,id,game});
}
function begin() { soundscape.setState('drawing'); running = true; busy = true; accumulator = 0; lastTime = performance.now(); worker.postMessage({type:'start',id}); el('pause').classList.remove('hidden'); el('reset').classList.remove('hidden'); el<HTMLButtonElement>('start').disabled = true; el('start').textContent = replaying ? '正在回放' : '开奖进行中'; }
function fail(message: string) { soundscape.setState('idle'); running = false; busy = false; el('loading').classList.add('hidden'); el('status').textContent = message; el('status').classList.add('warning'); el('start').textContent = '重试'; el<HTMLButtonElement>('start').disabled = !scene; el('pause').classList.add('hidden'); }
worker.onerror = () => {fatalError=true;fail('物理引擎加载失败，请检查网络后点击重试刷新页面。');};
worker.onmessage = ({data}) => {
  if (data.id !== id) return;
  busy = false;
  if (data.type === 'error') return fail('物理引擎未能完成本场，请重新开始。');
  snapshot = data.snapshot; if (!snapshot) return;
  const s = snapshot;
  if (s.phase === 'ready') {
    el('loading').classList.add('hidden'); el<HTMLButtonElement>('start').disabled = !scene; el('start').textContent = '启动开奖';
    el('status').classList.remove('warning'); el('status').textContent = '机器已就绪。点击启动，开始一场由物理碰撞决定的开奖。';
    if (replaying && scene) begin();
  }
  if ((game==='ssq'||game==='dlt') && !blueStart && s.events.filter(e=>e.color==='red').length === config.draws[0]) blueStart = s.events.filter(e=>e.color==='red')[config.draws[0]-1].tick + 180;
  scene?.update(s,seedPhase,blueStart);
  if(s.phase!==previousPhase) {
    if(s.phase==='blue') selectView('blue');
    if(s.phase==='third') selectView('third');
    if(s.phase==='red'&&game!=='ssq'&&game!=='dlt') selectView('red');
    if(s.phase==='complete') selectView('tray');
    previousPhase=s.phase;
  }
  el('elapsed').textContent = `${pad(Math.floor(s.tick/120/60))}:${pad(Math.floor(s.tick/120)%60)}`;
  el('studio-state').textContent = `DRAWING LAB / ${phases[s.phase]}`;
  el('run-indicator').classList.toggle('running',running && !paused);
  document.querySelectorAll<HTMLElement>('[data-phase]').forEach(e=>e.classList.toggle('active',e.dataset.phase===s.phase));
  el('seed-display').textContent = String(s.seed); el('tick-display').textContent = String(s.tick);
  if (s.events.length !== lastEventCount) {
    drawNumbers(s.events); for (const event of s.events.slice(lastEventCount)) soundscape.ball(event.color); lastEventCount = s.events.length;
    el('event-display').textContent = s.events.map(e=>`${e.special?'特别号':config.zones[eventZone(e)]} ${game==='fc3d'?e.number:pad(e.number)} @ ${e.tick}`).join(' / ');
    el('status').textContent = `已抽出 ${s.events.length} / ${total} 个球${game==='fc3d'?' · 按百、十、个位组成号码':game==='qlc'?' · 第八球为特别号码':''}。`;
  } else if (s.phase==='mixing') el('status').textContent = config.mixing==='mechanical'?'双转盘逆向旋转中，球体通过碰撞充分搅拌…':'风机气流运行中，球体在球仓内碰撞混合…';
  else if (s.phase==='loading') el('status').textContent = '球组落入仓内，正在稳定球体…';
  if (s.phase==='complete') {
    soundscape.setState('complete');el('result-view').classList.remove('hidden');
    running = false; el('start').textContent = '再开一场'; el<HTMLButtonElement>('start').disabled = false; el<HTMLButtonElement>('copy').disabled = false;
    el('pause').classList.add('hidden'); el('reset').classList.add('hidden'); el('run-indicator').classList.remove('running');
    el('status').textContent = replaying ? '回放完成，相同输入下重新运行了完整物理过程。' : '本场开奖完成，结果可复制。';
    if (!recorded && !replaying) {
      recorded=true;accounts.completed({id:roundId,game,seed:s.seed,model:MODEL_VERSION,date:new Date().toISOString(),events:s.events});
    }
  }
  if (paused && running) el('status').textContent='已暂停，物理步骤与球体状态保持。';
  if (s.phase==='failed') {fail(s.error || '本场未完成，请重新开始。'); el<HTMLButtonElement>('copy').disabled=true;}
};
el('start').addEventListener('click',()=>{void soundscape.unlock();if(fatalError)return location.reload(); if (snapshot?.phase==='ready') begin(); else {initialize(); const targetId=id; const listener=({data}:MessageEvent)=>{ if(data.id===targetId&&data.snapshot?.phase==='ready'){worker.removeEventListener('message',listener);begin();} }; worker.addEventListener('message',listener); } });
el('reset').addEventListener('click',()=>initialize());
el('pause').addEventListener('click',()=>{paused=!paused;soundscape.setSuspended(paused||document.hidden);el('pause').textContent=paused?'继续':'暂停';accumulator=0;lastTime=performance.now();el('status').textContent=paused?'已暂停，物理步骤与球体状态保持。':'继续运行本场物理模拟…';el('run-indicator').classList.toggle('running',!paused);});
el('sort').addEventListener('click',()=>{sorted=!sorted;drawNumbers(snapshot?.events||[]);el('sort').textContent=sorted?'切换为出球顺序':'切换为升序';el('result-order').textContent=sorted?'按号码升序':'按出球顺序';});
el('copy').addEventListener('click',async()=>{if(snapshot?.phase!=='complete')return;const text=`${config.title}模拟：${resultText(game,snapshot.events,sorted)}\nhttps://lottery.1eak.cool/?game=${game}`;try{await navigator.clipboard.writeText(text);toast('模拟结果已复制');}catch{toast('浏览器未允许复制，请手动选择号码。');}});
el('sound').addEventListener('click',()=>{sound=!sound;el('sound').textContent=`声音：${sound?'开':'关'}`;el('sound').setAttribute('aria-pressed',String(sound));soundscape.setEnabled(sound);if(sound)void soundscape.unlock();});
el('drag-mode').addEventListener('click',()=>{panMode=!panMode;scene?.setDragMode(panMode);el('drag-mode').textContent=panMode?'旋转':'移动';el('drag-mode').setAttribute('aria-pressed',String(panMode));el('drag-mode').title=panMode?'当前拖动移动观看位置，点击切换旋转':'切换为拖动移动观看位置';});
el('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await el('studio').requestFullscreen();}catch{toast('此浏览器不支持全屏，可横屏观看。');}});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.view!)));
document.addEventListener('visibilitychange',()=>{soundscape.setSuspended(document.hidden||paused);accumulator=0;lastTime=performance.now();});
if(game==='fc3d'){el('sort').classList.add('hidden');el('result-order').textContent='百位 · 十位 · 个位';}
accounts=new Accounts(game,renderHistory,toast);
drawNumbers([]);renderHistory();
try {scene=new MachineScene(el('stage'),game);initialize();} catch {el('loading').classList.add('hidden'); const error=document.createElement('div');error.className='stage-error';error.innerHTML='<strong>三维画面暂时无法启动</strong><p>请使用支持 WebGL 的浏览器，并开启图形加速后刷新页面。</p>';el('stage').append(error);fail('当前浏览器未能启动三维图形，请更换浏览器或开启图形加速。');}
// Physics scheduling is independent of drawing frames, including occluded windows.
// Every requested step is still computed; background tabs pause instead of catching up.
function pump(){const time=performance.now(),delta=Math.min((time-lastTime)/1000,.2);lastTime=time;if(running&&!paused&&!document.hidden){accumulator=Math.min(accumulator+delta,.2);if(!busy&&accumulator>=DT){const steps=Math.min(Math.floor(accumulator/DT),24);accumulator-=steps*DT;busy=true;worker.postMessage({type:'step',steps,id});}}}
setInterval(pump,16);
function frame(){requestAnimationFrame(frame);scene?.render();}requestAnimationFrame(frame);
