import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { GAMES } from '../src/games';
import { validateDraw } from '../server/records';
const mails:{to:string[];text:string}[]=[];
const origin='http://localhost:8787';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'artifacts/account-worker/index.js',compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
  d1Databases:['DB'],bindings:{AUTH_ORIGIN:origin,MAIL_FROM:'test@example.test',BETTER_AUTH_SECRET:'test-only-secret-at-least-32-characters',RESEND_API_KEY:'synthetic-key'},
  serviceBindings:{ASSETS:()=>new Response('fixture')},outboundService:async request=>{
    assert.equal(new URL(request.url).hostname,'api.resend.com');mails.push(await request.json() as typeof mails[number]);return Response.json({id:'test-mail'});
  }}));
let checks=0;
function check(value:unknown,message:string){assert.ok(value,message);checks++;}
let ip=1;
async function call(path:string,body?:unknown,cookie='',customOrigin=origin){
  return mf.dispatchFetch(origin+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{Origin:customOrigin,'Content-Type':'application/json','cf-connecting-ip':`192.0.2.${ip}`,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
function cookies(response:Response){return response.headers.get('set-cookie')?.split(';')[0]??'';}
const password='Synthetic-only-password-42!';
try {
  const db=await mf.getD1Database('DB');
  await db.exec((await readFile('migrations/0001_accounts.sql','utf8')).replace(/\r?\n/g,' '));
  check((await call('/api/records?game=ssq')).status===401,'Guests cannot read records');
  check((await call('/api/auth/sign-up/email',{name:'测试甲',email:'a@example.test',password,callbackURL:origin+'/?verified=1'})).status===200,'Signup succeeds in Workers runtime');
  check(mails.length===1,'Verification mail is delivered through provider');
  check((await call('/api/auth/sign-in/email',{email:'a@example.test',password})).status===403,'Unverified account cannot sign in');
  const verifyUrl=new URL(mails[0].text.match(/https?:\/\/\S+/)![0]);
  check((await call(verifyUrl.pathname+verifyUrl.search)).status===302,'Verification link works');
  const login=await call('/api/auth/sign-in/email',{email:'a@example.test',password});check(login.status===200,'Verified account signs in');
  const cookie=cookies(login);check(cookie.length>20,'Session cookie is created');
  check(login.headers.get('set-cookie')?.includes('HttpOnly'),'Cookie inaccessible to scripts');
  const draw={id:'test-draw-0001',game:'ssq',model:GAMES.ssq.model,seed:42,date:new Date().toISOString(),events:[1,2,3,4,5,6].map((number,i)=>({number,color:'red',zone:0,tick:i+1})).concat([{number:7,color:'blue',zone:1,tick:7}])};
  check((await call('/api/records',draw,cookie)).status===200,'Authenticated user can save');
  check((await call('/api/records',draw,cookie)).status===200,'Retry is idempotent');
  check((await (await call('/api/records?game=ssq',undefined,cookie)).json() as {records:unknown[]}).records.length===1,'Retry does not duplicate records');
  check((await call('/api/records',draw,cookie,'https://evil.example')).status===403,'Cross-origin writes rejected');
  check((await call('/api/records',{...draw,seed:-1},cookie)).status===400,'Invalid seed rejected');
  check((await call('/api/records',{...draw,events:[]},cookie)).status===400,'Incomplete records rejected');
  ip=2;
  check((await call('/api/auth/sign-up/email',{name:'测试乙',email:'b@example.test',password,callbackURL:origin})).status===200,'Second account created');
  const secondVerify=new URL(mails[1].text.match(/https?:\/\/\S+/)![0]);await call(secondVerify.pathname+secondVerify.search);
  const secondLogin=await call('/api/auth/sign-in/email',{email:'b@example.test',password});const secondCookie=cookies(secondLogin);
  check((await (await call('/api/records?game=ssq&user_id=ignored',undefined,secondCookie)).json() as {records:unknown[]}).records.length===0,'Accounts cannot read each other’s history');
  check((await call('/api/auth/request-password-reset',{email:'a@example.test',redirectTo:origin})).status===200,'Password recovery accepted');
  const resetUrl=new URL(mails[2].text.match(/https?:\/\/\S+/)![0]);const redirect=await call(resetUrl.pathname+resetUrl.search);const resetToken=new URL(redirect.headers.get('location')!).searchParams.get('token');
  check((await call('/api/auth/reset-password',{token:resetToken,newPassword:password+'new'})).status===200,'Password can be recovered');
  check((await call('/api/auth/reset-password',{token:resetToken,newPassword:password})).status!==200,'Reset tokens cannot be reused');
  check((await call('/api/records?game=ssq',undefined,cookie)).status===401,'Password reset revokes existing sessions');
  const newLogin=await call('/api/auth/sign-in/email',{email:'a@example.test',password:password+'new'});const newCookie=cookies(newLogin);
  await call('/api/auth/sign-out',{},newCookie);
  check((await call('/api/records?game=ssq',undefined,newCookie)).status===401,'Logout revokes session');
  ip=3;for(let i=0;i<5;i++)await call('/api/auth/sign-in/email',{email:'absent@example.test',password});
  check((await call('/api/auth/sign-in/email',{email:'absent@example.test',password})).status===429,'Login rate limit persisted in D1');
  for(const [game,cfg] of Object.entries(GAMES)) {
    const events=cfg.draws.flatMap((count,zone)=>Array.from({length:count},(_,i)=>({number:game==='fc3d'?0:i+1,zone,color:zone>0?'blue':'red',tick:cfg.draws.slice(0,zone).reduce((a,b)=>a+b,0)+i+1,...(game==='qlc'&&i===7?{special:true,color:'blue'}:{})})));
    check(validateDraw({...draw,game,model:cfg.model,events}),`${game} validates correct format`);
  }
  console.log(`Account integration: ${checks} checks passed in Cloudflare Workers runtime. No real emails were sent.`);
}finally{await mf.dispose();}
