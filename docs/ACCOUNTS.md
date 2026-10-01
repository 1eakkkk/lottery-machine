# 可选账户与开奖记录

访客可以使用全部五种彩票模拟、镜头和复制功能。只有邮箱验证后登录的账户能够保存和查看历史；退出登录会隐藏记录，服务器仍保留该账户的记录。每个玩法保留最近 100 场，旧浏览器记录由用户主动导入，原记录不会被删除。模拟结果来自浏览器，不是服务器认证的开奖结果。

## 邮件配置（Resend 免费方案）

1. 当前 `1eak.cool` 已在 Resend 验证通过，发件人为 `accounts@1eak.cool`，无需修改 DNS。若改用其他域名，先在 Resend 验证，再相应修改 `wrangler.jsonc` 中 `MAIL_FROM`，不要覆盖原有邮件记录。
2. 创建仅允许发送邮件、限定该域名的 API Key。在 Cloudflare 的 `lottery-machine → 设置 → 变量和机密` 中添加 **Secret** `RESEND_API_KEY`。不要发送到聊天，不要放进 GitHub 仓库，也不要添加为普通公开变量。
3. 应用并部署配置。在 `/api/status` 确认 `accountsReady: true`，用自己的邮箱注册，实际完成验证，再测试找回密码。

`BETTER_AUTH_SECRET` 为独立随机密钥，通过 Cloudflare Secret 保存，不与邮件密钥相同。密钥缺失时账户服务不会虚报注册成功。发信失败需重新发送验证邮件。验证码链接一小时有效，密码恢复链接 30 分钟有效；修改密码将撤销原登录会话。

发信有每个邮箱每小时 3 封、全站每天最多 90 封的限制（包含失败尝试），给免费邮件额度留出余量。超过限额不自动升级付费。Resend 的官方套餐以 https://resend.com/pricing 为准。

## 本地开发与检查

先执行 `npm run build` 和 `npm run db:local`。创建被 Git 忽略的 `.dev.vars`，配置随机 `BETTER_AUTH_SECRET`、`AUTH_ORIGIN="http://localhost:8787"`；需要实际收信时再加入 `RESEND_API_KEY`。执行 `npm run dev:accounts`，访问该地址。单独使用 Vite 不提供账户后台。

执行 `npm run test:accounts`，使用本地隔离的 Workers 运行时与 D1 测试库，邮件服务被测试替身捕获，不发送真实邮件。涵盖注册验证、登录、记录授权与账户隔离、重复保存、请求来源检查、找回密码、令牌一次性、退出及登录限流。真实邮件交付和免费层 CPU 限制仍应通过上线后的实际注册确认，不应降低密码哈希强度来规避运行限制。

## 数据与安全边界

密码使用 Better Auth 默认 scrypt 哈希，不保存明文。登录状态通过 HttpOnly Cookie 保存，生产为 HTTPS、Secure、SameSite=Lax，仅当前站点可用。数据库记录按服务器会话中的用户 ID 查询，不相信客户端传入的用户 ID。恢复密码撤销旧会话。注册邮箱交给 Resend 发送账户验证与恢复邮件，不用于营销。前端只显示当前登录人的记录，不将新记录写入本地存储。

上线前执行 `npm run db:remote` 创建新增表；后续修改使用新的迁移文件，不改写已经执行的迁移。现有主域名和其他站点数据库不受影响。
