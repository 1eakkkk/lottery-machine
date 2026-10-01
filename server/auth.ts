import { betterAuth } from 'better-auth';
export interface Env {
  DB: D1Database; ASSETS: Fetcher; BETTER_AUTH_SECRET: string;
  RESEND_API_KEY?: string; AUTH_ORIGIN: string; MAIL_FROM: string;
}
export function createAuth(env: Env) {
  async function mail(to: string, url: string, reset: boolean) {
    if (!env.RESEND_API_KEY) throw new Error('Email service unavailable');
    const now=Date.now(),day=Math.floor(now/86400000),hour=Math.floor(now/3600000);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(to.toLowerCase()))),b=>b.toString(16).padStart(2,'0')).join('');
    const limits=await env.DB.batch([
      env.DB.prepare('INSERT INTO mail_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<3 RETURNING count').bind(`recipient:${hour}:${hash}`,now+7200000),
      env.DB.prepare('INSERT INTO mail_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<90 RETURNING count').bind(`daily:${day}`,now+172800000),
      env.DB.prepare('DELETE FROM mail_limits WHERE expires < ?').bind(now),
    ]);
    if(!limits[0].results.length||!limits[1].results.length)throw new Error('Email sending limit reached');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: reset ? '一刻开奖 · 重置密码' : '一刻开奖 · 验证邮箱',
        text: `请打开以下链接${reset ? '重置密码（30 分钟内有效）' : '验证邮箱（1 小时内有效）'}：\n${url}\n\n如果不是您本人操作，请忽略此邮件。我们不会索取您的密码。` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Email delivery failed');
  }
  return betterAuth({
    appName: '一刻开奖', baseURL: env.AUTH_ORIGIN, secret: env.BETTER_AUTH_SECRET,
    database: env.DB, trustedOrigins: [env.AUTH_ORIGIN],
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 12,
      maxPasswordLength: 128, resetPasswordTokenExpiresIn: 1800, revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => mail(user.email, url, true) },
    emailVerification: { sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false,
      expiresIn: 3600, sendVerificationEmail: ({ user, url }) => mail(user.email, url, false) },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 3600, max: 5 },
        '/request-password-reset': { window: 3600, max: 3 }, '/send-verification-email': { window: 3600, max: 3 } } },
  });
}
