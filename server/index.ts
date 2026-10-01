import { createAuth, type Env } from './auth';
import { validateDraw } from './records';
const json = (body: unknown, status=200) => Response.json(body, { status, headers: {
  'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' } });
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/status') return json({ accountsReady: Boolean(env.BETTER_AUTH_SECRET && env.RESEND_API_KEY) });
    if (!env.BETTER_AUTH_SECRET) return json({ message:'账户服务暂未启用，仍可直接开奖。' },503);
    const auth = createAuth(env);
    try {
      if (url.pathname.startsWith('/api/auth/')) {
        if (!env.RESEND_API_KEY && ['/sign-up/email','/request-password-reset','/send-verification-email'].some(path=>url.pathname.endsWith(path)))
          return json({message:'邮件服务尚未接通，请稍后再试。'},503);
        const response = await auth.handler(request);
        response.headers.set('Cache-Control','no-store'); response.headers.set('Referrer-Policy','no-referrer');
        return response;
      }
      if (url.pathname !== '/api/records') return json({message:'接口不存在'},404);
      const session = await auth.api.getSession({ headers:request.headers });
      if (!session?.user.emailVerified) return json({message:'请先登录已验证的账户。'},401);
      const userId=session.user.id;
      if (request.method==='GET') {
        const game=url.searchParams.get('game');
        const rows=await env.DB.prepare('SELECT id, game, seed, model, date, events FROM draw_records WHERE user_id = ? AND game = ? ORDER BY date DESC LIMIT 100').bind(userId,game).all<{events:string}>();
        return json({records:rows.results.map(r=>({...r,events:JSON.parse(r.events)}))});
      }
      if (request.method!=='POST') return json({message:'不支持此操作'},405);
      if (request.headers.get('Origin')!==env.AUTH_ORIGIN || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({message:'请求来源无效'},403);
      const text=await request.text();
      if (text.length>16000) return json({message:'记录过大'},413);
      let value:unknown;try{value=JSON.parse(text);}catch{return json({message:'记录格式无效'},400);}
      const draw=validateDraw(value);
      if (!draw) return json({message:'记录不完整或模型版本不匹配'},400);
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO draw_records (id,user_id,game,seed,model,date,events) VALUES (?,?,?,?,?,?,?)').bind(draw.id,userId,draw.game,draw.seed,draw.model,draw.date,JSON.stringify(draw.events)),
        env.DB.prepare('DELETE FROM draw_records WHERE user_id = ? AND game = ? AND id NOT IN (SELECT id FROM draw_records WHERE user_id = ? AND game = ? ORDER BY date DESC LIMIT 100)').bind(userId,draw.game,userId,draw.game),
      ]);
      return json({saved:true,id:draw.id});
    } catch { return json({message:'账户服务暂时不可用，请稍后重试。'},503); }
  },
};
