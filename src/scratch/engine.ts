import {
  gameById,
  poolFor,
  PRINT_REVISION,
  type ScratchGame,
  type PrizePool,
} from "./catalog";
export interface Batch {
  id: string;
  seed: number[];
  created: string;
  game: string;
  version: string;
  pool: string;
}
export interface PrintedRound {
  marks: string[];
  units: number;
}
export interface PrintedTicket {
  serial: string;
  index: number;
  reward: number;
  lucky: string[];
  rounds: PrintedRound[];
}
export const mix = (n: number) => {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
};
export function rng(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = Math.imul(n ^ (n >>> 15), n | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function poolPosition(
  index: number,
  size: number,
  keys: number[],
): number {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= size ||
    size > 2 ** 30 ||
    size < 1 ||
    !keys.length
  )
    throw RangeError("Invalid pool position");
  const half = Math.max(1, Math.ceil(Math.log2(size) / 2)),
    mask = 2 ** half - 1;
  let pos = index;
  do {
    let left = pos >>> half,
      right = pos & mask;
    for (let r = 0; r < 8; r++) {
      const next =
        left ^
        (mix(right ^ keys[r % keys.length] ^ Math.imul(r + 1, 0x9e3779b9)) &
          mask);
      left = right;
      right = next;
    }
    pos = left * 2 ** half + right;
  } while (pos >= size);
  return pos;
}
// Production permutation: a secret cryptographic PRF, cycle-walked bijection.
export async function securePosition(
  index: number,
  size: number,
  key: CryptoKey,
): Promise<number> {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= size ||
    size > 2 ** 30 ||
    size < 1
  )
    throw RangeError("Invalid pool position");
  const half = Math.max(1, Math.ceil(Math.log2(size) / 2)),
    mask = 2 ** half - 1;
  let pos = index;
  do {
    let left = pos >>> half,
      right = pos & mask;
    for (let r = 0; r < 8; r++) {
      const bytes = new Uint8Array(8),
        view = new DataView(bytes.buffer);
      view.setUint32(0, r, true);
      view.setUint32(4, right, true);
      const digest = await crypto.subtle.sign("HMAC", key, bytes),
        f = new DataView(digest).getUint32(0, true) & mask,
        next = left ^ f;
      left = right;
      right = next;
    }
    pos = left * 2 ** half + right;
  } while (pos >= size);
  return pos;
}
export function rewardAtPosition(pos: number, pool: PrizePool): number {
  if (!Number.isInteger(pos) || pos < 0 || pos >= pool.size)
    throw RangeError("Invalid prize position");
  for (const t of pool.tiers) {
    if (pos < t.count) return t.units;
    pos -= t.count;
  }
  throw Error("Incomplete pool");
}
export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
export const hasLine = (m: string[]) =>
  LINES.some((l) => l.every((i) => m[i] === m[l[0]]));
