import assert from "node:assert/strict";
import { CATALOG, poolFor, poolStats } from "../src/scratch/catalog";
import {
  composeTicket,
  evaluateTicket,
  poolPosition,
  securePosition,
  rewardAtPosition,
} from "../src/scratch/engine";
import { mergeProgress, encodeMask, decodeMask } from "../src/scratch/storage";
import { coveredCount, eraseCircle, MASK_BYTES } from "../src/scratch/coating";
let prints = 0,
  special = false;
for (const g of CATALOG) {
  const p = poolFor(g);
  assert.equal(
    p.tiers.reduce((s, t) => s + t.count, 0),
    p.size,
  );
  assert.equal(
    p.tiers.reduce((s, t) => s + t.units * t.count, 0),
    p.awardTotal,
  );
  assert.equal(poolStats(g, p).ratio, 0.65);
  assert.ok(p.size % g.ticketsPerBook === 0);
  for (const t of p.tiers)
    for (let seed = 0; seed < 100; seed++) {
      const print = composeTicket(g.id, t.units, seed);
      assert.equal(evaluateTicket(g.id, print), t.units);
      assert.deepEqual(composeTicket(g.id, t.units, seed), print);
      assert.equal(
        print.rounds.length,
        g.zones.filter((z) => z.kind === "round").length,
      );
      if (print.rounds.some((r) => r.marks.includes("给力手势")))
        special = true;
      prints++;
    }
  for (const z of g.zones)
    assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= 1 && z.y + z.h <= 1);
}
assert.ok(special);
const p = poolFor(CATALOG[0]),
  visited = new Uint8Array(p.size),
  counts = new Map<number, number>();
for (let i = 0; i < p.size; i++) {
  const pos = poolPosition(i, p.size, [1, 23, 45, 67]);
  assert.equal(visited[pos], 0);
  visited[pos] = 1;
  const reward = rewardAtPosition(pos, p);
  counts.set(reward, (counts.get(reward) ?? 0) + 1);
}
for (const tier of p.tiers) assert.equal(counts.get(tier.units), tier.count);
const key = await crypto.subtle.importKey(
  "raw",
  new Uint8Array(32).fill(31),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
for (const size of [1, 2, 3, 50, 97, 1000, 1025]) {
  const positions = await Promise.all(
    Array.from({ length: size }, (_, i) => securePosition(i, size, key)),
  );
  assert.equal(new Set(positions).size, size);
  assert.ok(positions.every((n) => n < size && n >= 0));
}
assert.throws(() => poolPosition(-1, 100, [1]));
const left = new Uint8Array(MASK_BYTES),
  right = new Uint8Array(MASK_BYTES);
eraseCircle(left, 0.2, 0.4, 0.15, 0.2);
eraseCircle(right, 0.8, 0.4, 0.15, 0.2);
assert.ok(coveredCount(left) > 0);
assert.equal(
  coveredCount(left),
  coveredCount(decodeMask(encodeMask(left), MASK_BYTES)),
);
const a = { id: "ticket", masks: [encodeMask(left)], revealed: [false] },
  b = { id: "ticket", masks: [encodeMask(right)], revealed: [true] },
  merged = mergeProgress(a, b);
assert.equal(
  coveredCount(decodeMask(merged.masks[0], MASK_BYTES)),
  coveredCount(left) + coveredCount(right),
);
assert.deepEqual(mergeProgress(merged, a), merged);
assert.deepEqual(mergeProgress(b, a), merged);
console.log(
  `Scratch print checks passed: ${CATALOG.length} real ticket editions, ${prints} rule evaluations; exact finite pools and 65% point configuration; cryptographic permutation bijections; monotonic masks.`,
);

const million = poolFor(
  CATALOG.find((g) => g.id === "xxf30")!,
  1000000,
);
assert.equal(million.size, 1000000);
assert.equal(
  million.tiers.reduce((s, t) => s + t.count, 0),
  1000000,
);
assert.equal(million.awardTotal, 19500000);
for (const i of [0, 499999, 999999])
  assert.ok((await securePosition(i, 1000000, key)) < 1000000);
const frozen = { ...CATALOG[0], bonus: 1 };
const frozenPrint = composeTicket(frozen.id, 20, 91, "FROZEN", 0, frozen);
assert.equal(evaluateTicket(frozen.id, frozenPrint, frozen), 20);

const { strokeZones } = await import("../src/scratch/coating");
const strokeMasks = [
  new Uint8Array(MASK_BYTES),
  new Uint8Array(MASK_BYTES),
  new Uint8Array(MASK_BYTES),
];
const crossed = strokeZones(
  strokeMasks,
  [
    { x: 0, y: 0, w: 40, h: 40 },
    { x: 50, y: 0, w: 40, h: 40 },
    { x: 100, y: 0, w: 40, h: 40 },
  ],
  { x: 10, y: 20 },
  { x: 130, y: 20 },
  8,
);
assert.equal(crossed.size, 3);
assert.ok(strokeMasks.every((m) => coveredCount(m) > 0));
let fullXi = 0;
for (const reward of [500, 1000])
  for (let seed = 0; seed < 100; seed++) {
    const t = composeTicket("xxf20", reward, seed);
    if (t.rounds.every((r) => r.marks[0] === "喜")) {
      fullXi++;
      assert.equal(
        t.rounds.reduce((sum, r) => sum + r.units, 0),
        reward,
      );
    }
  }
assert.ok(fullXi > 0, "Full-XI fixed rewards appear");
const legacy = { ...CATALOG[0], printStyle: undefined };
for (let seed = 0; seed < 100; seed++)
  assert.ok(
    !composeTicket("xxf20", 500, seed, "OLD", 0, legacy).rounds.every(
      (r) => r.marks[0] === "喜",
    ),
  );
const { markHtml, amountHtml } = await import("../src/scratch/printing");
for (const mark of [
  "福",
  "安",
  "乐",
  "吉",
  "花",
  "云",
  "叶",
  "星",
  "饼",
  "茶",
  "糕",
  "果",
  "糖果",
  "◇",
  "给力手势",
])
  assert.ok(markHtml(mark).includes("<svg"));
assert.ok(
  amountHtml(500).includes("¥500") && !amountHtml(500).includes("积分"),
);
console.log(
  "Continuous cross-zone strokes, reference-style vector printing, and 500/1000 full-XI layouts passed; legacy layout preserved.",
);
