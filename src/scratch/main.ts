import "./style.css";
import qrcode from "qrcode-generator";
import {
  CATALOG,
  gameById,
  poolStats,
  type ScratchGame,
  type Rect,
} from "./catalog";
import { Coating } from "./coating";
import type { Progress } from "./storage";
import type { PrintedTicket } from "./engine";
import { markHtml, amountHtml } from "./printing";
const displayRule = (s: string) =>
  s.replaceAll("娱乐积分", "虚拟 ¥").replaceAll("积分", "¥");
interface Ticket {
  id: string;
  gameId: string;
  issueId: string;
  bookNumber: number;
  ticketNumber: number;
  index: number;
  serial: string;
  denomination: number;
  status: string;
  logisticsCode: string;
  ticketDataHash: string;
  masks: string[];
  revealed: boolean[];
  securityAreaOpened: boolean;
  validationCode?: string;
  reward?: number;
  play?: Omit<PrintedTicket, "reward">;
}
interface Wallet {
  balance: number;
  dailyAmount: number;
  dailyClaimed: boolean;
  day: string;
  loggedIn: boolean;
  events: {
    id: string;
    kind: string;
    delta: number;
    reference: string;
    createdAt: string;
  }[];
}
let wallet: Wallet | undefined,
  guideStep = 0;
