import {
  ensureWallet,
  transferWallet,
  walletState,
  claimDaily,
  applyEvent,
} from "./scratch-wallet";
import {
  CATALOG,
  gameById,
  poolFor,
  poolStats,
  PRINT_REVISION,
  type ScratchGame,
  type PrizePool,
} from "../src/scratch/catalog";
import {
  composeTicket,
  evaluateTicket,
  securePosition,
  rewardAtPosition,
  serialFor,
  type Batch,
  type PrintedTicket,
} from "../src/scratch/engine";
import { mergeProgress, decodeMask } from "../src/scratch/storage";
import { createAuth, type Env } from "./auth";
interface Issue {
  id: string;
  game_id: string;
  revision: string;
  config: string;
  prize_pool: string;
  seed: string;
  seed_commit: string;
  pool_hash: string;
  seed_reveal: string | null;
  status: string;
  created_at: string;
}
interface TicketRow {
  id: string;
  issue_id: string;
  game_id: string;
  book_number: number;
  ticket_number: number;
  ticket_index: number;
  serial: string;
  denomination: number;
  prize_tier: string;
  prize: number;
  play_data: string;
  data_hash: string;
  logistics_code: string;
  validation_code: string;
  owner: string;
  order_id: string;
  status: string;
  masks: string;
  revealed: string;
  security_opened: number;
  created_at: string;
  sold_at: string;
  scratched_at: string | null;
  redeemed_at: string | null;
  security_opened_at: string | null;
}
const encoder = new TextEncoder(),
  now = () => new Date().toISOString();
