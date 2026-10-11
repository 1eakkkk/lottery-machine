/** Record failures must not be described as email-link failures. */
export function accountErrorMessage(path:string,status:number,result:{message?:unknown;code?:unknown}){
  if(status===429)return '操作太频繁，请稍后重试。';
  if(path.startsWith('/api/records')){
    if(status===401)return '登录状态已失效，请重新登录后保存本场。';
    if(status>=500)return '记录服务暂时不可用，本场尚未确认保存，请稍后点击保存重试。';
    return typeof result.message==='string'&&result.message.length<=200?`记录保存或读取失败：${result.message}`:'记录保存或读取失败，请稍后重试。';
  }
  return result.code==='EMAIL_NOT_VERIFIED'?'请先验证邮箱，可点击下方重新发送。':result.code==='INVALID_EMAIL_OR_PASSWORD'?'邮箱或密码不正确。':status>=500?(result.message==='邮件服务尚未接通，请稍后再试。'?result.message:'账户服务暂时不可用，请稍后重试。'):result.code==='INVALID_TOKEN'?'链接无效或已过期，请重新申请。':'操作未完成，请检查输入或重新申请邮件链接。';
}
