import './style.css';
import { MachineScene } from './scene';
import { DrawSoundscape } from './soundscape';
import { DT, MODEL_VERSION, randomGenerator, type Snapshot, type Phase, type DrawEvent } from './physics';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = (n: number) => String(n).padStart(2, '0');
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/"><span class="brand-icon">7</span>一刻开奖</a><nav class="nav"><a class="current" href="#studio">开奖实验室</a><a href="#about">工作原理</a><a class="github-nav" href="https://github.com/1eakkkk/lottery-machine" target="_blank" rel="noopener">GitHub ↗</a></nav></header>
<main><section class="intro"><div><div class="eyebrow">THE MOMENT OF CHANCE</div><h1>让偶然，真实发生。</h1><p>启动一场双色球开奖，观察每一次碰撞如何成为结果。</p></div><span class="mode">双色球 · 6 + 1</span></section>
<section class="studio" id="studio" aria-label="三维开奖实验室"><div class="studio-top"><span class="studio-label"><i id="run-indicator"></i><span id="studio-state">DRAWING LAB / 待机</span></span><span class="studio-meta" id="elapsed">00:00</span></div><div class="stage" id="stage"><div class="loading-overlay" id="loading"><span></span>正在准备三维机器与物理引擎…</div></div><div class="studio-bottom"><div class="views" role="group" aria-label="镜头选择"><button class="active" data-view="all">全景</button><button data-view="red">红球机</button><button data-view="blue">蓝球机</button><button data-view="tray">接球架</button><button class="hidden" id="result-view" data-view="results">结果</button></div><span class="studio-hint">拖动旋转 · 滚轮指向缩放 · 右键移动</span><div><button class="round-control" id="drag-mode" aria-pressed="false" title="切换为拖动移动观看位置">移动</button> <button class="round-control" id="sound" aria-pressed="true" title="背景音乐、机械音效与出球提示">声音：开</button> <button class="round-control" id="fullscreen">全屏</button></div></div></section>
<div class="progress" aria-label="开奖流程"><span data-phase="loading"><b>1</b>准备球组</span><em></em><span data-phase="mixing"><b>2</b>机械搅拌</span><em></em><span data-phase="red"><b>3</b>红球出球</span><em></em><span data-phase="blue"><b>4</b>蓝球出球</span><em></em><span data-phase="complete"><b>5</b>完成</span></div>
<section class="result-panel"><div><div class="result-head">本场模拟结果 <small id="result-order">按出球顺序</small></div><div class="numbers" id="numbers" aria-label="本场开奖号码"></div><div class="result-note"><span>33 个红球 · 16 个蓝球 · 区内不放回</span><button id="sort">切换为升序</button></div></div><div><div class="actions"><button class="primary" id="start" disabled>准备中…</button><button class="secondary hidden" id="pause">暂停</button><button class="secondary hidden" id="reset">重新开始</button><button class="secondary" id="copy" disabled>复制结果</button></div></div></section>
<p class="status-line" id="status" role="status" aria-live="polite">每次开奖独立运行，结果由球体通过出球口的物理过程产生。</p>
<section class="below"><div id="about"><h2 class="section-title">每一个号码，都经过一次碰撞。<small>01 / 原理</small></h2><p class="description">两组机械转盘逆向旋转，碰撞带动球体在透明球仓中搅拌。出球阀开启后，进入底部通道的球被逐一识别。六个红球之后，再抽取一个蓝球。</p><div class="legend"><span><i></i>红球 01—33</span><span><i class="blue"></i>蓝球 01—16</span><span>三维刚体物理</span></div><details class="details"><summary>打开物理与回放详情</summary><dl><dt>物理引擎</dt><dd>Rapier 3D · WASM</dd><dt>模拟步长</dt><dd>1 / 120 秒</dd><dt>模型版本</dt><dd>${MODEL_VERSION}</dd><dt>本场种子</dt><dd id="seed-display">—</dd><dt>物理步数</dt><dd id="tick-display">0</dd><dt>出球事件</dt><dd id="event-display">等待开始</dd></dl><p>依据双色球机械搅拌原理制作。内部部件与装球结构为简化模型，尚未按设备实测数据校准。物理运动不等于严格等概率，模拟不能预测实际开奖。</p><p><a href="https://www.ryo-catteau.com/en/myosotis.htm" target="_blank" rel="noopener">查看设备制造商原理介绍 ↗</a></p></details></div><div><h2 class="section-title">最近的偶然<small>02 / 本机记录</small></h2><div id="history"></div><p class="description" style="font-size:10px;margin-top:15px">记录保存在当前设备。回放使用相同种子与模型重新运行物理过程。</p></div></section></main>
<footer><span>1EAK / 一刻开奖 · 仅供模拟体验，与官方开奖无关联</span><span><a href="https://github.com/1eakkkk/lottery-machine" target="_blank" rel="noopener">源码公开</a> · 独立运行，无需登录</span></footer><div id="toast" class="toast hidden" role="status"></div>`;

type RecordItem = { seed: number; model: string; date: string; events: DrawEvent[] };
const STORAGE = '1eak-draw-history-v1';
let history: RecordItem[] = [];
try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]'); if (Array.isArray(saved)) history = saved.filter(r => r && r.model === MODEL_VERSION && Number.isInteger(r.seed) && Array.isArray(r.events) && r.events.length === 7 && typeof r.date === 'string').slice(0, 20); } catch { /* Storage can be disabled without disabling the simulator. */ }
let scene: MachineScene | undefined, snapshot: Snapshot | undefined, running = false, paused = false, busy = false, sorted = false, sound = true, recorded = false, replaying = false, fatalError=false, panMode=false;
let id = 0, blueStart = 0, seedPhase = 0, accumulator = 0, lastTime = performance.now(), lastEventCount = 0, previousPhase: Phase | undefined;
function selectView(name: string) {
  scene?.view(name);
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===name));
}
const soundscape = new DrawSoundscape(description => { el('sound').title = description; });
const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
const phases: Record<Phase, string> = { ready: '待机', loading: '准备球组', mixing: '机械搅拌', red: '红球出球', blue: '蓝球出球', complete: '开奖完成', failed: '本场未完成' };
function toast(message: string) { el('toast').textContent = message; el('toast').classList.remove('hidden'); setTimeout(() => el('toast').classList.add('hidden'), 2500); }
function drawNumbers(events: DrawEvent[]) {
  const red = events.filter(e => e.color === 'red'), blue = events.filter(e => e.color === 'blue');
  if (sorted) red.sort((a,b) => a.number - b.number);
  el('numbers').innerHTML = Array.from({length:6}, (_,i) => `<span class="number ${red[i] ? 'red' : ''}">${red[i] ? pad(red[i].number) : '·'}</span>`).join('') + '<span class="divider"></span>' + `<span class="number ${blue[0] ? 'blue' : ''}">${blue[0] ? pad(blue[0].number) : '·'}</span>`;
}
function renderHistory() {
  const list = el('history'); list.replaceChildren();
  if (!history.length) { const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = '还没有记录。启动机器，留下第一场开奖。'; list.append(p); return; }
  for (const record of history.slice(0,5)) {
    const row = document.createElement('div'); row.className = 'history-item';
    const time = document.createElement('span'); time.className = 'history-time'; time.textContent = new Date(record.date).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    const nums = document.createElement('span'); nums.className = 'history-numbers'; nums.textContent = record.events.filter(e => e.color === 'red').map(e => pad(e.number)).join(' ');
    const blue = document.createElement('strong'); blue.textContent = record.events.filter(e=>e.color==='blue').map(e=>pad(e.number)).join(' '); nums.append(blue);
    const replay = document.createElement('button'); replay.textContent = '回放'; replay.addEventListener('click', () => { if (running) return toast('请先完成或重新开始当前场次。'); void soundscape.unlock(); initialize(record.seed, true); });
    row.append(time, nums, replay); list.append(row);
  }
}
function initialize(seed = crypto.getRandomValues(new Uint32Array(1))[0], replay = false) {
  soundscape.setState('idle'); soundscape.setSuspended(document.hidden);
  el('result-view').classList.add('hidden');scene?.view('all');document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('active',(e as HTMLElement).dataset.view==='all'));
  id++; running = false; paused = false; busy = true; snapshot = undefined; recorded = false; replaying = replay; blueStart = 0; lastEventCount = 0; accumulator = 0; previousPhase=undefined;
  el('pause').textContent='暂停';el('event-display').textContent='等待开始';
  el('elapsed').textContent='00:00';el('studio-state').textContent='DRAWING LAB / 准备中';el('status').textContent='正在准备本场球组…';el('run-indicator').classList.remove('running');
  seedPhase = randomGenerator(seed)() * 6;
  el('start').textContent = '准备中…'; (el<HTMLButtonElement>('start')).disabled = true;
  el('pause').classList.add('hidden'); el('reset').classList.add('hidden'); el<HTMLButtonElement>('copy').disabled = true;
  el('loading').classList.remove('hidden'); drawNumbers([]); worker.postMessage({type:'init',seed,id});
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
  if (!blueStart && s.events.filter(e=>e.color==='red').length === 6) blueStart = s.events.filter(e=>e.color==='red')[5].tick + 180;
  scene?.update(s,seedPhase,blueStart);
  if(s.phase!==previousPhase) {
    if(s.phase==='blue') selectView('blue');
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
    el('event-display').textContent = s.events.map(e=>`${e.color==='red'?'红':'蓝'} ${pad(e.number)} @ ${e.tick}`).join(' / ');
    el('status').textContent = `已抽出 ${s.events.filter(e=>e.color==='red').length} / 6 个红球，${s.events.filter(e=>e.color==='blue').length} / 1 个蓝球。`;
  } else if (s.phase==='mixing') el('status').textContent = '双转盘逆向旋转中，球体通过碰撞充分搅拌…';
  else if (s.phase==='loading') el('status').textContent = '球组落入仓内，正在稳定球体…';
  if (s.phase==='complete') {
    soundscape.setState('complete');el('result-view').classList.remove('hidden');
    running = false; el('start').textContent = '再开一场'; el<HTMLButtonElement>('start').disabled = false; el<HTMLButtonElement>('copy').disabled = false;
    el('pause').classList.add('hidden'); el('reset').classList.add('hidden'); el('run-indicator').classList.remove('running');
    el('status').textContent = replaying ? '回放完成，相同输入下重新运行了完整物理过程。' : '本场开奖完成。结果已保存在本机，可随时回放。';
    if (!recorded && !replaying) {
      history.unshift({seed:s.seed,model:MODEL_VERSION,date:new Date().toISOString(),events:s.events}); history=history.slice(0,20); recorded=true;
      try {localStorage.setItem(STORAGE,JSON.stringify(history));} catch {el('status').textContent='开奖完成；浏览器未允许保存本机历史。';} renderHistory();
    }
  }
  if (paused && running) el('status').textContent='已暂停，物理步骤与球体状态保持。';
  if (s.phase==='failed') {fail(s.error || '本场未完成，请重新开始。'); el<HTMLButtonElement>('copy').disabled=true;}
};
el('start').addEventListener('click',()=>{void soundscape.unlock();if(fatalError)return location.reload(); if (snapshot?.phase==='ready') begin(); else {initialize(); const targetId=id; const listener=({data}:MessageEvent)=>{ if(data.id===targetId&&data.snapshot?.phase==='ready'){worker.removeEventListener('message',listener);begin();} }; worker.addEventListener('message',listener); } });
el('reset').addEventListener('click',()=>initialize());
el('pause').addEventListener('click',()=>{paused=!paused;soundscape.setSuspended(paused||document.hidden);el('pause').textContent=paused?'继续':'暂停';accumulator=0;lastTime=performance.now();el('status').textContent=paused?'已暂停，物理步骤与球体状态保持。':'继续运行本场物理模拟…';el('run-indicator').classList.toggle('running',!paused);});
el('sort').addEventListener('click',()=>{sorted=!sorted;drawNumbers(snapshot?.events||[]);el('sort').textContent=sorted?'切换为出球顺序':'切换为升序';el('result-order').textContent=sorted?'按号码升序':'按出球顺序';});
el('copy').addEventListener('click',async()=>{if(snapshot?.phase!=='complete')return;const red=snapshot.events.filter(e=>e.color==='red').map(e=>e.number);if(sorted)red.sort((a,b)=>a-b);const text=`双色球模拟：${red.map(pad).join(' ')} + ${pad(snapshot.events.find(e=>e.color==='blue')!.number)}\nhttps://lottery.1eak.cool/`;try{await navigator.clipboard.writeText(text);toast('模拟结果已复制');}catch{toast('浏览器未允许复制，请手动选择号码。');}});
el('sound').addEventListener('click',()=>{sound=!sound;el('sound').textContent=`声音：${sound?'开':'关'}`;el('sound').setAttribute('aria-pressed',String(sound));soundscape.setEnabled(sound);if(sound)void soundscape.unlock();});
el('drag-mode').addEventListener('click',()=>{panMode=!panMode;scene?.setDragMode(panMode);el('drag-mode').textContent=panMode?'旋转':'移动';el('drag-mode').setAttribute('aria-pressed',String(panMode));el('drag-mode').title=panMode?'当前拖动移动观看位置，点击切换旋转':'切换为拖动移动观看位置';});
el('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await el('studio').requestFullscreen();}catch{toast('此浏览器不支持全屏，可横屏观看。');}});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.view!)));
document.addEventListener('visibilitychange',()=>{soundscape.setSuspended(document.hidden||paused);accumulator=0;lastTime=performance.now();});
drawNumbers([]);renderHistory();
try {scene=new MachineScene(el('stage'));initialize();} catch {el('loading').classList.add('hidden'); const error=document.createElement('div');error.className='stage-error';error.innerHTML='<strong>三维画面暂时无法启动</strong><p>请使用支持 WebGL 的浏览器，并开启图形加速后刷新页面。</p>';el('stage').append(error);fail('当前浏览器未能启动三维图形，请更换浏览器或开启图形加速。');}
function frame(time:number){requestAnimationFrame(frame);const delta=Math.min((time-lastTime)/1000,.1);lastTime=time;if(running&&!paused&&!document.hidden){accumulator=Math.min(accumulator+delta,.1);if(!busy&&accumulator>=DT){const steps=Math.min(Math.floor(accumulator/DT),12);accumulator-=steps*DT;busy=true;worker.postMessage({type:'step',steps,id});}}scene?.render();}requestAnimationFrame(frame);
