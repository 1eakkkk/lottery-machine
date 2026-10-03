import { CATALOG, type PrizePool } from "./catalog";
import {
  composeTicket,
  evaluateTicket,
  securePosition,
  rewardAtPosition,
} from "./engine";
// This page is served by Vite only, excluded from production build inputs.
const app = document.getElementById("app")!;
app.innerHTML = `<style>body{font:15px system-ui;background:#f5f6f1;color:#253f2d;padding:24px;max-width:900px;margin:auto}label{display:block;margin:16px 0 8px}textarea{width:95%;height:180px}input,select,button{padding:9px;font:inherit}pre{background:#fff;padding:18px;white-space:pre-wrap;overflow-wrap:anywhere}button{margin:16px 0}</style><h1>即开票 · 本地发行诊断</h1><p>仅用于开发；不会发放生产票，也不会接触真实用户库存。</p><form id="config"><label>玩法模板 <select id="game">${CATALOG.map((g) => `<option value="${g.id}">${g.title}</option>`).join("")}</select></label><label>版型基准积分 <input id="basis" type="number" value="10" min="1"></label><label>发行张数 <select id="size"><option>100</option><option>1000</option></select></label><label>每本张数 <input id="book" type="number" value="50" min="1"></label><label>奖级数量（JSON，未中奖张数自动补齐）</label><textarea id="tiers">[{"units":100,"count":1},{"units":20,"count":10},{"units":10,"count":35}]</textarea><br><button>校验并生成测试印刷</button></form><pre id="output">等待输入。</pre>`;
document.getElementById("config")!.onsubmit = async (event) => {
  event.preventDefault();
  const output = document.getElementById("output")!;
  try {
    const value = (id: string) =>
        Number((document.getElementById(id) as HTMLInputElement).value),
      size = value("size"),
      basis = value("basis"),
      perBook = value("book"),
      id = (document.getElementById("game") as HTMLSelectElement).value,
      tiers = JSON.parse(
        (document.getElementById("tiers") as HTMLTextAreaElement).value,
      );
    if (
      !Array.isArray(tiers) ||
      tiers.length > 100 ||
      !Number.isInteger(basis) ||
      basis < 1 ||
      !Number.isInteger(perBook) ||
      perBook < 1 ||
      perBook > size ||
      tiers.some(
        (t) =>
          !Number.isSafeInteger(t.units) ||
          t.units < 1 ||
          !Number.isInteger(t.count) ||
          t.count < 1,
      ) ||
      new Set(tiers.map((t) => t.units)).size !== tiers.length
    )
      throw Error("配置中应只有非负安全整数积分、正整数张数和不重复奖级。");
    const wins = tiers.reduce((s, t) => s + t.count, 0),
      awards = tiers.reduce((s, t) => s + t.units * t.count, 0);
    if (wins > size || !Number.isSafeInteger(awards))
      throw Error("奖级张数超过发行张数，或总积分溢出。");
    const pool: PrizePool = {
        id: "LOCAL-TEST",
        size,
        tiers: [...tiers, { units: 0, count: size - wins }],
        awardTotal: awards,
      },
      seed = crypto.getRandomValues(new Uint8Array(32)),
      key = await crypto.subtle.importKey(
        "raw",
        seed,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    output.textContent = "正在固定测试票号与奖级…";
    const tickets = [];
    for (let i = 0; i < size; i++) {
      const pos = await securePosition(i, size, key),
        reward = rewardAtPosition(pos, pool),
        ticket = composeTicket(
          id,
          reward,
          i,
          `LOCAL-B${String(Math.floor(i / perBook) + 1).padStart(5, "0")}-T${String((i % perBook) + 1).padStart(3, "0")}`,
          i,
        );
      if (evaluateTicket(id, ticket) !== reward) throw Error("玩法表达不一致");
      tickets.push(ticket);
    }
    const counts = new Map<number, number>();
    for (const t of tickets)
      counts.set(t.reward, (counts.get(t.reward) ?? 0) + 1);
    for (const tier of pool.tiers)
      if (counts.get(tier.units) !== tier.count) throw Error("奖组数量不一致");
    output.textContent = JSON.stringify(
      {
        size,
        ticketsPerBook: perBook,
        totalReferencePoints: size * basis,
        totalAwardPoints: awards,
        ratio: awards / (size * basis),
        winRate: wins / size,
        equalRate:
          tiers
            .filter((t) => t.units === basis)
            .reduce((s, t) => s + t.count, 0) / size,
        aboveRate:
          tiers
            .filter((t) => t.units > basis)
            .reduce((s, t) => s + t.count, 0) / size,
        tierCounts: Object.fromEntries(counts),
        sample: tickets.slice(0, 10),
      },
      null,
      2,
    );
  } catch (e) {
    output.textContent = (e as Error).message;
  }
};