export const sha256 = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, msg: string): never => {
  throw new Failure(status, msg);
};
const hex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
async function keyFor(seed: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(seed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}
export async function productionPrint(
  issue: Issue,
  index: number,
): Promise<PrintedTicket> {
  const g = JSON.parse(issue.config) as ScratchGame,
    p = JSON.parse(issue.prize_pool) as PrizePool,
    key = await keyFor(issue.seed),
    position = await securePosition(index, p.size, key),
    reward = rewardAtPosition(position, p),
    sig = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`print:${index}`),
    );
  const batch: Batch = {
    id: issue.id,
    seed: [],
    game: g.id,
    created: issue.created_at,
    version: issue.revision,
    pool: p.id,
  };
  return composeTicket(
    g.id,
    reward,
    new DataView(sig).getUint32(0, true),
    serialFor(batch, index, g.ticketsPerBook),
    index,
    g,
  );
}
async function getIssue(env: Env, game: string) {
  const g = CATALOG.find((g) => g.id === game) ?? fail(404, "票种不存在。");
  let issue = await env.DB.prepare(
    "SELECT * FROM scratch_issues WHERE game_id=? AND revision=?",
  )
    .bind(game, PRINT_REVISION)
    .first<Issue>();
  if (!issue) {
    const seed = hex(),
      pool = poolFor(g),
      config = JSON.stringify(g),
      prizes = JSON.stringify(pool);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO scratch_issues (id,game_id,revision,config,prize_pool,seed,seed_commit,pool_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        g.id,
        PRINT_REVISION,
        config,
        prizes,
        seed,
        await sha256(seed),
        await sha256(config + "\n" + prizes),
        now(),
      )
      .run();
    issue = await env.DB.prepare(
      "SELECT * FROM scratch_issues WHERE game_id=? AND revision=?",
    )
      .bind(game, PRINT_REVISION)
      .first<Issue>();
  }
  return issue!;
}
async function actor(
  request: Request,
  env: Env,
): Promise<{ id: string; cookie?: string; loggedIn: boolean }> {
  const raw = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)yk_scratch=([a-f0-9]{64})(?:;|$)/)?.[1],
    token = raw ?? hex(),
    guest = "g:" + (await sha256(token));
  const existing = await env.DB.prepare(
    "SELECT a.user_id,w.owner AS wallet_owner,e.applied AS transferred FROM scratch_actors a LEFT JOIN scratch_wallets w ON w.owner=a.id LEFT JOIN scratch_point_events e ON e.id='transfer:'||a.id WHERE a.id=?",
  )
    .bind(guest)
    .first<{
      user_id: string | null;
      wallet_owner: string | null;
      transferred: number | null;
    }>();
  if (!existing)
    await env.DB.prepare(
      "INSERT OR IGNORE INTO scratch_actors (id,created_at) VALUES (?,?)",
    )
      .bind(guest, now())
      .run();
  if (!existing?.wallet_owner) await ensureWallet(env, guest);
  const session = env.BETTER_AUTH_SECRET
    ? await createAuth(env).api.getSession({ headers: request.headers })
    : null;
  let id = guest;
  if (session?.user.emailVerified) {
    id = "u:" + session.user.id;
    if (existing?.user_id !== id || existing?.transferred !== 1) {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO scratch_actors (id,created_at) VALUES (?,?)",
        ).bind(id, now()),
        env.DB.prepare(
          "UPDATE scratch_actors SET user_id=? WHERE id=? AND user_id IS NULL",
        ).bind(id, guest),
        env.DB.prepare(
          "UPDATE scratch_tickets SET owner=? WHERE owner=? AND EXISTS(SELECT 1 FROM scratch_actors WHERE id=? AND user_id=?)",
        ).bind(id, guest, guest, id),
        env.DB.prepare(
          "UPDATE scratch_orders SET owner=? WHERE owner=? AND EXISTS(SELECT 1 FROM scratch_actors WHERE id=? AND user_id=?)",
        ).bind(id, guest, guest, id),
      ]);
      await transferWallet(env, guest, id);
    }
  } else {
    const linked = existing;
    if (linked?.user_id) {
      const fresh = hex(),
        newId = "g:" + (await sha256(fresh));
      await env.DB.prepare(
        "INSERT INTO scratch_actors (id,created_at) VALUES (?,?)",
      )
        .bind(newId, now())
        .run();
      await ensureWallet(env, newId);
      return {
        id: newId,
        loggedIn: false,
        cookie: `yk_scratch=${fresh}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`,
      };
    }
  }
  return {
    id,
    loggedIn: !!session?.user.emailVerified,
    ...(!raw
      ? {
          cookie: `yk_scratch=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`,
        }
      : {}),
  };
}
function publicTicket(t: TicketRow, play = false) {
  const complete = t.status === "SCRATCHED" || t.status === "REDEEMED";
  return {
    id: t.id,
    gameId: t.game_id,
    issueId: t.issue_id,
    bookNumber: t.book_number + 1,
    ticketNumber: t.ticket_number + 1,
    index: t.ticket_index,
    serial: t.serial,
    denomination: t.denomination,
    status: t.status,
    logisticsCode: t.logistics_code,
    ticketDataHash: t.data_hash,
    createdAt: t.created_at,
    soldAt: t.sold_at,
    scratchedAt: t.scratched_at,
    redeemedAt: t.redeemed_at,
    securityAreaOpened: !!t.security_opened,
    securityOpenedAt: t.security_opened_at,
    masks: JSON.parse(t.masks),
    revealed: JSON.parse(t.revealed),
    ...(t.security_opened ? { validationCode: t.validation_code } : {}),
    ...(complete ? { reward: t.prize, prizeTierId: t.prize_tier } : {}),
    ...(play && ["PARTIAL", "SCRATCHED", "REDEEMED"].includes(t.status)
      ? { play: JSON.parse(t.play_data) as Omit<PrintedTicket, "reward"> }
      : {}),
  };
}
async function ticketFor(env: Env, id: string, owner: string) {
  return (
    (await env.DB.prepare(
      "SELECT * FROM scratch_tickets WHERE (id=? OR logistics_code=? OR validation_code=?) AND owner=?",
    )
      .bind(id, id, id, owner)
      .first<TicketRow>()) ?? fail(404, "这张票不属于当前访客或账户。")
  );
}
async function materialize(
  env: Env,
  issue: Issue,
  orderId: string,
  owner: string,
) {
  const g = JSON.parse(issue.config) as ScratchGame;
  const reservations = (
    await env.DB.prepare(
      "SELECT * FROM scratch_reservations WHERE order_id=? ORDER BY first_index",
    )
      .bind(orderId)
      .all<{ first_index: number; quantity: number }>()
  ).results;
  const prints = await Promise.all(
    reservations.flatMap((r) =>
      Array.from({ length: r.quantity }, (_, i) =>
        productionPrint(issue, r.first_index + i),
      ),
    ),
  );
  const statements = [];
  for (const print of prints) {
    const index = print.index,
      b = Math.floor(index / g.ticketsPerBook),
      t = index % g.ticketsPerBook,
      id = `${issue.id}:${index}`,
      { reward, ...play } = print,
      pool = JSON.parse(issue.prize_pool) as PrizePool;
    if (
      evaluateTicket(g.id, print, g) !== reward ||
      !pool.tiers.some((t) => t.units === reward)
    )
      throw Error("Invalid print");
    const data = JSON.stringify(play),
      hash = await sha256(
        JSON.stringify({
          gameId: g.id,
          issueId: issue.id,
          serialNumber: print.serial,
          prizeAmount: reward,
          playData: play,
        }),
      ),
      date = issue.created_at;
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO scratch_tickets (id,issue_id,game_id,book_number,ticket_number,ticket_index,serial,denomination,prize_tier,prize,play_data,data_hash,logistics_code,validation_code,owner,order_id,created_at,sold_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        issue.id,
        g.id,
        b,
        t,
        index,
        print.serial,
        g.denomination,
        `P${reward}`,
        reward,
        data,
        hash,
        print.serial,
        "YK-V-" + hex(),
        owner,
        orderId,
        date,
        now(),
      ),
    );
  }
  if (statements.length) await env.DB.batch(statements);
}
async function take(env: Env, issue: Issue, owner: string, body: any) {
  const g = JSON.parse(issue.config) as ScratchGame,
    p = JSON.parse(issue.prize_pool) as PrizePool,
    quantity = body.quantity,
    book = body.bookNumber - 1,
    orderId = body.requestId;
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10 ||
    !Number.isInteger(book) ||
    book < 0 ||
    book >= p.size / g.ticketsPerBook ||
    typeof orderId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(orderId)
  )
    fail(400, "请填写正确的册号与领取张数。");
  const debit = "take:" + orderId,
    cost = quantity * g.denomination;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO scratch_orders (id,owner,issue_id,book_number,quantity,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM scratch_wallets WHERE owner=? AND balance>=?) AND NOT EXISTS(SELECT 1 FROM scratch_actors WHERE id=? AND user_id IS NOT NULL)",
    ).bind(orderId, owner, issue.id, book, quantity, now(), owner, cost, owner),
    env.DB.prepare(
      "INSERT OR IGNORE INTO scratch_point_events (id,owner,kind,delta,reference,created_at) SELECT ?,?,'TAKE',?,?,? WHERE EXISTS(SELECT 1 FROM scratch_orders WHERE id=? AND owner=? AND issue_id=? AND book_number=? AND quantity=?)",
    ).bind(
      debit,
      owner,
      -cost,
      g.title + " · " + quantity + "张",
      now(),
      orderId,
      owner,
      issue.id,
      book,
      quantity,
    ),
    ...applyEvent(env, owner, debit),
  ]);
  const order = await env.DB.prepare("SELECT * FROM scratch_orders WHERE id=?")
    .bind(orderId)
    .first<{
      owner: string;
      issue_id: string;
      book_number: number;
      quantity: number;
    }>();
  if (!order) fail(402, "虚拟 ¥ 不足，请先领取每日补给，或减少领票张数。");
  if (
    !order ||
    order.owner !== owner ||
    order.issue_id !== issue.id ||
    order.quantity !== quantity ||
    order.book_number !== book
  )
    fail(409, "领取请求编号已被使用。");
  for (let segment = 0; segment < quantity + 20; segment++) {
    const received = await env.DB.prepare(
      "SELECT COALESCE(SUM(quantity),0) AS n FROM scratch_reservations WHERE order_id=?",
    )
      .bind(orderId)
      .first<{ n: number }>();
    if (received!.n >= quantity) break;
    const b = book + segment;
    if (b >= p.size / g.ticketsPerBook) break;
    const bookId = `${issue.id}:${b}`,
      reservation = `${orderId}:${segment}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO scratch_books (id,issue_id,book_number,total) VALUES (?,?,?,?)",
      ).bind(bookId, issue.id, b, g.ticketsPerBook),
      env.DB.prepare(
        "INSERT OR IGNORE INTO scratch_reservations (id,order_id,owner,book_id,first_index,quantity) SELECT ?,?,?,id,book_number*total+cursor,MIN(?,total-cursor) FROM scratch_books WHERE id=? AND cursor<total AND status!='VOID'",
      ).bind(reservation, orderId, owner, quantity - received!.n, bookId),
      env.DB.prepare(
        "UPDATE scratch_books SET cursor=cursor+(SELECT quantity FROM scratch_reservations WHERE id=?),status=CASE WHEN cursor+(SELECT quantity FROM scratch_reservations WHERE id=?)=total THEN 'SOLD_OUT' ELSE 'OPEN' END WHERE id=? AND EXISTS(SELECT 1 FROM scratch_reservations WHERE id=? AND applied=0)",
      ).bind(reservation, reservation, bookId, reservation),
      env.DB.prepare(
        "UPDATE scratch_reservations SET applied=1 WHERE id=?",
      ).bind(reservation),
    ]);
  }
  const receivedTotal = await env.DB.prepare(
    "SELECT COALESCE(SUM(quantity),0) AS n FROM scratch_reservations WHERE order_id=?",
  )
    .bind(orderId)
    .first<{ n: number }>();
  if (receivedTotal!.n < quantity) {
    const refund = "refund:" + orderId;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO scratch_point_events (id,owner,kind,delta,reference,created_at) VALUES (?,?,'REFUND',?,'库存不足退回',?)",
      ).bind(
        refund,
        owner,
        (quantity - receivedTotal!.n) * g.denomination,
        now(),
      ),
      ...applyEvent(env, owner, refund),
    ]);
  }
  await materialize(env, issue, orderId, owner);
  return (
    await env.DB.prepare(
      "SELECT * FROM scratch_tickets WHERE order_id=? AND owner=? ORDER BY ticket_index",
    )
      .bind(orderId, owner)
      .all<TicketRow>()
  ).results;
}
export async function scratchApi(
  request: Request,
  env: Env,
): Promise<Response> {
  let cookie: string | undefined;
  try {
    const url = new URL(request.url);
    if (
      request.method !== "GET" &&
      (request.method !== "POST" ||
        request.headers.get("Origin") !== env.AUTH_ORIGIN ||
        !request.headers.get("Content-Type")?.startsWith("application/json"))
    )
      fail(403, "请求来源无效。");
    let body: any = {};
    if (request.method === "POST") {
      const text = await request.text();
      if (text.length > 130000) fail(413, "刮擦记录过大。");
      try {
        body = JSON.parse(text);
      } catch {
        fail(400, "请求格式无效。");
      }
    }
    if (body === null || typeof body !== "object" || Array.isArray(body))
      fail(400, "请求格式无效。");
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) {
      const ipKey =
        "ip:" +
        (await sha256(ip + env.BETTER_AUTH_SECRET)) +
        ":" +
        Math.floor(Date.now() / 60000);
      const ipLimit = await env.DB.prepare(
        "INSERT INTO scratch_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<240 RETURNING count",
      )
        .bind(ipKey, Date.now() + 120000)
        .first();
      if (!ipLimit) fail(429, "操作较频繁，请稍后继续。");
    }
    const a = await actor(request, env);
    cookie = a.cookie;
    const minute = Math.floor(Date.now() / 60000),
      rate = await env.DB.prepare(
        "INSERT INTO scratch_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<180 RETURNING count",
      )
        .bind(`${a.id}:${minute}`, Date.now() + 120000)
        .first();
    if (!rate) fail(429, "操作较频繁，请稍后继续。");
    if (url.pathname.endsWith("/workshop"))
      await env.DB.prepare("DELETE FROM scratch_limits WHERE expires<?")
        .bind(Date.now())
        .run();
    let result: unknown;
    const path = url.pathname.slice("/api/scratch".length);
    if (path === "/wallet" && request.method === "GET") {
      result = await walletState(
        env,
        a.id,
        a.loggedIn,
        Math.floor(
          Math.max(
            0,
            Math.min(1000000, Number(url.searchParams.get("offset")) || 0),
          ),
        ),
      );
    } else if (path === "/daily" && request.method === "POST") {
      result = await claimDaily(env, a.id, a.loggedIn);
    } else if (path === "/workshop" && request.method === "GET") {
      const issue = await getIssue(
          env,
          url.searchParams.get("game") ?? CATALOG[0].id,
        ),
        g = JSON.parse(issue.config) as ScratchGame,
        p = JSON.parse(issue.prize_pool) as PrizePool;
      const sold = await env.DB.prepare(
          "SELECT COALESCE(SUM(cursor),0) AS n FROM scratch_books WHERE issue_id=?",
        )
          .bind(issue.id)
          .first<{ n: number }>(),
        points = await env.DB.prepare(
          "SELECT balance AS n FROM scratch_wallets WHERE owner=?",
        )
          .bind(a.id)
          .first<{ n: number }>();
      result = {
        loggedIn: a.loggedIn,
        points: points!.n,
        issue: {
          id: issue.id,
          createdAt: issue.created_at,
          status: issue.status,
          seedCommit: issue.seed_commit,
          seedReveal: issue.seed_reveal,
          poolHash: issue.pool_hash,
          game: g,
          stats: poolStats(g, p),
          tiers: p.tiers,
          issued: p.size,
          sold: sold!.n,
          remaining: p.size - sold!.n,
          showRemainingPrizes: false,
          boxSize: 100,
          packSize: 10,
        },
      };
    } else if (path === "/books" && request.method === "GET") {
      const issue = await getIssue(env, url.searchParams.get("game") ?? ""),
        g = JSON.parse(issue.config) as ScratchGame,
        p = JSON.parse(issue.prize_pool) as PrizePool,
        start = Number(url.searchParams.get("start")) - 1,
        total = p.size / g.ticketsPerBook;
      if (!Number.isInteger(start) || start < 0 || start >= total)
        fail(400, "册号无效。");
      const rows = await env.DB.prepare(
        "SELECT book_number,cursor,status FROM scratch_books WHERE issue_id=? AND book_number>=? AND book_number<?",
      )
        .bind(issue.id, start, Math.min(start + 6, total))
        .all<{ book_number: number; cursor: number; status: string }>();
      result = {
        books: Array.from({ length: Math.min(6, total - start) }, (_, i) => {
          const b = start + i,
            saved = rows.results.find((r) => r.book_number === b),
            sold = saved?.cursor ?? 0;
          return {
            id: `${issue.id}:${b}`,
            gameId: g.id,
            issueId: issue.id,
            number: b + 1,
            total: g.ticketsPerBook,
            sold,
            remaining: g.ticketsPerBook - sold,
            status: saved?.status ?? "SEALED",
            next: sold === g.ticketsPerBook ? null : sold + 1,
            boxNumber: Math.floor(b / 100) + 1,
            packNumber: Math.floor((b % 100) / 10) + 1,
          };
        }),
      };
    } else if (path === "/book" && request.method === "GET") {
      const issue = await getIssue(env, url.searchParams.get("game") ?? ""),
        g = JSON.parse(issue.config) as ScratchGame,
        p = JSON.parse(issue.prize_pool) as PrizePool,
        b = Number(url.searchParams.get("number")) - 1;
      if (!Number.isInteger(b) || b < 0 || b >= p.size / g.ticketsPerBook)
        fail(400, "册号无效。");
      const saved = await env.DB.prepare(
        "SELECT cursor,status FROM scratch_books WHERE issue_id=? AND book_number=?",
      )
        .bind(issue.id, b)
        .first<{ cursor: number; status: string }>();
      result = {
        id: `${issue.id}:${b}`,
        gameId: g.id,
        issueId: issue.id,
        number: b + 1,
        total: g.ticketsPerBook,
        sold: saved?.cursor ?? 0,
        remaining: g.ticketsPerBook - (saved?.cursor ?? 0),
        status: saved?.status ?? "SEALED",
        next:
          saved?.cursor === g.ticketsPerBook ? null : (saved?.cursor ?? 0) + 1,
        boxNumber: Math.floor(b / 100) + 1,
        packNumber: Math.floor((b % 100) / 10) + 1,
      };
    } else if (path === "/take" && request.method === "POST") {
      const issue = await getIssue(env, body.game);
      if (issue.status !== "IN_STOCK") fail(409, "该批次已停止发放。");
      result = {
        tickets: (await take(env, issue, a.id, body)).map((t) =>
          publicTicket(t),
        ),
      };
    } else if (path === "/mine" && request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM scratch_tickets WHERE owner=? AND game_id=? ORDER BY sold_at DESC,ticket_index DESC LIMIT 100 OFFSET ?",
      )
        .bind(
          a.id,
          url.searchParams.get("game"),
          Math.floor(
            Math.max(
              0,
              Math.min(1000000, Number(url.searchParams.get("offset")) || 0),
            ),
          ),
        )
        .all<TicketRow>();
      result = { tickets: rows.results.map((t) => publicTicket(t)) };
    } else if (path.startsWith("/ticket/") && request.method === "GET") {
      result = publicTicket(
        await ticketFor(env, decodeURIComponent(path.slice(8)), a.id),
        true,
      );
    } else if (
      ["/play", "/progress", "/security", "/redeem"].includes(path) &&
      request.method === "POST"
    ) {
      let t = await ticketFor(env, body.id, a.id);
      const frozenIssue = await env.DB.prepare(
        "SELECT config FROM scratch_issues WHERE id=?",
      )
        .bind(t.issue_id)
        .first<{ config: string }>();
      const frozenGame = JSON.parse(frozenIssue!.config) as ScratchGame;
      if (["VOID", "EXPIRED"].includes(t.status))
        fail(409, "这张票已作废或过期。");
      if (path === "/play") {
        await env.DB.prepare(
          "UPDATE scratch_tickets SET status='PARTIAL' WHERE id=? AND owner=? AND status='SOLD'",
        )
          .bind(t.id, a.id)
          .run();
      }
      if (path === "/progress") {
        const g = frozenGame,
          zones = g.zones.length,
          input = {
            id: t.id,
            masks: [] as string[],
            revealed: [] as boolean[],
          };
        if (body.revealAll !== true) {
          if (
            !Array.isArray(body.masks) ||
            body.masks.length > zones + 1 ||
            !Array.isArray(body.revealed) ||
            body.revealed.length > zones + 1
          )
            fail(400, "刮擦数据无效。");
          for (let i = 0; i <= zones; i++) {
            const m = body.masks[i] ?? "";
            if (
              typeof m !== "string" ||
              m.length > 1024 ||
              (m && !/^[A-Za-z0-9+/]{1024}$/.test(m))
            )
              fail(400, "刮擦遮罩无效。");
            input.masks[i] = m;
            let pixels = 0;
            for (let byte of decodeMask(m, 768))
              while (byte) {
                byte &= byte - 1;
                pixels++;
              }
            input.revealed[i] =
              i < zones &&
              body.revealed[i] === true &&
              pixels >= 96 * 64 * 0.62;
          }
        } else input.revealed = Array.from({ length: zones }, () => true);
        // Optimistic compare-and-swap prevents a stale tab from recovering coating.
        for (let attempt = 0; attempt < 8; attempt++) {
          t = await ticketFor(env, t.id, a.id);
          if (t.status === "REDEEMED") break;
          const merged = mergeProgress(
              {
                id: t.id,
                masks: JSON.parse(t.masks),
                revealed: JSON.parse(t.revealed),
              },
              input,
            ),
            done = Array.from(
              { length: zones },
              (_, i) => merged.revealed[i],
            ).every(Boolean),
            partialStatus = done ? "SCRATCHED" : "PARTIAL";
          if (t.status === "SOLD") {
            await env.DB.prepare(
              "UPDATE scratch_tickets SET status='PARTIAL' WHERE id=? AND status='SOLD'",
            )
              .bind(t.id)
              .run();
            continue;
          }
          const changed = await env.DB.prepare(
            "UPDATE scratch_tickets SET masks=?,revealed=?,status=?,scratched_at=CASE WHEN ? THEN COALESCE(scratched_at,?) ELSE scratched_at END WHERE id=? AND owner=? AND masks=? AND revealed=? AND status=?",
          )
            .bind(
              JSON.stringify(merged.masks),
              JSON.stringify(merged.revealed),
              partialStatus,
              done ? 1 : 0,
              now(),
              t.id,
              a.id,
              t.masks,
              t.revealed,
              t.status,
            )
            .run();
          if (changed.meta.changes) break;
          if (attempt === 7) fail(409, "另一页正在保存这张票，请重试。");
        }
      }
      if (path === "/security") {
        if (!["SCRATCHED", "REDEEMED"].includes(t.status))
          fail(409, "先刮完玩法区，再打开保安区验票。");
        await env.DB.prepare(
          "UPDATE scratch_tickets SET security_opened=1,security_opened_at=COALESCE(security_opened_at,?) WHERE id=? AND owner=?",
        )
          .bind(now(), t.id, a.id)
          .run();
      }
      if (path === "/redeem") {
        if (t.status !== "SCRATCHED" && t.status !== "REDEEMED")
          fail(409, "这张票还没有刮完。");
        if (!t.security_opened) fail(409, "请先打开保安区验票。");
        const play = JSON.parse(t.play_data) as PrintedTicket;
        play.reward = t.prize;
        if (evaluateTicket(t.game_id, play, frozenGame) !== t.prize)
          fail(409, "印刷结果校验失败，禁止领取。");
        const hash = await sha256(
          JSON.stringify({
            gameId: t.game_id,
            issueId: t.issue_id,
            serialNumber: t.serial,
            prizeAmount: t.prize,
            playData: JSON.parse(t.play_data),
          }),
        );
        if (hash !== t.data_hash) fail(409, "票面校验失败。");
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE scratch_tickets SET status='REDEEMED',redeemed_at=COALESCE(redeemed_at,?) WHERE id=? AND owner=? AND status='SCRATCHED' AND security_opened=1",
          ).bind(now(), t.id, a.id),
          env.DB.prepare(
            "INSERT OR IGNORE INTO scratch_ledger (ticket_id,units,created_at) SELECT id,prize,redeemed_at FROM scratch_tickets WHERE id=? AND owner=? AND status='REDEEMED'",
          ).bind(t.id, a.id),
          env.DB.prepare(
            "INSERT OR IGNORE INTO scratch_point_events (id,owner,kind,delta,reference,created_at) SELECT ?,?,'REWARD',prize,serial,? FROM scratch_tickets WHERE id=? AND owner=? AND status='REDEEMED'",
          ).bind("reward:" + t.id, a.id, now(), t.id, a.id),
          ...applyEvent(env, a.id, "reward:" + t.id),
        ]);
      }
      result = publicTicket(await ticketFor(env, t.id, a.id), true);
    } else if (path.startsWith("/verify/") && request.method === "GET") {
      const code = decodeURIComponent(path.slice(8)),
        t = await ticketFor(env, code, a.id);
      if (code.startsWith("YK-V-") && !t.security_opened)
        fail(404, "验票码尚未开启。");
      result = publicTicket(t);
    } else fail(404, "接口不存在。");
    const response = json(result);
    if (cookie) response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    const response = json(
      {
        message:
          error instanceof Failure
            ? error.message
            : "刮刮乐服务暂时不可用，请稍后重试。",
      },
      error instanceof Failure ? error.status : 503,
    );
    if (cookie) response.headers.set("Set-Cookie", cookie);
    return response;
  }
}
