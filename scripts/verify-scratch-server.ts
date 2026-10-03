import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const mails: { text: string }[] = [];
const origin = "https://scratch.example.test",
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "artifacts/scratch-worker/index.js",
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      bindings: {
        AUTH_ORIGIN: origin,
        MAIL_FROM: "fixture@example.test",
        BETTER_AUTH_SECRET: "synthetic-only-scratch-test-secret-32",
        RESEND_API_KEY: "synthetic-mail-key",
      },
      serviceBindings: {
        ASSETS: (request: Request) =>
          new Response(new URL(request.url).pathname),
      },
      outboundService: async (request) => {
        assert.equal(new URL(request.url).hostname, "api.resend.com");
        mails.push((await request.json()) as { text: string });
        return Response.json({ id: "synthetic-mail" });
      },
    }),
  );
let checks = 0;
const check = (v: unknown, msg: string) => {
  assert.ok(v, msg);
  checks++;
};
async function call(
  path: string,
  body?: unknown,
  cookie = "",
  customOrigin = origin,
) {
  return mf.dispatchFetch(origin + "/api/scratch" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: customOrigin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const data = async (r: Response) => {
    const b: any = await r.json();
    assert.equal(r.status, 200, JSON.stringify(b));
    return b;
  },
  id = () => crypto.randomUUID();
try {
  check(
    (await mf.dispatchFetch(origin + "/dev/scratch/")).status === 404,
    "Development lab unavailable in production",
  );
  check(
    (await (await mf.dispatchFetch(origin + "/ticket/fixture")).text()) ===
      "/scratch/",
    "Metadata links route to scratch page",
  );
  check(
    (await (await mf.dispatchFetch(origin + "/verify/fixture")).text()) ===
      "/scratch/",
    "Verification links route to scratch page",
  );
  const routes = JSON.parse(await readFile("wrangler.jsonc", "utf8")).assets
    .run_worker_first;
  check(
    ["/ticket/*", "/verify/*", "/dev/scratch/*"].every((path) =>
      routes.includes(path),
    ),
    "Asset fallback cannot bypass protected scratch routes",
  );
  const db = await mf.getD1Database("DB");
  for (const file of [
    "0001_accounts.sql",
    "0002_scratch.sql",
    "0003_scratch_wallet.sql",
  ])
    await db.exec(
      (await readFile("migrations/" + file, "utf8")).replace(/\r?\n/g, " "),
    );
  const init = await call("/workshop?game=xxf20"),
    cookie = init.headers.get("set-cookie")!.split(";")[0],
    work = await data(init);
  check(cookie.length > 60, "Anonymous capability created");
  check(
    init.headers.get("set-cookie")?.includes("HttpOnly"),
    "Guest token is HttpOnly",
  );
  check(
    !JSON.stringify(work).includes('"seed":'),
    "Production seed never public",
  );
  check(work.issue.stats.ratio === 0.65, "Published exact point ratio");
  check(work.issue.stats.size === 600000, "Finite issue inventory");
  const initB = await call("/workshop?game=xxf20"),
    cookieB = initB.headers.get("set-cookie")!.split(";")[0];
  await data(initB);
  await db
    .prepare("UPDATE scratch_wallets SET balance=100000 WHERE owner LIKE 'g:%'")
    .run();
  const body = { game: "xxf20", bookNumber: 1, quantity: 10, requestId: id() },
    responses = await Promise.all([
      call("/take", body, cookie),
      call("/take", { ...body, requestId: id() }, cookieB),
      call("/take", { ...body, requestId: id() }, cookie),
    ]),
    groups = await Promise.all(responses.map(data)),
    all = groups.flatMap((g) => g.tickets);
  check(all.length === 30, "Three concurrent orders receive thirty tickets");
  check(
    new Set(all.map((t) => t.id)).size === 30,
    "Concurrent customers never share a ticket",
  );
  check(
    all.every((t) => t.bookNumber === 1),
    "First book is filled",
  );
  check(
    new Set(all.map((t) => t.ticketNumber)).size === 30,
    "Consecutive tearing covers every book number",
  );
  const repeated = await data(await call("/take", body, cookie));
  check(
    JSON.stringify(repeated.tickets) === JSON.stringify(groups[0].tickets),
    "Retry returns exact same identities",
  );
  check(
    (await data(await call("/book?game=xxf20&number=1", undefined, cookie)))
      .sold === 30,
    "Retry does not advance stock",
  );
  const same = { ...body, bookNumber: 2, requestId: id(), quantity: 5 },
    sameResults = await Promise.all(
      Array.from({ length: 3 }, () => call("/take", same, cookie).then(data)),
    );
  check(
    sameResults.every(
      (r) =>
        JSON.stringify(r.tickets) === JSON.stringify(sameResults[0].tickets),
    ),
    "Concurrent retry is idempotent",
  );
  check(
    (await data(await call("/book?game=xxf20&number=2", undefined, cookie)))
      .sold === 5,
    "Concurrent retry moves cursor once",
  );
  const next = await data(
    await call("/take", { ...body, quantity: 1, requestId: id() }, cookie),
  );
  check(
    next.tickets[0].bookNumber === 2 && next.tickets[0].ticketNumber === 6,
    "Exhausted book automatically switches to next existing stock",
  );
  const cross = await data(
    await call(
      "/take",
      { ...body, bookNumber: 3, quantity: 10, requestId: id() },
      cookie,
    ),
  );
  await data(
    await call(
      "/take",
      { ...body, bookNumber: 3, quantity: 10, requestId: id() },
      cookie,
    ),
  );
  await data(
    await call(
      "/take",
      { ...body, bookNumber: 3, quantity: 7, requestId: id() },
      cookie,
    ),
  );
  const boundary = await data(
    await call(
      "/take",
      { ...body, bookNumber: 3, quantity: 5, requestId: id() },
      cookie,
    ),
  );
  check(
    boundary.tickets
      .map((t) => `${t.bookNumber}-${t.ticketNumber}`)
      .join(",") === "3-28,3-29,3-30,4-1,4-2",
    "Bulk tearing crosses book boundary in order",
  );
  const t = all.find((t) => groups[0].tickets.some((x) => x.id === t.id))!,
    fresh = await data(
      await call("/ticket/" + encodeURIComponent(t.id), undefined, cookie),
    );
  check(
    !("reward" in fresh) &&
      !("play" in fresh) &&
      !("validationCode" in fresh) &&
      !("prizeTierId" in fresh),
    "Unstarted API returns no prize, play or validation code",
  );
  check(
    (await call("/ticket/" + encodeURIComponent(t.id), undefined, cookieB))
      .status === 404,
    "Ownership checked",
  );
  check(
    (await call("/redeem", { id: t.id }, cookie)).status === 409,
    "Unopened ticket cannot redeem",
  );
  check(
    (await call("/security", { id: t.id }, cookie)).status === 409,
    "Security cannot open early",
  );
  check(
    (await call("/play", { id: t.id }, cookie, "https://evil.example"))
      .status === 403,
    "Cross-origin mutation rejected",
  );
  const play = await data(await call("/play", { id: t.id }, cookie));
  check(
    play.status === "PARTIAL" && play.play && !("validationCode" in play),
    "First scratch authorizes fixed print, keeps security secret",
  );
  const sheetMask = "/".repeat(1024);
  const sheetSaved = await data(
    await call(
      "/progress",
      {
        id: t.id,
        masks: [...Array(25).fill(""), sheetMask],
        revealed: Array(25).fill(false),
      },
      cookie,
    ),
  );
  check(
    sheetSaved.masks[25] === sheetMask,
    "Continuous whole-sheet mask survives server save",
  );
  await data(
    await call(
      "/progress",
      { id: t.id, masks: sheetSaved.masks, revealed: sheetSaved.revealed },
      cookie,
    ),
  );
  check(!("reward" in play), "Summary award withheld until scratch completion");
  const again = await data(await call("/play", { id: t.id }, cookie));
  check(
    JSON.stringify(play.play) === JSON.stringify(again.play),
    "Scratch never rerolls",
  );
  const left = new Uint8Array(768),
    right = new Uint8Array(768);
  left[0] = 1;
  right[767] = 128;
  const enc = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  await Promise.all([
    call("/progress", { id: t.id, masks: [enc(left)], revealed: [] }, cookie),
    call("/progress", { id: t.id, masks: [enc(right)], revealed: [] }, cookie),
  ]);
  const partial = await data(
    await call("/ticket/" + encodeURIComponent(t.id), undefined, cookie),
  );
  check(
    atob(partial.masks[0]).charCodeAt(0) === 1 &&
      atob(partial.masks[0]).charCodeAt(767) === 128,
    "Concurrent masks merge monotonically",
  );
  const fakeComplete = await data(
    await call(
      "/progress",
      { id: t.id, masks: [], revealed: Array(25).fill(true) },
      cookie,
    ),
  );
  check(
    fakeComplete.status === "PARTIAL",
    "Client flags alone cannot falsely complete scratch",
  );
  const completed = await data(
    await call("/progress", { id: t.id, revealAll: true }, cookie),
  );
  check(
    completed.status === "SCRATCHED" && typeof completed.reward === "number",
    "Full reveal computes stored result",
  );
  check(
    !("validationCode" in completed),
    "Completed play still hides security code",
  );
  check(
    (await call("/redeem", { id: t.id }, cookie)).status === 409,
    "Verification and redemption separate",
  );
  const security = await data(await call("/security", { id: t.id }, cookie));
  check(
    security.securityAreaOpened && security.validationCode.startsWith("YK-V-"),
    "Internal security code revealed only after opening",
  );
  check(
    (
      await data(
        await call("/verify/" + security.validationCode, undefined, cookie),
      )
    ).id === t.id,
    "Verification resolves owner ticket",
  );
  check(
    (await call("/verify/" + security.validationCode, undefined, cookieB))
      .status === 404,
    "Verification is private",
  );
  const winning = await db
    .prepare(
      "SELECT id,prize FROM scratch_tickets WHERE owner=(SELECT owner FROM scratch_tickets WHERE id=?) AND prize>0 LIMIT 1",
    )
    .bind(t.id)
    .first<{ id: string; prize: number }>();
  assert.ok(winning);
  await data(
    await call("/progress", { id: winning.id, revealAll: true }, cookie),
  );
  await data(await call("/security", { id: winning.id }, cookie));
  const beforeReward = await data(await call("/wallet", undefined, cookie));
  const redeems = await Promise.all(
    Array.from({ length: 5 }, () =>
      call("/redeem", { id: winning.id }, cookie).then(data),
    ),
  );
  check(
    redeems.every((r) => r.status === "REDEEMED"),
    "Concurrent claims are idempotent",
  );
  const ledger = await db
    .prepare(
      "SELECT COUNT(*) AS n,SUM(units) AS total FROM scratch_ledger WHERE ticket_id=?",
    )
    .bind(winning.id)
    .first<{ n: number; total: number }>();
  check(
    ledger!.n === 1 && ledger!.total === winning.prize,
    "Exactly one immutable credit",
  );
  const balance = await data(
    await call("/workshop?game=xxf20", undefined, cookie),
  );
  check(
    balance.points === beforeReward.balance + winning.prize,
    "Only verified claimed points count",
  );
  await assert.rejects(() =>
    db
      .prepare("UPDATE scratch_tickets SET prize=999 WHERE id=?")
      .bind(t.id)
      .run(),
  );
  check(true, "Database prevents result changes");
  await assert.rejects(() =>
    db
      .prepare("UPDATE scratch_tickets SET status='SOLD' WHERE id=?")
      .bind(winning.id)
      .run(),
  );
  check(true, "Database rejects lifecycle reversal");
  await assert.rejects(() =>
    db
      .prepare("UPDATE scratch_issues SET seed='changed' WHERE id=?")
      .bind(work.issue.id)
      .run(),
  );
  check(true, "Batch secret cannot change");
  const invalid = await call(
    "/take",
    { ...body, quantity: 100, requestId: id() },
    cookie,
  );
  check(invalid.status === 400, "Claim size bounded");
  check(
    (await call("/take", { ...body, quantity: 5 }, cookie)).status === 409,
    "Idempotency key rejects conflicting request body",
  );
  for (const g of [
    "xxf30",
    "xxf50",
    "cgl50",
    "zdh50",
    "candy20",
    "luck88",
    "luck99",
    "password30",
    "tc7",
  ]) {
    const w = await data(await call("/workshop?game=" + g, undefined, cookie)),
      claimed = await data(
        await call(
          "/take",
          { game: g, bookNumber: 1, quantity: 1, requestId: id() },
          cookie,
        ),
      ),
      revealed = await data(
        await call(
          "/progress",
          { id: claimed.tickets[0].id, revealAll: true },
          cookie,
        ),
      );
    check(
      w.issue.tiers.some((x) => x.units === revealed.reward),
      "Real edition uses its own fixed tiers: " + g,
    );
    check(
      revealed.play.rounds.length ===
        w.issue.game.zones.filter((x) => x.kind === "round").length,
      "Real edition preserves independent play count: " + g,
    );
  }
  const authCall = (path: string, body?: unknown, c = "") =>
    mf.dispatchFetch(origin + "/api/auth" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(c ? { Cookie: c } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  await data(
    await authCall("/sign-up/email", {
      name: "测试",
      email: "scratch@example.test",
      password: "Synthetic-scratch-password-42!",
      callbackURL: origin,
    }),
  );
  const verification = new URL(mails[0].text.match(/https?:\/\/\S+/)![0]);
  await mf.dispatchFetch(verification.href, { redirect: "manual" });
  const login = await authCall("/sign-in/email", {
    email: "scratch@example.test",
    password: "Synthetic-scratch-password-42!",
  });
  await data(login);
  const accountCookie = login.headers.get("set-cookie")!.split(";")[0],
    combined = accountCookie + "; " + cookie;
  await data(await call("/daily", {}, cookie));
  const beforeLink = await data(await call("/wallet", undefined, cookie));
  const linked = await data(
    await call("/workshop?game=xxf20", undefined, combined),
  );
  check(
    linked.loggedIn && linked.points === beforeLink.balance,
    "Guest claimed points associate with verified account",
  );
  check(
    (await data(await call("/daily", {}, combined))).balance ===
      beforeLink.balance,
    "Guest daily eligibility follows account without double credit",
  );
  check(
    (
      await data(
        await call(
          "/ticket/" + encodeURIComponent(t.id),
          undefined,
          accountCookie,
        ),
      )
    ).id === t.id,
    "Linked tickets accessible from account on another device",
  );
  check(
    (await call("/ticket/" + encodeURIComponent(t.id), undefined, cookie))
      .status === 404,
    "Old guest capability cannot expose linked account history after logout",
  );
  check(
    (await data(await call("/workshop?game=xxf20", undefined, cookie)))
      .points === 0,
    "Logged-out visitor starts separate account-free points",
  );
  const freshInit = await call("/workshop?game=xxf20"),
    freshCookie = freshInit.headers.get("set-cookie")!.split(";")[0];
  await data(freshInit);
  check(
    (await data(await call("/wallet", undefined, freshCookie))).balance === 0,
    "New scratch balance starts zero",
  );
  const deniedBody = {
    game: "xxf50",
    bookNumber: 99,
    quantity: 1,
    requestId: id(),
  };
  check(
    (await call("/take", deniedBody, freshCookie)).status === 402,
    "Insufficient points cannot reserve stock",
  );
  check(
    (
      await data(
        await call("/book?game=xxf50&number=99", undefined, freshCookie),
      )
    ).sold === 0,
    "Insufficient points leave stock intact",
  );
  const dailyResults = await Promise.all(
    Array.from({ length: 4 }, () => call("/daily", {}, freshCookie).then(data)),
  );
  check(
    dailyResults.every((w) => w.balance === 1000 && w.dailyClaimed),
    "Concurrent daily supply credits exactly once",
  );
  const manyBody = {
    game: "xxf50",
    bookNumber: 99,
    quantity: 10,
    requestId: id(),
  };
  await data(await call("/take", manyBody, freshCookie));
  check(
    (await data(await call("/wallet", undefined, freshCookie))).balance === 500,
    "Ticket acquisition debits exact point cost",
  );
  await data(await call("/take", manyBody, freshCookie));
  check(
    (await data(await call("/wallet", undefined, freshCookie))).balance === 500,
    "Replayed order does not debit twice",
  );
  const purchases = await Promise.all([
    call("/take", { ...manyBody, requestId: id() }, freshCookie),
    call("/take", { ...manyBody, requestId: id() }, freshCookie),
  ]);
  check(
    purchases.filter((r) => r.status === 200).length === 1 &&
      purchases.filter((r) => r.status === 402).length === 1,
    "Concurrent spend cannot overdraw balance",
  );
  check(
    (await data(await call("/wallet", undefined, freshCookie))).balance === 0,
    "Balance remains nonnegative",
  );
  check(
    (await data(await call("/daily", {}, freshCookie))).balance === 0,
    "Repeated daily after spending cannot replenish again",
  );
  await assert.rejects(() =>
    db
      .prepare("UPDATE scratch_point_events SET delta=999 WHERE kind='DAILY'")
      .run(),
  );
  checks++;
  const refundInit = await call("/workshop?game=xxf50"),
    refundCookie = refundInit.headers.get("set-cookie")!.split(";")[0],
    refundWork = await data(refundInit);
  await data(await call("/daily", {}, refundCookie));
  const lastBook = refundWork.issue.id + ":29999";
  await db
    .prepare(
      "INSERT INTO scratch_books (id,issue_id,book_number,total,cursor,status) VALUES (?,?,29999,20,18,'OPEN')",
    )
    .bind(lastBook, refundWork.issue.id)
    .run();
  const limitedOrder = {
      game: "xxf50",
      bookNumber: 30000,
      quantity: 5,
      requestId: id(),
    },
    limited = await data(await call("/take", limitedOrder, refundCookie));
  check(
    limited.tickets.length === 2,
    "End of finite issue only gives remaining stock",
  );
  check(
    (await data(await call("/wallet", undefined, refundCookie))).balance ===
      900,
    "Missing stock points refunded exactly",
  );
  await data(await call("/take", limitedOrder, refundCookie));
  check(
    (await data(await call("/wallet", undefined, refundCookie))).balance ===
      900,
    "Refund retry cannot credit again",
  );
  const { scratchDay } = await import("../server/scratch-wallet");
  check(
    scratchDay(new Date("2026-10-03T15:59:59Z")) === "2026-10-03" &&
      scratchDay(new Date("2026-10-03T16:00:00Z")) === "2026-10-04",
    "Daily rollover uses UTC+8",
  );
  console.log(
    `Scratch server integration passed: ${checks} checks in actual Workers / D1 runtime; concurrent stock, continuous book boundaries, replay, privacy, security, verified idempotent point claims, all ten editions.`,
  );
} finally {
  await mf.dispose();
}
