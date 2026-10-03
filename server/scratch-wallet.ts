import type { Env } from "./auth";
export const DAILY_POINTS = 1000;
export const scratchDay = (date = new Date()) =>
  new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const now = () => new Date().toISOString();
export async function ensureWallet(env: Env, owner: string) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO scratch_wallets (owner,balance,updated_at) VALUES (?,0,?)",
  )
    .bind(owner, now())
    .run();
}
export function applyEvent(env: Env, owner: string, id: string) {
  return [
    env.DB.prepare(
      "UPDATE scratch_wallets SET balance=balance+(SELECT delta FROM scratch_point_events WHERE id=? AND owner=? AND applied=0),updated_at=? WHERE owner=? AND EXISTS(SELECT 1 FROM scratch_point_events WHERE id=? AND owner=? AND applied=0)",
    ).bind(id, owner, now(), owner, id, owner),
    env.DB.prepare(
      "UPDATE scratch_point_events SET applied=1 WHERE id=? AND owner=?",
    ).bind(id, owner),
  ];
}
export async function transferWallet(env: Env, guest: string, owner: string) {
  await ensureWallet(env, owner);
  const id = "transfer:" + guest;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO scratch_point_events (id,owner,kind,delta,reference,created_at) SELECT ?,?,'TRANSFER',balance,?,? FROM scratch_wallets WHERE owner=? AND EXISTS(SELECT 1 FROM scratch_actors WHERE id=? AND user_id=?)",
    ).bind(id, owner, guest, now(), guest, guest, owner),
    applyEvent(env, owner, id)[0],
    env.DB.prepare(
      "UPDATE scratch_wallets SET balance=0,updated_at=? WHERE owner=? AND EXISTS(SELECT 1 FROM scratch_point_events WHERE id=? AND owner=? AND applied=0)",
    ).bind(now(), guest, id, owner),
    applyEvent(env, owner, id)[1],
  ]);
}
export async function walletState(
  env: Env,
  owner: string,
  loggedIn: boolean,
  offset = 0,
) {
  const day = scratchDay(),
    balance = await env.DB.prepare(
      "SELECT balance FROM scratch_wallets WHERE owner=?",
    )
      .bind(owner)
      .first<{ balance: number }>();
  const daily = await env.DB.prepare(
    "SELECT id FROM scratch_point_events WHERE kind='DAILY' AND day=? AND (owner=? OR owner IN (SELECT id FROM scratch_actors WHERE user_id=?)) LIMIT 1",
  )
    .bind(day, owner, owner)
    .first();
  const events = await env.DB.prepare(
    "SELECT id,kind,delta,reference,created_at AS createdAt FROM scratch_point_events WHERE owner=? AND applied=1 ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?",
  )
    .bind(owner, offset)
    .all();
  return {
    balance: balance?.balance ?? 0,
    dailyAmount: DAILY_POINTS,
    dailyClaimed: !!daily,
    day,
    nextDailyAt: new Date(
      Date.parse(day + "T00:00:00+08:00") + 86400000,
    ).toISOString(),
    loggedIn,
    events: events.results,
  };
}
export async function claimDaily(env: Env, owner: string, loggedIn: boolean) {
  const day = scratchDay(),
    id = "daily:" + owner + ":" + day;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO scratch_point_events (id,owner,kind,delta,reference,day,created_at) SELECT ?,?,'DAILY',?,'每日补给',?,? WHERE NOT EXISTS(SELECT 1 FROM scratch_point_events WHERE kind='DAILY' AND day=? AND (owner=? OR owner IN (SELECT id FROM scratch_actors WHERE user_id=?)))",
    ).bind(id, owner, DAILY_POINTS, day, now(), day, owner, owner),
    ...applyEvent(env, owner, id),
  ]);
  return walletState(env, owner, loggedIn);
}
