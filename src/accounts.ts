import type { SavedDraw } from '../server/records';
import { GAMES, type GameId } from './games';
type User = { id:string; name:string; email:string };
export class Accounts {
  user:User|null=null;
  records:SavedDraw[]=[];
  private generation=0;
  private loading=false;
  private error='';
  private dialog:HTMLDialogElement;
  private mode:'login'|'register'|'forgot'|'reset'='login';
  private pending:SavedDraw|undefined;
  private savedFor='';
  private legacy:SavedDraw[]=[];
  private resetToken:string|null;
  private changed:()=>void;
  constructor(private game:GameId, changed:()=>void, private notify:(text:string)=>void) {
    this.changed=changed;
    const query=new URLSearchParams(location.search);
    this.resetToken=query.get('token');
    const verified=query.get('verified')==='1',linkError=query.get('error');
    if(this.resetToken || query.has('verified') || query.has('error')) {
      query.delete('token');query.delete('verified');query.delete('error');
      history.replaceState(null,'',`${location.pathname}${query.size?'?'+query:''}${location.hash}`);
    }
    this.dialog=document.createElement('dialog');this.dialog.className='account-dialog';this.dialog.setAttribute('aria-labelledby','account-title');
    document.body.append(this.dialog);
    document.getElementById('account-open')!.addEventListener('click',()=>this.open());
    document.getElementById('account-logout')!.addEventListener('click',()=>void this.logout());
    document.getElementById('save-round')!.addEventListener('click',()=>{if(!this.user)this.open();else void this.save();});
    for(const [key,cfg] of Object.entries(GAMES)) {
      try {
        const stored=JSON.parse(localStorage.getItem(key==='ssq'?'1eak-draw-history-v1':`1eak-${key}-history-v1`)||'[]');
        if(Array.isArray(stored))for(const r of stored.slice(0,20))if(r&&r.model===cfg.model&&Number.isInteger(r.seed)&&Array.isArray(r.events)&&r.events.length===cfg.draws.reduce((a,b)=>a+b,0)&&typeof r.date==='string')
          this.legacy.push({...r,id:`legacy-${key}-${r.seed}-${Date.parse(r.date)}`,game:key as GameId});
      }catch{/* Existing device records remain untouched. */}
    }
    this.renderAccount();void this.refreshSession();
    if(this.resetToken){this.mode='reset';this.open();}
    else if(verified||linkError){this.open();this.message(verified?'邮箱验证成功，请登录。':'邮件链接无效或已过期，请重新申请。');}
    else if(query.get('account')==='1'){this.open();}
  }
  private async api<T>(path:string, body?:unknown):Promise<T> {
    const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
      headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok){if(response.status===401&&path.startsWith('/api/records')){this.generation++;this.user=null;this.records=[];this.renderAccount();this.changed();}
      throw new Error(response.status===429?'操作太频繁，请稍后重试。':result.code==='EMAIL_NOT_VERIFIED'?'请先验证邮箱，可点击下方重新发送。':result.code==='INVALID_EMAIL_OR_PASSWORD'?'邮箱或密码不正确。':response.status>=500?(result.message==='邮件服务尚未接通，请稍后再试。'?result.message:'账户服务暂时不可用，请稍后重试。'):result.code==='INVALID_TOKEN'?'链接无效或已过期，请重新申请。':'操作未完成，请检查输入或重新申请邮件链接。');}
    return result as T;
  }
  async refreshSession() {
    const generation=++this.generation;
    try {
      const session=await this.api<{user:User}|null>('/api/auth/get-session');
      if(generation!==this.generation)return;
      this.user=session?.user??null;this.records=[];this.renderAccount();this.changed();
      if(this.user)await this.loadRecords();
    }catch{if(generation===this.generation){this.user=null;this.records=[];this.renderAccount();this.changed();}}
  }
  private renderAccount() {
    const button=document.getElementById('account-open')!;
    button.textContent=this.user?'我的记录':'登录 / 注册';
    button.title=this.user?.email??'登录后保存和查看记录';
    document.getElementById('account-logout')!.classList.toggle('hidden',!this.user);
    this.renderSave();
  }
  private renderSave(){
    const b=document.getElementById('save-round') as HTMLButtonElement;
    b.classList.toggle('hidden',!this.pending);
    b.disabled=!!this.user&&this.savedFor===this.user.id;
    b.textContent=b.disabled?'已保存':this.user?'保存本场':'登录后保存';
  }
  completed(draw:SavedDraw){this.pending=draw;this.savedFor='';this.renderSave();if(this.user)void this.save();}
  clearRound(){this.pending=undefined;this.savedFor='';this.renderSave();}
  private async save(){
    if(!this.user||!this.pending)return;
    const userId=this.user.id,draw=this.pending;
    try{await this.api('/api/records',draw);if(this.user?.id!==userId)return;
      if(this.pending?.id===draw.id)this.savedFor=userId;this.renderSave();this.notify('本场结果已保存到账户。');await this.loadRecords();
    }catch(e){this.notify(e instanceof Error?e.message:'保存失败，请点击保存重试。');}
  }
  async loadRecords(){
    if(!this.user)return;
    const generation=this.generation;this.loading=true;this.error='';this.changed();
    try{const result=await this.api<{records:SavedDraw[]}>(`/api/records?game=${this.game}`);if(generation===this.generation)this.records=result.records;}
    catch{if(generation===this.generation)this.error='记录加载失败，请重试。';}
    finally{if(generation===this.generation){this.loading=false;this.changed();}}
  }
  renderHistoryIntro(container:HTMLElement):boolean {
    if(!this.user){const p=document.createElement('p');p.className='history-empty';p.textContent='访客可以直接开奖。登录后保存结果，随时在其他设备查看与回放。';
      const b=document.createElement('button');b.className='secondary';b.textContent='登录 / 注册';b.onclick=()=>this.open();container.append(p,b);return false;}
    const owner=document.createElement('p');owner.className='account-owner';owner.textContent=`${this.user.name} · ${GAMES[this.game].title}记录（最多 100 场）`;container.append(owner);
    if(this.loading||this.error){const p=document.createElement('p');p.className='history-empty';p.textContent=this.error||'正在读取记录…';container.append(p);if(this.error){const retry=document.createElement('button');retry.className='secondary';retry.textContent='重试';retry.onclick=()=>void this.loadRecords();container.append(retry);}return false;}
    const legacy=this.legacy.filter(r=>r.game===this.game);
    if(legacy.length){const b=document.createElement('button');b.className='legacy-import secondary';b.textContent=`导入本机旧记录（${legacy.length} 场）`;
      b.onclick=async()=>{const userId=this.user?.id;b.disabled=true;let count=0;for(const record of legacy){if(this.user?.id!==userId)break;try{await this.api('/api/records',record);count++;this.legacy=this.legacy.filter(r=>r.id!==record.id);}catch{break;}}
        this.notify(`已导入 ${count} 场；本机原记录仍保留。`);await this.loadRecords();};container.append(b);}
    return true;
  }
  open(){if(this.user){document.getElementById('history')!.scrollIntoView({behavior:'smooth',block:'center'});return;}
    this.drawDialog();if(!this.dialog.open)this.dialog.showModal();
    void this.api<{accountsReady:boolean}>('/api/status').then(status=>{if(!status.accountsReady&&this.dialog.open)this.message('邮件服务正在配置，注册与找回密码暂未开放。仍可关闭窗口直接开奖。');}).catch(()=>{});}
  private drawDialog(){
    const register=this.mode==='register',forgot=this.mode==='forgot',reset=this.mode==='reset';
    this.dialog.innerHTML=`<button class="account-close" type="button" aria-label="关闭登录窗口">×</button><div class="eyebrow">YOUR MOMENTS</div><h2 id="account-title">${register?'留下你的偶然':forgot?'找回密码':reset?'设置新密码':'欢迎回来'}</h2><p class="account-description">${forgot?'我们会向已注册邮箱发送重置链接。':reset?'新密码至少 12 个字符。':register?'密码至少 12 个字符。验证邮箱后，即可保存自己的开奖记录。':'登录后，开奖记录随你跨设备保存。'}</p>
      <form>${register?'<label>昵称<input name="name" autocomplete="nickname" maxlength="40" required></label>':''}${!reset?'<label>邮箱<input name="email" type="email" autocomplete="email" maxlength="254" required></label>':''}${!forgot?`<label>${reset?'新密码':'密码'}<input name="password" type="password" autocomplete="${register||reset?'new-password':'current-password'}" minlength="${register||reset?12:1}" maxlength="128" required></label>`:''}
      <p class="account-message" role="status" aria-live="polite"></p><button class="primary account-submit" type="submit">${register?'注册账户':forgot?'发送重置链接':reset?'保存新密码':'登录'}</button></form>
      <div class="account-links">${!reset?`<button type="button" data-mode="${register||forgot?'login':'register'}">${register||forgot?'返回登录':'创建账户'}</button>${!register&&!forgot?'<button type="button" data-mode="forgot">忘记密码</button><button type="button" id="verify-resend">重发验证邮件</button>':''}`:'<button type="button" data-mode="login">返回登录</button>'}</div><p class="account-footnote">无需登录也能体验全部开奖玩法。邮箱仅用于账户验证和密码恢复；模拟结果不是官方开奖结果。</p>`;
    this.dialog.querySelector('.account-close')!.addEventListener('click',()=>this.dialog.close());
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.onclick=()=>{this.mode=b.dataset.mode as typeof this.mode;this.drawDialog();});
    this.dialog.querySelector('form')!.addEventListener('submit',e=>{e.preventDefault();void this.submit();});
    this.dialog.querySelector('#verify-resend')?.addEventListener('click',()=>void this.resend());
  }
  private message(text:string){this.dialog.querySelector('.account-message')!.textContent=text;}
  private fields(){return new FormData(this.dialog.querySelector('form')!);}
  private async resend(){const form=this.dialog.querySelector('form')!;const email=form.elements.namedItem('email') as HTMLInputElement;
    if(!email.reportValidity())return;const b=this.dialog.querySelector('#verify-resend') as HTMLButtonElement;b.disabled=true;
    try{await this.api('/api/auth/send-verification-email',{email:email.value,callbackURL:`${location.origin}/?game=${this.game}&verified=1`});this.message('如果邮箱需要验证，将收到验证邮件。请检查垃圾邮件。');}catch(e){this.message(e instanceof Error?e.message:'发送失败');}finally{b.disabled=false;}}
  private async submit(){
    const fields=this.fields(),b=this.dialog.querySelector('.account-submit') as HTMLButtonElement; b.disabled=true;this.message('正在处理…');
    try {
      if(this.mode==='register'){
        await this.api('/api/auth/sign-up/email',{name:fields.get('name'),email:fields.get('email'),password:fields.get('password'),callbackURL:`${location.origin}/?game=${this.game}&verified=1`});
        this.message('请前往邮箱完成验证，再返回登录。若已有账户，可直接登录或找回密码。');(this.dialog.querySelector('[name="password"]') as HTMLInputElement).value='';
      }else if(this.mode==='forgot'){
        await this.api('/api/auth/request-password-reset',{email:fields.get('email'),redirectTo:`${location.origin}/?game=${this.game}`});this.message('如果邮箱已注册，将收到重置链接。请检查垃圾邮件。');
      }else if(this.mode==='reset'){
        if(!this.resetToken)throw new Error('重置链接无效，请重新申请。');
        await this.api('/api/auth/reset-password',{token:this.resetToken,newPassword:fields.get('password')});this.resetToken=null;this.mode='login';this.drawDialog();this.message('密码已更新，请使用新密码登录。');
      }else{
        await this.api('/api/auth/sign-in/email',{email:fields.get('email'),password:fields.get('password')});await this.refreshSession();
        if(!this.user)throw new Error('登录状态未能确认，请重试。');this.dialog.close();this.dialog.replaceChildren();this.notify('已登录。');
      }
    }catch(e){this.message(e instanceof Error?e.message:'网络连接失败，请重试。');}finally{b.disabled=false;}
  }
  private async logout(){
    try{await this.api('/api/auth/sign-out',{});this.generation++;this.user=null;this.records=[];this.savedFor='';this.renderAccount();this.changed();this.notify('已退出，账户中的记录仍会保留。');}
    catch{this.notify('退出失败，请检查网络后重试。');}
  }
}
