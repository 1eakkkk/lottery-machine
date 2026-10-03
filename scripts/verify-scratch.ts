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