export function serialFor(
  batch: Batch,
  index: number,
  size = gameById(batch.game).ticketsPerBook,
): string {
  return `YK-${batch.game.toUpperCase()}-${batch.id.replaceAll("-", "").toUpperCase()}-B${String(Math.floor(index / size) + 1).padStart(5, "0")}-T${String((index % size) + 1).padStart(3, "0")}`;
}
export function createBatch(game: string): Batch {
  return {
    id: crypto.randomUUID(),
    seed: Array.from(crypto.getRandomValues(new Uint32Array(8))),
    created: new Date().toISOString(),
    game,
    version: PRINT_REVISION,
    pool: poolFor(gameById(game)).id,
  };
}
export function composeTicket(
  id: string,
  reward: number,
  seed: number,
  serial = "TEST",
  index = 0,
  g = gameById(id),
): PrintedTicket {
  const random = rng(seed),
    pick = <T>(items: T[]) => items[Math.floor(random() * items.length)],
    fmt = (n: number) => String(n).padStart(2, "0");
  const lucky = Array.from({ length: g.luckyCount }, () =>
      fmt(1 + Math.floor(random() * 99)),
    ),
    count = g.zones.filter((z) => z.kind === "round").length,
    winning = new Map<number, number>();
  if (reward) {
    const parts = reward >= 100 && reward % 20 === 0 && random() < 0.35 ? 2 : 1;
    while (winning.size < parts)
      winning.set(Math.floor(random() * count), reward / parts);
  }
  const miss = () => {
    let n: string;
    do {
      n = fmt(1 + Math.floor(random() * 99));
    } while (lucky.includes(n));
    return n;
  };
  const rounds: PrintedRound[] = Array.from({ length: count }, (_, i) => {
    const value = winning.get(i) ?? 0;
    let units = value || pick([10, 20, 30, 50, 100, 200, 500]),
      marks: string[];
    if (
      (g.mechanic === "double" ||
        g.mechanic === "mixed" ||
        g.mechanic === "candy") &&
      i < g.bonus
    ) {
      marks =
        value && g.mechanic === "candy" && value === 100 && random() < 0.4
          ? ["糖果"]
          : value
            ? ["积分"]
            : [pick(["花", "云", "叶", "星"])];
      if (!value) units = 0;
    } else
      switch (g.mechanic) {
        case "double": {
          const twice = value > 0 && value % 2 === 0 && random() < 0.5;
          marks = [
            value ? (twice ? "囍" : "喜") : pick(["福", "安", "乐", "吉"]),
          ];
          if (twice) units /= 2;
          break;
        }
        case "seven": {
          const mult =
            value > 0
              ? pick([
                  1,
                  ...(value % 2 === 0 ? [2] : []),
                  ...(value % 3 === 0 ? [3] : []),
                ])
              : 1;
          marks = [
            value
              ? "7".repeat(mult)
              : pick(["1", "2", "3", "4", "5", "6", "8", "9"]),
          ];
          if (value) units /= mult;
          break;
        }
        case "mixed":
          marks = [value ? (random() < 0.3 ? "红" : pick(lucky)) : miss()];
          break;
        case "all":
          marks = [value ? pick(lucky) : miss()];
          break;
        case "diamond": {
          const n = i === 0 ? (id === "luck88" ? 4 : 3) : 6;
          marks = Array.from({ length: n }, miss);
          if (value) {
            const ten = value % 10 === 0 && random() < 0.35;
            marks[Math.floor(random() * n)] = ten ? "◇" : lucky[0];
            if (ten) units /= 10;
          }
          break;
        }
        case "candy": {
          const symbols = ["饼", "茶", "糕", "花", "果", "叶"],
            a = pick(symbols),
            b = pick(symbols.filter((s) => s !== a));
          marks = value ? [a, a, a] : [a, b, pick(symbols)];
          break;
        }
        case "line": {
          if (i >= g.bonus) {
            marks = [value ? lucky[0] : miss()];
            break;
          }
          do {
            marks = Array.from({ length: 9 }, () =>
              String(Math.floor(random() * 10)),
            );
          } while (hasLine(marks));
          if (value) {
            const line = pick(LINES),
              n = String(Math.floor(random() * 10));
            for (const j of line) marks[j] = n;
          }
          break;
        }
      }
    return { marks, units };
  });
  if (
    g.mechanic === "all" &&
    reward >= count * 10 &&
    reward % count === 0 &&
    random() < 0.35
  ) {
    rounds.forEach((r) => {
      r.marks = [miss()];
      r.units = reward / count;
    });
    rounds[Math.floor(random() * count)].marks = ["给力手势"];
  }
  const ticket = { serial, index, reward, lucky, rounds };
  if (evaluateTicket(id, ticket, g) !== reward)
    throw Error(`Printed result does not match ${id}`);
  return ticket;
}
export function roundMultiplier(
  id: string,
  r: PrintedRound,
  i: number,
  t: PrintedTicket,
  g: ScratchGame = gameById(id),
): number {
  const m = r.marks;
  if (
    (g.mechanic === "double" ||
      g.mechanic === "mixed" ||
      g.mechanic === "candy") &&
    i < g.bonus
  )
    return m[0] === "积分" ? 1 : 0;
  switch (g.mechanic) {
    case "double":
      return m[0] === "囍" ? 2 : m[0] === "喜" ? 1 : 0;
    case "seven":
      return m[0] === "777" ? 3 : m[0] === "77" ? 2 : m[0] === "7" ? 1 : 0;
    case "all":
      return t.lucky.includes(m[0]) ? 1 : 0;
    case "mixed":
      return m[0] === "红" || t.lucky.includes(m[0]) ? 1 : 0;
    case "diamond":
      return m.includes("◇") ? 10 : m.some((n) => t.lucky.includes(n)) ? 1 : 0;
    case "candy":
      return m.every((s) => s === m[0]) ? 1 : 0;
    case "line":
      return i < g.bonus
        ? hasLine(m)
          ? 1
          : 0
        : t.lucky.includes(m[0])
          ? 1
          : 0;
  }
}
export function evaluateTicket(
  id: string,
  t: PrintedTicket,
  g: ScratchGame = gameById(id),
): number {
  if (g.mechanic === "all" && t.rounds.some((r) => r.marks[0] === "给力手势"))
    return t.rounds.reduce((s, r) => s + r.units, 0);
  return t.rounds.reduce(
    (s, r, i) =>
      s +
      (g.mechanic === "candy" && i < g.bonus && r.marks[0] === "糖果"
        ? 100
        : r.units * roundMultiplier(id, r, i, t, g)),
    0,
  );
}