interface Book {
  id: string;
  number: number;
  total: number;
  sold: number;
  remaining: number;
  status: string;
  next: number | null;
  boxNumber: number;
  packNumber: number;
}
interface Workshop {
  loggedIn: boolean;
  points: number;
  issue: {
    id: string;
    createdAt: string;
    status: string;
    seedCommit: string;
    seedReveal: string | null;
    poolHash: string;
    game: ScratchGame;
    stats: ReturnType<typeof poolStats>;
    tiers: { units: number; count: number }[];
    issued: number;
    sold: number;
    remaining: number;
    showRemainingPrizes: boolean;
    boxSize: number;
    packSize: number;
  };
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T,
  n = (v: number) => v.toLocaleString("zh-CN"),
  pad = (v: number, l = 3) => String(v).padStart(l, "0"),
  escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
const getLocal = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setLocal = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
let game = gameById(
    new URLSearchParams(location.search).get("game") ?? "xxf20",
  ),
  workshop: Workshop,
  book: Book,
  candidate = 1,
  shelf = 1,
  mine: Ticket[] = [],
  current: Ticket | undefined,
  coating: Coating | undefined,
  filter = "全部",
  generation = 0,
  busy = false,
  sound = false,
  audio: AudioContext | undefined,
  brush = 18,
  zoom = 1,
  playing: Promise<void> | undefined,
  saveQueue = Promise.resolve(),
  pendingSaves = new Map<string, { ticket: Ticket; progress: Progress }>(),
  saving = false,
  saveError = false,
  toastTimer: ReturnType<typeof setTimeout>;
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/scratch" + path, {
    credentials: "same-origin",
    cache: "no-store",
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  if (!r.ok) throw new ApiError(r.status, data.message ?? "操作暂时未完成。");
  return data as T;
}
function toast(message: string) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function ding() {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain(),
      t = audio.currentTime;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.frequency.value = 420;
    gain.gain.setValueAtTime(0.018, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {}
}
const rectStyle = (r: Rect) =>
  `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%;`;
const artStyle = (g: ScratchGame) =>
  `background-image:url('${g.art}');background-size:${100 / g.crop.w}% ${100 / g.crop.h}%;background-position:${(g.crop.x / (1 - g.crop.w || 1)) * 100}% ${(g.crop.y / (1 - g.crop.h || 1)) * 100}%;`;
const qr = (url: string) => {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  return code.createSvgTag({ cellSize: 2, margin: 2, scalable: true });
};
document.querySelector("#app")!.innerHTML =
  `<header class="site-header"><a class="brand" href="/"><span class="brand-icon">7</span>一刻开奖</a><nav aria-label="页面导航"><a href="/">开奖实验室</a><a aria-current="page" href="/scratch/">刮刮乐</a><button class="quiet" id="guide-open">新手教程</button><button class="quiet" id="wallet-open">我的 ¥</button><a href="/?account=1" id="account-link">登录 / 注册</a></nav></header><main><section class="intro"><div><p class="eyebrow">PRINTED FIRST. REVEALED BY YOU.</p><h1>挑一本，慢慢刮。</h1><p class="lead">先领每日补给，选本领票；刮开后验票，确认领取虚拟 ¥。</p></div><span class="entertainment">¥ = 娱乐分值 · 无现金价值</span></section><div class="workshop-layout"><aside class="catalog-panel" aria-label="真实票种"><div class="panel-heading"><h2>挑个喜欢的</h2><span>${CATALOG.length} 个票面版本</span></div><div class="filters" role="group" aria-label="筛选玩法">${["全部", "符号", "号码", "连线"].map((f) => `<button data-filter="${f}" aria-pressed="${f === "全部"}">${f}</button>`).join("")}</div><div id="catalog" class="catalog"></div><div class="catalog-foot"><span>编号 → 印刷 → 涂膜 → 封册</span><p>服务端固化整批结果。<br>领到的是已有票号，刮擦只揭示印刷内容。</p></div></aside><section class="desk" aria-label="刮票桌面"><div class="desk-bar"><span>一刻 / 即开票模拟</span><button id="sound" class="quiet" aria-pressed="false">音效：关</button></div><div id="ticket-area" class="ticket-area"><p class="loading">正在读取发行批次…</p></div><div class="desk-footer"><span>鼠标拖动 / 手指涂抹</span><span id="points">虚拟 ¥：—</span></div></section><aside class="book-panel" aria-label="票册架" id="book-panel"><div class="panel-heading"><h2>票册架</h2><span id="stock-count"></span></div><p class="shelf-note" id="shelf-note"></p><div id="book-shelf" class="book-shelf"></div><div class="shelf-pager"><button id="shelf-prev" aria-label="上一组票册">←</button><span id="shelf-range"></span><button id="shelf-next" aria-label="下一组票册">→</button></div><form id="choose-book"><label for="book-number">按册号挑选</label><div><input id="book-number" type="number" inputmode="numeric" min="1" step="1" required><button>挑这本</button></div></form><div class="opened-heading">我领过的票 <span id="owned-count">0</span></div><div class="mine-filters"><label for="ticket-filter">状态</label><select id="ticket-filter"><option value="ALL">全部</option><option value="SOLD">未刮</option><option value="PARTIAL">刮了一部分</option><option value="SCRATCHED">待验票领取</option><option value="REDEEMED">已领取</option></select></div><div id="owned-tickets" class="opened-books"></div><button class="text-button" id="more-tickets" hidden>加载更早的票</button><p class="storage-note">票与刮擦进度保存在服务器。访客凭本机浏览器凭证访问；登录后自动保存到账户，支持跨设备查看。清除访客凭证后无法找回未关联账户的票。</p></aside></div><section class="explain"><div><p class="eyebrow">A FINITE ISSUE</p><h2>每张票，先有结果。</h2><p>按固定奖级数量建立有限奖组，服务端密钥把每个连续票号映射到唯一奖组位置。先确定结果，再印上能表达该奖级的数字和图符。换本、刷新、重新验票，都不会改变同一张票。</p><p>箱 → 盒 → 本 → 张是本站物流编排；分册及张数是模拟配置，不代表官方生产排布。</p></div><div><h3>真实票种，模拟分布</h3><p>名称、装饰字形和刮区参考发行机构公开票面，奖励改为虚拟 ¥。缺少完整官方奖组数量时，使用明确公开的本站模拟分布，不能代表真实票种中奖率，也没有每本保底。</p><p>虚拟 ¥ 仅用于刮刮乐，不能充值、提现、转移或兑换。摇奖机器不使用 ¥。本站与福彩、体彩发行机构无关联。</p><button class="text-button" id="data-open">查看当前票种的发行数据与资料 ↗</button></div></section></main><footer><span>1EAK / 一刻开奖 · 虚拟模拟票，无现实兑奖价值</span><a href="https://github.com/1eakkkk/lottery-machine" target="_blank" rel="noopener">公开源码 ↗</a></footer><dialog id="data-dialog"><div class="dialog-head"><h2>发行数据</h2><button id="data-close" aria-label="关闭资料">×</button></div><div id="data-content"></div></dialog><dialog id="verify-dialog"><div class="dialog-head"><h2>一刻开奖 · 虚拟验票</h2><button id="verify-close" aria-label="关闭验票">×</button></div><div id="verify-content"></div></dialog><dialog id="guide-dialog"><div class="dialog-head"><h2>第一次刮？跟着走一遍</h2><button id="guide-close" aria-label="关闭教程">×</button></div><div id="guide-content"></div></dialog><dialog id="wallet-dialog"><div class="dialog-head"><h2>我的 ¥</h2><button id="wallet-close" aria-label="关闭我的分值">×</button></div><div id="wallet-content"></div></dialog><div id="toast" class="toast" role="status" hidden></div><div id="live" class="sr-only" role="status" aria-live="polite"></div>`;
function renderCatalog() {
  $("catalog").innerHTML = CATALOG.filter(
    (g) => filter === "全部" || g.family === filter,
  )
    .map(
      (g) =>
        `<button class="catalog-card ${g.id === game.id ? "selected" : ""}" data-game="${g.id}" aria-pressed="${g.id === game.id}"><span class="mini-ticket real-mini" style="${artStyle(g)}"></span><span><strong>${g.title}</strong><small>${displayRule(g.subtitle)}</small></span></button>`,
    )
    .join("");
  $("catalog")
    .querySelectorAll<HTMLButtonElement>("[data-game]")
    .forEach((b) => (b.onclick = () => void switchGame(b.dataset.game!)));
}
async function switchGame(id: string) {
  if (busy) {
    toast("正在保存当前操作，请稍候。");
    return;
  }
  const token = ++generation;
  coating?.dispose();
  coating = undefined;
  if (token !== generation) return;
  game = gameById(id);
  current = undefined;
  renderCatalog();
  $("ticket-area").innerHTML = '<p class="loading">正在读取发行库存…</p>';
  if (!/^\/(ticket|verify)\//.test(location.pathname))
    history.replaceState(null, "", `/scratch/?game=${game.id}`);
  try {
    workshop = await api<Workshop>(`/workshop?game=${game.id}`);
    if (token !== generation) return;
    game = workshop.issue.game;
    candidate = Math.max(
      1,
      Math.min(
        workshop.issue.issued / game.ticketsPerBook,
        Number(getLocal("scratch-book-" + id)) || 1,
      ),
    );
    shelf = Math.floor((candidate - 1) / 6) * 6 + 1;
    $("points").textContent = `虚拟 ¥：${n(workshop.points)}`;
    $("account-link").textContent = workshop.loggedIn
      ? "我的账户"
      : "登录 / 注册";
    $("shelf-note").textContent =
      `${game.ticketsPerBook} 张 / 本 · 全站共享发行库存`;
    $("stock-count").textContent =
      `${n(workshop.issue.issued / game.ticketsPerBook)} 本`;
    $<HTMLInputElement>("book-number").max = String(
      workshop.issue.issued / game.ticketsPerBook,
    );
    $<HTMLInputElement>("book-number").placeholder =
      `1 — ${n(workshop.issue.issued / game.ticketsPerBook)}`;
    await Promise.all([loadWallet(), refreshMine(), selectBook(candidate)]);
    if (game.id !== id) return;
    const saved = getLocal("scratch-ticket-" + id);
    if (saved) await selectTicket(saved);
  } catch (e) {
    $("ticket-area").innerHTML =
      '<p class="loading">发行服务暂时不可用，请稍后重试。</p><button class="secondary" id="retry">重新读取</button>';
    $("retry").onclick = () => void switchGame(id);
    toast(e instanceof Error ? e.message : "读取失败。");
  }
}
async function refreshMine() {
  const id = game.id,
    result = await api<{ tickets: Ticket[] }>(`/mine?game=${id}`);
  if (id !== game.id) return;
  mine = result.tickets;
  $("more-tickets").hidden = result.tickets.length < 100;
  renderMine();
}
function renderMine() {
  const status = $<HTMLSelectElement>("ticket-filter").value;
  const visible = mine.filter((t) => status === "ALL" || t.status === status);
  $("owned-count").textContent = String(mine.length);
  $("owned-tickets").innerHTML = visible.length
    ? visible
        .map(
          (t) =>
            `<button class="opened-book ${t.id === current?.id ? "active" : ""}" data-owned="${t.id}"><span>${pad(t.bookNumber, 5)} 本 / ${pad(t.ticketNumber)} 张</span><small>${({ SOLD: "未刮", PARTIAL: "刮了一部分", SCRATCHED: "待验票领取", REDEEMED: "已领取", VOID: "已作废", EXPIRED: "已过期" } as Record<string, string>)[t.status]}</small></button>`,
        )
        .join("")
    : '<p class="empty-shelf">这里还没有票。<br>领补给，挑本册子，再领一张。</p>';
  $("owned-tickets")
    .querySelectorAll<HTMLButtonElement>("[data-owned]")
    .forEach((b) => (b.onclick = () => void selectTicket(b.dataset.owned!)));
}
async function renderShelf() {
  const id = game.id,
    total = workshop.issue.issued / game.ticketsPerBook,
    start = shelf,
    list = (await api<{ books: Book[] }>(`/books?game=${id}&start=${start}`))
      .books;
  if (id !== game.id || shelf !== start) return;
  $("book-shelf").innerHTML = list
    .map(
      (b) =>
        `<button class="shelf-book ${candidate === b.number ? "chosen" : ""}" data-book="${b.number}" aria-label="选择第 ${b.number} 本" aria-pressed="${candidate === b.number}" style="--ink:${game.ink};--paper:${game.paper};--accent:${game.accent}"><b>${game.emblem}</b><strong>${pad(b.number, 5)}</strong><small>${b.remaining ? "余 " + b.remaining + " 张" : "已发完"}</small></button>`,
    )
    .join("");
  $("shelf-range").textContent =
    `${n(start)} — ${n(Math.min(start + 5, total))}`;
  $<HTMLButtonElement>("shelf-prev").disabled = start === 1;
  $<HTMLButtonElement>("shelf-next").disabled = start + 6 > total;
  $("book-shelf")
    .querySelectorAll<HTMLButtonElement>("[data-book]")
    .forEach(
      (b) => (b.onclick = () => void selectBook(Number(b.dataset.book))),
    );
}
async function selectBook(value: number) {
  if (busy) return;
  const token = ++generation;
  const max = workshop.issue.issued / game.ticketsPerBook;
  if (!Number.isInteger(value) || value < 1 || value > max)
    return toast(`请输入 1 到 ${n(max)} 的整数本号。`);
  coating?.dispose();
  coating = undefined;
  $("ticket-area").innerHTML =
    '<p class="loading" role="status">正在打开这本票…</p>';
  const id = game.id,
    b = await api<Book>(`/book?game=${id}&number=${value}`).catch((e) => {
      toast(e.message);
      return undefined;
    });
  if (!b || id !== game.id || token !== generation) return;
  book = b;
  candidate = value;
  shelf = Math.floor((value - 1) / 6) * 6 + 1;
  setLocal("scratch-book-" + id, String(value));
  current = undefined;
  renderDesk();
  renderMine();
  void renderShelf().catch((e) => toast(e.message));
}
function stockHtml() {
  return `<div id="journey" class="journey"></div><div id="wallet-banner" class="wallet-banner"></div><div class="stock-controls"><div><strong>第 ${pad(book.number, 5)} 本</strong><small>箱 ${pad(book.boxNumber)} / 盒 ${pad(book.packNumber)} · 已领 ${book.sold} / ${book.total}</small></div><span>${book.next ? "下一张 " + pad(book.next) : "本册已发完"}</span></div><div class="take-actions">${[1, 5, 10].map((q) => `<button class="${q === 1 ? "primary" : "secondary"}" data-take="${q}">领 ${q} 张 · ¥${q * game.denomination}</button>`).join("")}<button class="quiet" id="change-book">换一本 ↗</button></div>`;
}
function referenceHtml(t?: Ticket) {
  const crops = game.crop;
  return `<article class="reference-ticket mechanic-${game.mechanic}" style="${artStyle(game)}aspect-ratio:${game.ratio};--ticket-ink:${game.ink}" aria-label="${game.title} ${t ? "第" + t.ticketNumber + "张" : "未领取票面预览"}">${game.patches.map((r, i) => `<span class="art-patch patch-${i}" style="${rectStyle(r)}background:${game.ink}">${i === 0 ? "¥" + game.denomination : i === 1 ? "最高 ¥" + n(game.tiers[0]) : displayRule(game.rule)}</span>`).join("")}${
    t
      ? game.zones
          .map((z, i) => {
            const crop = [
              crops.x + z.x * crops.w,
              crops.y + z.y * crops.h,
              z.w * crops.w,
              z.h * crops.h,
            ];
            return `<div class="scratch-zone ${z.kind === "lucky" ? "lucky-zone" : ""} ${game.mechanic === "diamond" ? "row-zone" : ""} ${game.mechanic === "line" && z.kind === "round" && z.index < game.bonus ? "grid-zone" : ""}" data-round="${i}" data-art="${game.art}" data-crop="${crop.join(",")}" style="${rectStyle(z)}"><div class="printed" aria-hidden="true">${printedHtml(t, i)}</div></div>`;
          })
          .join("")
      : ""
  } ${t ? `<canvas class="scratch-sheet" aria-hidden="true" data-art="${game.art}" data-crop="${[crops.x, crops.y, crops.w, crops.h].join(",")}"></canvas>` : ""}<div class="ticket-code-zone" style="background:${game.ink}">${t ? `<button class="security-cover" id="security" ${!["SCRATCHED", "REDEEMED"].includes(t.status) ? "disabled" : ""}>${t.securityAreaOpened ? "保安区已开启 · 验票" : "保安区 · 验票时开启"}</button><div class="logistics"><a href="/ticket/${encodeURIComponent(t.id)}" aria-label="物流票号信息">${qr(location.origin + "/ticket/" + encodeURIComponent(t.id))}</a><span>${escape(t.serial)}<br>虚拟模拟票 · 无现实兑奖价值</span></div>` : "<span>票面预览 · 领票后获得独立票号</span>"}</div></article>`;
}
function printedHtml(t: Ticket, i: number) {
  const z = game.zones[i],
    p = t.play;
  if (!p) return '<span class="print-wait">刮开揭示</span>';
  if (z.kind === "lucky")
    return `<div class="marks">${p.lucky.map(markHtml).join("")}</div><small>中奖${game.mechanic === "line" ? "密码" : "号码"}</small>`;
  const r = p.rounds[z.index];
  if (game.mechanic === "line" && z.index < game.bonus)
    return `<div class="printed-grid">${r.marks.map((m) => `<span>${m}</span>`).join("")}</div>${amountHtml(r.units)}`;
  const direct =
    ["double", "mixed", "candy"].includes(game.mechanic) &&
    z.index < game.bonus;
  return `<div class="marks ${direct ? "direct" : ""}">${r.marks.map((m) => markHtml(game.mechanic === "seven" && /^[0-9]+$/.test(m) && !["7", "77", "777"].includes(m) ? m.padStart(2, "0") : m)).join("")}</div>${direct && r.units === 0 ? "" : amountHtml(r.units, direct)}`;
}
function renderDesk() {
  coating?.dispose();
  coating = undefined;
  const t = current;
  $("ticket-area").innerHTML =
    `${stockHtml()}<div class="ticket-tools"><strong>${game.title}</strong><div><label for="brush">笔刷</label><select id="brush"><option value="12">细</option><option value="18" selected>中</option><option value="26">粗</option></select><button class="quiet" id="zoom">放大票面</button></div></div><div class="ticket-viewport"><div class="ticket-size" style="width:${zoom * 100}%">${referenceHtml(t)}</div></div><p class="face-caption">${t ? `本号 ${pad(t.bookNumber, 5)} · 张号 ${pad(t.ticketNumber)} · ${game.ticketsPerBook} 张 / 本` : "预览票面；领取后才能刮开。"} ${game.partialTiers ? "· 仅部分已核实奖级 · 底印参考仍在核对" : ""}</p><p class="ticket-rule">${displayRule(game.rule)}</p>${t ? `<div id="ticket-result" class="ticket-result" role="status"></div><div class="ticket-actions"><button class="secondary" id="reveal">一键揭开</button><button class="secondary" id="verify">验票 / 领取¥</button><button class="primary" id="next">再领一张 · ¥${game.denomination} →</button></div><button class="text-button" id="sync-retry" hidden>重新同步刮擦进度</button>` : '<p class="unseal-note">先领每日补给，再选本领票。每张票的结果已固定。</p>'}`;
  $("ticket-area")
    .querySelectorAll<HTMLButtonElement>("[data-take]")
    .forEach((b) => (b.onclick = () => void take(Number(b.dataset.take))));
  $("change-book").onclick = () => {
    $("book-panel").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    $<HTMLInputElement>("book-number").focus({ preventScroll: true });
  };
  $("zoom").onclick = () => {
    zoom = zoom === 1 ? 1.6 : zoom === 1.6 ? 2.2 : 1;
    document.querySelector<HTMLElement>(".ticket-size")!.style.width =
      `${zoom * 100}%`;
    $("zoom").textContent =
      zoom === 1 ? "放大票面" : `${Math.round(zoom * 100)}% · 切换`;
  };
  $<HTMLSelectElement>("brush").value = String(brush);
  $("brush").onchange = () => {
    brush = Number($<HTMLSelectElement>("brush").value);
    if (coating) coating.brushRadius = brush;
  };
  renderJourney();
  if (t) {
    coating = new Coating(
      $("ticket-area"),
      { id: t.id, masks: t.masks, revealed: t.revealed },
      (p) => saveProgress(t, p),
      () => {
        ding();
        void loadPlay(t);
      },
    );
    coating.brushRadius = brush;
    $("reveal").onclick = () => void reveal(t);
    $("verify").onclick = () => void verify(t);
    $("security").onclick = () => void verify(t);
    $("next").onclick = () => void take(1);
    $("sync-retry").onclick = () => coating?.flush(true);
    updateResult(t);
  }
}
async function selectTicket(id: string) {
  if (busy) return;
  coating?.dispose();
  coating = undefined;
  const token = ++generation;
  try {
    const t = await api<Ticket>("/ticket/" + encodeURIComponent(id));
    if (token !== generation || t.gameId !== game.id) return;
    current = t;
    setLocal("scratch-ticket-" + game.id, id);
    renderDesk();
    renderMine();
  } catch (e) {
    toast((e as Error).message);
  }
}
function storeCurrent(t: Ticket) {
  if (current?.id !== t.id) return;
  const hadPlay = !!current.play;
  current = t;
  if (!hadPlay && t.play)
    document
      .querySelectorAll<HTMLElement>(".scratch-zone .printed")
      .forEach((el, i) => (el.innerHTML = printedHtml(t, i)));
  const i = mine.findIndex((x) => x.id === t.id);
  if (i >= 0) mine[i] = t;
  renderMine();
  updateResult(t);
}
async function loadPlay(t: Ticket) {
  if (t.play || playing) return playing;
  playing = (async () => {
    try {
      const next = await api<Ticket>("/play", { id: t.id });
      if (current?.id !== t.id) return;
      t.play = next.play;
      t.status = next.status;
      current!.play = next.play;
      current!.status = next.status;
      document
        .querySelectorAll<HTMLElement>(".scratch-zone .printed")
        .forEach((el, i) => (el.innerHTML = printedHtml(t, i)));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      playing = undefined;
    }
  })();
  return playing;
}
function saveProgress(t: Ticket, p: Progress) {
  if (!p.masks.some(Boolean) && !p.revealed.some(Boolean)) return;
  // A later snapshot already includes earlier strokes: retain one pending snapshot per ticket.
  pendingSaves.set(t.id, { ticket: t, progress: p });
  if (saving) return;
  saving = true;
  saveQueue = (async () => {
    try {
      while (pendingSaves.size) {
        const [id, entry] = pendingSaves.entries().next().value!;
        pendingSaves.delete(id);
        try {
          const next = await api<Ticket>("/progress", {
            id,
            masks: entry.progress.masks,
            revealed: entry.progress.revealed,
          });
          storeCurrent(next);
          saveError = false;
        } catch (e) {
          saveError = true;
          toast((e as Error).message);
        }
        if (current?.id === id && $("sync-retry"))
          $("sync-retry").hidden = !saveError;
      }
    } finally {
      saving = false;
    }
  })();
}
async function reveal(t: Ticket) {
  if (busy) return;
  busy = true;
  $<HTMLButtonElement>("reveal").disabled = true;
  $("reveal").textContent = "正在揭开…";
  try {
    await saveQueue;
    const next = await api<Ticket>("/progress", { id: t.id, revealAll: true });
    if (current?.id === t.id) {
      current = next;
      renderDesk();
      renderMine();
      ding();
    }
  } catch (e) {
    toast((e as Error).message);
  } finally {
    busy = false;
    if ($("reveal")) $("reveal").textContent = "一键揭开";
    if ($("reveal"))
      $<HTMLButtonElement>("reveal").disabled = [
        "SCRATCHED",
        "REDEEMED",
      ].includes(current?.status ?? "");
  }
}
function updateResult(t: Ticket) {
  if (!$("ticket-result")) return;
  const complete = ["SCRATCHED", "REDEEMED"].includes(t.status);
  $("ticket-result").innerHTML = complete
    ? `<span>${t.reward ? "这张有奖励" : "这张没有奖励"}</span><strong>${n(t.reward ?? 0)} <small>虚拟 ¥</small></strong><small>${t.status === "REDEEMED" ? "已确认领取" : "验票后确认领取"}</small>`
    : '<span>印刷内容已固定</span><strong class="pending">慢慢刮，或者一键揭开。</strong>';
  $<HTMLButtonElement>("reveal").disabled = complete;
  $<HTMLButtonElement>("verify").disabled = !complete;
  $<HTMLButtonElement>("security").disabled = !complete;
  $("security").textContent = t.securityAreaOpened
    ? "保安区已开启 · 验票"
    : "保安区 · 验票时开启";
  renderJourney();
  $("live").textContent = complete
    ? `揭晓 ${t.reward} 虚拟 ¥`
    : "票已领取，等待刮开。";
}
async function take(quantity: number) {
  if (busy) return;
  busy = true;
  const id = game.id,
    keyName = `scratch-request-${id}`;
  coating?.flush();
  const takeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-take],#next"),
  );
  takeButtons.forEach((b) => {
    b.disabled = true;
    b.dataset.label = b.textContent ?? "";
  });
  const activeButton =
    takeButtons.find((b) => b.dataset.take === String(quantity)) ?? $("next");
  if (activeButton) activeButton.textContent = "正在领票…";
  try {
    await saveQueue;
    let requestId = getLocal(keyName) || undefined,
      savedBody = getLocal(keyName + "-body");
    const body = {
      game: id,
      bookNumber: candidate,
      quantity,
      requestId: requestId ?? crypto.randomUUID(),
    };
    if (requestId && savedBody) {
      const old = JSON.parse(savedBody);
      Object.assign(body, old);
    } else {
      setLocal(keyName, body.requestId);
      setLocal(keyName + "-body", JSON.stringify(body));
    }
    const response = await api<{ tickets: Ticket[] }>("/take", body);
    setLocal(keyName, "");
    setLocal(keyName + "-body", "");
    if (!response.tickets.length) {
      toast("这些票册已发完，请换一本。");
      return;
    }
    const first = response.tickets[0],
      last = response.tickets.at(-1)!;
    candidate =
      last.ticketNumber === game.ticketsPerBook
        ? Math.min(
            last.bookNumber + 1,
            workshop.issue.issued / game.ticketsPerBook,
          )
        : last.bookNumber;
    setLocal("scratch-book-" + id, String(candidate));
    // The committed order already returns this ticket; display it without fetching it again.
    current = first;
    mine = [
      ...response.tickets,
      ...mine.filter((t) => !response.tickets.some((n) => n.id === t.id)),
    ];
    const sold = candidate !== last.bookNumber ? 0 : last.ticketNumber;
    book = {
      ...book,
      number: candidate,
      total: game.ticketsPerBook,
      sold,
      remaining: game.ticketsPerBook - sold,
      next: sold === game.ticketsPerBook ? null : sold + 1,
      boxNumber: Math.floor((candidate - 1) / 100) + 1,
      packNumber: Math.floor(((candidate - 1) % 100) / 10) + 1,
    };
    shelf = Math.floor((candidate - 1) / 6) * 6 + 1;
    setLocal("scratch-ticket-" + id, first.id);
    renderDesk();
    renderMine();
    document
      .querySelectorAll<HTMLButtonElement>("[data-take],#next")
      .forEach((b) => (b.disabled = true));
    await loadWallet();
    void renderShelf().catch((e) => toast(e.message));
    toast(
      `已领取 ${response.tickets.length} 张连续库存票。${response.tickets.length > 1 ? "其余票在“我领过的票”中。" : ""}`,
    );
  } catch (e) {
    if (e instanceof ApiError && [400, 402, 403, 404, 409].includes(e.status)) {
      setLocal(keyName, "");
      setLocal(keyName + "-body", "");
      toast(e.message);
    } else toast((e as Error).message + " 若未完成，重试会继续原领取请求。");
  } finally {
    busy = false;
    takeButtons.forEach((b) => {
      b.disabled = false;
      b.textContent = b.dataset.label ?? b.textContent;
    });
    document
      .querySelectorAll<HTMLButtonElement>("[data-take],#next")
      .forEach((b) => (b.disabled = false));
  }
}
async function verify(t: Ticket) {
  const dialog = $<HTMLDialogElement>("verify-dialog");
  if (dialog.open) return;
  $("verify-content").innerHTML =
    '<p class="loading" role="status">正在校验票号与刮擦记录…</p>';
  dialog.showModal();
  try {
    await saveQueue;
    const fresh = await api<Ticket>("/security", { id: t.id });
    storeCurrent(fresh);
    const content = $("verify-content");
    content.innerHTML = `<p>本站模拟验票 · 无现实兑奖价值</p><dl class="verify-info"><dt>票种</dt><dd>${game.title}</dd><dt>票册 / 张号</dt><dd>${pad(fresh.bookNumber, 5)} / ${pad(fresh.ticketNumber)}</dd><dt>结果</dt><dd>${n(fresh.reward ?? 0)} 虚拟 ¥</dd><dt>状态</dt><dd id="verify-status">${fresh.status === "REDEEMED" ? "已确认领取" : "待确认领取"}</dd></dl><div class="verify-qr">${qr(location.origin + "/verify/" + fresh.validationCode)}</div><p class="code-string">${fresh.validationCode}</p><p class="code-string">印刷校验 SHA-256：${fresh.ticketDataHash}</p><button class="primary" id="redeem" ${fresh.status === "REDEEMED" ? "disabled" : ""}>${fresh.status === "REDEEMED" ? "已领取，不会重复计入" : "确认领取虚拟 ¥"}</button>`;

    $("redeem").onclick = async () => {
      const b = $<HTMLButtonElement>("redeem");
      b.disabled = true;
      try {
        const redeemed = await api<Ticket>("/redeem", { id: t.id });
        storeCurrent(redeemed);
        b.textContent = "已确认领取";
        $("verify-status").textContent = "已确认领取";
        await loadWallet();
        toast("已确认领取，重复请求不会重复计入。");
      } catch (e) {
        b.disabled = false;
        toast((e as Error).message);
      }
    };
  } catch (e) {
    $("verify-content").innerHTML =
      `<p role="alert">${escape((e as Error).message)}</p><p>关闭后可重新验票。</p>`;
    toast((e as Error).message);
  }
}
async function showData() {
  if ($<HTMLDialogElement>("data-dialog").open) return;
  $("data-content").innerHTML = '<p class="loading">正在读取发行数据…</p>';
  $<HTMLDialogElement>("data-dialog").showModal();
  try {
    workshop = await api<Workshop>(`/workshop?game=${game.id}`);
  } catch (e) {
    toast((e as Error).message);
    return;
  }
  const i = workshop.issue,
    s = i.stats;
  $("data-content").innerHTML =
    `<h3>${game.title}</h3><p><strong>本站模拟分布，非官方中奖张数。</strong>${game.partialTiers ? "仅使用已核实的3个奖级，完整官方奖级表待补齐。" : ""}奖励单位全部为虚拟 ¥。</p><div class="pool-stats"><div><b>${n(s.size)}</b><span>总发行张数</span></div><div><b>${(s.winRate * 100).toFixed(4)}%</b><span>有奖励张数占比</span></div></div><p>未中奖占比 ${(s.zeroRate * 100).toFixed(4)}%；等于版型基准¥占比 ${(s.equalRate * 100).toFixed(4)}%；高于基准占比 ${(s.aboveRate * 100).toFixed(4)}%。配置¥比例 ${(s.ratio * 100).toFixed(2)}%，由总奖励¥ /（张数 × 版型基准）计算，¥ 仅为娱乐分值，不是现金。</p><p>已发放 ${n(i.sold)} 张；库存 ${n(i.remaining)} 张。剩余各奖级数量默认不公开，避免从发放前后差额提前推断领取结果。</p><div class="table-wrap"><table><caption>模拟奖组 · 固定数量</caption><thead><tr><th>虚拟 ¥</th><th>张数</th><th>占比</th></tr></thead><tbody>${i.tiers.map((t) => `<tr><td>${t.units ? n(t.units) : "无奖励"}</td><td>${n(t.count)}</td><td>${((t.count / s.size) * 100).toFixed(5)}%</td></tr>`).join("")}</tbody></table></div><p>每本 ${game.ticketsPerBook} 张是本站模拟配置；100 本 / 箱、10 本 / 盒。未设置整本保底。不同游戏的奖组独立。</p><p class="code-string">批次 ${i.id}<br>发行时间 ${i.createdAt}<br>密钥承诺 SHA-256：${i.seedCommit}<br>配置与奖组 SHA-256：${i.poolHash}</p><p>批次密钥不公开；已预留售罄后公开验证字段。当前未提供全批次公开核验工具。</p><p class="source-line"><a href="${game.source}" target="_blank" rel="noopener">官方票种、规则与奖级资料 ↗</a> · <a href="${game.artSource}" target="_blank" rel="noopener">票面原图 ↗</a></p>${game.id === "tc7" ? "<p>300奖级：陕西体彩2021年公开活动资料；50奖级：竞彩网2019年宁夏活动资料。票面改用广东体彩2026年公开票样；刮开后底印仍待高清实物样张继续核对。</p>" : ""}<p>原标题和装饰字直接使用公开票面字形；¥、生成数字和模拟验票说明为本站动态印字，不声称复制了发行方专用底印字体。</p>`;
  $<HTMLDialogElement>("data-dialog").showModal();
}
document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter!;
      document
        .querySelectorAll<HTMLElement>("[data-filter]")
        .forEach((el) =>
          el.setAttribute("aria-pressed", String(el.dataset.filter === filter)),
        );
      renderCatalog();
    }),
);
$("choose-book").onsubmit = (e) => {
  e.preventDefault();
  void selectBook($<HTMLInputElement>("book-number").valueAsNumber);
};
$("shelf-prev").onclick = () => {
  shelf = Math.max(1, shelf - 6);
  void renderShelf();
};
$("shelf-next").onclick = () => {
  shelf = Math.min(
    shelf + 6,
    Math.floor((workshop.issue.issued / game.ticketsPerBook - 1) / 6) * 6 + 1,
  );
  void renderShelf();
};
$("ticket-filter").onchange = renderMine;
$("more-tickets").onclick = async () => {
  try {
    const result = await api<{ tickets: Ticket[] }>(
      `/mine?game=${game.id}&offset=${mine.length}`,
    );
    mine.push(
      ...result.tickets.filter((t) => !mine.some((x) => x.id === t.id)),
    );
    $("more-tickets").hidden = result.tickets.length < 100;
    renderMine();
  } catch (e) {
    toast((e as Error).message);
  }
};
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = `音效：${sound ? "开" : "关"}`;
  $("sound").setAttribute("aria-pressed", String(sound));
  if (sound) ding();
};
$("data-open").onclick = showData;
$("data-close").onclick = () => $<HTMLDialogElement>("data-dialog").close();
$("verify-close").onclick = () => $<HTMLDialogElement>("verify-dialog").close();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    coating?.flush();
    void audio?.suspend();
  }
});
window.addEventListener("pagehide", () => coating?.flush());
async function loadWallet() {
  wallet = await api<Wallet>("/wallet");
  $("points").textContent = `虚拟 ¥${n(wallet.balance)}`;
  renderJourney();
}
function renderJourney() {
  if (!$("journey")) return;
  const step =
    !wallet || (!wallet.dailyClaimed && wallet.balance === 0)
      ? 0
      : !current
        ? 1
        : current.status === "SOLD" || current.status === "PARTIAL"
          ? 2
          : current.status === "REDEEMED"
            ? 4
            : 3;
  $("journey").innerHTML = [
    "领取补给",
    "选本领票",
    "整片刮开",
    "验票领取",
    "完成",
  ]
    .map(
      (label, i) =>
        `<span class="${i === step ? "active" : i < step ? "done" : ""}"><b>${i + 1}</b>${label}</span>`,
    )
    .join("");
  $("wallet-banner").innerHTML =
    `<div><small>我的虚拟 ¥ · 仅用于刮刮乐</small><strong>¥${n(wallet?.balance ?? workshop?.points ?? 0)}</strong></div><button class="secondary" id="daily-claim" ${wallet?.dailyClaimed ? "disabled" : ""}>${wallet?.dailyClaimed ? "今日补给已领" : "领取今日 ¥" + n(wallet?.dailyAmount ?? 1000)}</button><button class="quiet" id="wallet-details">明细 ↗</button>`;
  $("daily-claim").onclick = () => void daily();
  $("wallet-details").onclick = () => void showWallet();
}
async function daily() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    "[data-daily],#daily-claim",
  );
  buttons.forEach((b) => {
    b.disabled = true;
    b.textContent = "正在领取…";
  });
  try {
    wallet = await api<Wallet>("/daily", {});
    $("points").textContent = `虚拟 ¥${n(wallet.balance)}`;
    renderJourney();
    if ($<HTMLDialogElement>("wallet-dialog").open) renderWallet();
    toast(`今日补给已领取 · 虚拟 ¥${n(wallet.dailyAmount)}`);
  } catch (e) {
    toast((e as Error).message);
    renderJourney();
    if ($<HTMLDialogElement>("wallet-dialog").open) renderWallet();
  }
}
function renderWallet() {
  if (!wallet) return;
  const kinds: Record<string, string> = {
    DAILY: "每日补给",
    TAKE: "领票扣除",
    REFUND: "库存退回",
    REWARD: "验票领取",
    TRANSFER: "访客记录转入",
  };
  $("wallet-content").innerHTML =
    `<p class="unit-note">¥ 代表本站娱乐分值，无现金价值；不能充值、提现或兑换。只用于刮刮乐。</p><div class="wallet-total"><span>当前可用</span><strong>¥${n(wallet.balance)}</strong></div><button class="primary" data-daily ${wallet.dailyClaimed ? "disabled" : ""}>${wallet.dailyClaimed ? "今天已领取补给" : "领取今日 ¥" + n(wallet.dailyAmount)}</button><p>每天北京时间 00:00 更新补给资格，余额会保留。领票按版型扣 ¥20／30／50；刮完验票后手动确认领取奖励。</p><p>最近 30 条明细</p><div class="wallet-history">${wallet.events.length ? wallet.events.map((e) => `<div><span><b>${kinds[e.kind] ?? "分值记录"}</b><small>${new Date(e.createdAt).toLocaleString("zh-CN")}${e.kind === "TAKE" ? " · " + escape(e.reference) : ""}</small></span><strong class="${e.delta < 0 ? "debit" : "credit"}">${e.delta >= 0 ? "+" : "−"}¥${n(Math.abs(e.delta))}</strong></div>`).join("") : "<p>还没有记录，先领取今日补给。</p>"}</div><p>${wallet.loggedIn ? "已保存到账户。" : "访客记录绑定本机浏览器，登录后可保存到账户。"}</p>`;
  $("wallet-content").querySelector<HTMLButtonElement>(
    "[data-daily]",
  )!.onclick = () => void daily();
}
async function showWallet() {
  const dialog = $<HTMLDialogElement>("wallet-dialog");
  if (dialog.open) return;
  if (wallet) renderWallet();
  else $("wallet-content").innerHTML = '<p class="loading">正在读取余额…</p>';
  dialog.showModal();
  try {
    await loadWallet();
    renderWallet();
  } catch (e) {
    toast((e as Error).message);
  }
}
const GUIDE = [
  {
    title: "先领取今日补给",
    text: "每天可免费领取虚拟 ¥1,000。这里的 ¥ 是娱乐分值，没有现金价值，不能充值或兑换。点桌面上的「领取今日」即可到账。",
    glyph: "¥",
    tip: "补给需要主动领取，每天北京时间 00:00 更新。",
  },
  {
    title: "挑喜欢的票种，再挑一本",
    text: "左侧选择喜相逢、体彩「7」等票种；票册架可以挑本号或换一本。每本的结果已经固定，换本不会重抽。",
    glyph: "本",
    tip: "手机上票种横向滑动，票册架在刮票桌面下方。",
  },
  {
    title: "按张领取，扣除虚拟 ¥",
    text: "可以领 1、5 或 10 张，按票面版型扣 ¥20／30／50。张号会连续接着上一张，不够一本时顺接下一本；其他票保存在「我领过的票」。",
    glyph: "1 → 2",
    tip: "先看可用 ¥；余额不够时减少张数，或等下一次每日补给。",
  },
  {
    title: "像刮实物一样，划过整片",
    text: "按住鼠标或用一根手指划动，跨格也能连续刮。数字和黑白图符是事先印好的。票面太小时可放大，也可以点「一键揭开」。",
    glyph: "↗",
    tip: "放大只改变票面；拖动刮区外的边缘可以移动查看。",
  },
  {
    title: "刮完后，打开保安区验票",
    text: "每个区域刮到足够面积会自动揭开。全部刮完后，「验票 / 领取 ¥」变成可用；点它会开启保安区并展示结果。",
    glyph: "✓",
    tip: "刮出奖励不会立刻加入余额，必须再确认领取。",
  },
  {
    title: "确认领取，查看明细",
    text: "核对票号、奖励和状态，点「确认领取虚拟 ¥」。只会增加一次；可以在「我的 ¥」查看补给、扣除和领取明细，再继续下一张。",
    glyph: "+¥",
    tip: "没有奖励的票也可以验票完成。登录后可跨设备查看。",
  },
];
function renderGuide() {
  const step = GUIDE[guideStep];
  $("guide-content").innerHTML =
    `<p class="unit-note">${guideStep + 1} / ${GUIDE.length} · 完整体验教程</p><div class="guide-art" aria-hidden="true">${step.glyph}</div><h3>${step.title}</h3><p>${step.text}</p><div class="guide-tip">${step.tip}</div><div class="guide-dots">${GUIDE.map((_, i) => `<button data-guide-step="${i}" aria-label="教程第 ${i + 1} 步" aria-current="${i === guideStep ? "step" : "false"}"></button>`).join("")}</div><div class="guide-actions"><button class="secondary" id="guide-prev" ${guideStep === 0 ? "disabled" : ""}>上一步</button><button class="primary" id="guide-next">${guideStep === GUIDE.length - 1 ? "开始体验" : "下一步"}</button></div>`;
  $("guide-prev").onclick = () => {
    guideStep--;
    renderGuide();
  };
  $("guide-next").onclick = () => {
    if (guideStep === GUIDE.length - 1) {
      setLocal("scratch-guide-v2", "seen");
      $<HTMLDialogElement>("guide-dialog").close();
      $("ticket-area").scrollIntoView({ block: "start", behavior: "instant" });
    } else {
      guideStep++;
      renderGuide();
    }
  };
  $("guide-content")
    .querySelectorAll<HTMLButtonElement>("[data-guide-step]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          guideStep = Number(b.dataset.guideStep);
          renderGuide();
        }),
    );
}
function showGuide() {
  guideStep = 0;
  renderGuide();
  $<HTMLDialogElement>("guide-dialog").showModal();
}
$("guide-open").onclick = showGuide;
$("guide-close").onclick = () => {
  setLocal("scratch-guide-v2", "seen");
  $<HTMLDialogElement>("guide-dialog").close();
};
$("wallet-open").onclick = () => void showWallet();
$("wallet-close").onclick = () => $<HTMLDialogElement>("wallet-dialog").close();
async function boot() {
  const match = location.pathname.match(/^\/(ticket|verify)\/(.+)$/);
  if (match) {
    try {
      const value = decodeURIComponent(match[2]),
        t = await api<Ticket>(
          (match[1] === "verify" ? "/verify/" : "/ticket/") +
            encodeURIComponent(value),
        );
      await switchGame(t.gameId);
      await selectTicket(t.id);
      if (match[1] === "verify" && t.securityAreaOpened) await verify(t);
    } catch (e) {
      $("ticket-area").textContent =
        (e as Error).message +
        " 请在持有这张票的访客浏览器或已关联账户中打开。";
    }
  } else await switchGame(game.id);
}
void boot();
if (
  !getLocal("scratch-guide-v2") &&
  !/^\/(ticket|verify)\//.test(location.pathname)
)
  showGuide();
