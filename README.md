# 一刻开奖

双色球三维机械开奖模拟网站。Rapier 3D WASM 计算球体和机器的真实碰撞，Three.js 显示透明球仓、双向旋转部件和底部出球通道。

- 已上线：https://lottery.1eak.cool
- 公开仓库：https://github.com/1eakkkk/lottery-machine
- 完整产品与实施方案：[PROJECT_PLAN.md](PROJECT_PLAN.md)

## 功能

33 个红球中逐个抽取 6 个，再从 16 个蓝球中抽取 1 个。支持电脑和手机、镜头切换、暂停继续、重新开始、开奖音乐与音效、结果复制、升序显示、本机最近记录及种子回放。

每位访客在本机独立模拟，无需账号或数据库。号码由球通过实际建模的出口产生，没有预先确定开奖号码的代码。初始球位按种子打乱，球号不决定质量、摩擦或运动规则。

球面号码使用固定曲面贴印，会随球体转动并被遮挡；球体材质与重复圆标参考福彩公开球组照片。点击开奖后播放原创合成音乐，完成后播放结束短奏与柔和结果音乐。声音开关统一控制，暂停与后台同时静音。复制结果不包含种子。

每个球经过真实物理出球判定后，立即进入横向展示架的下一个固定位置，六红一蓝按出球顺序逐个排齐；从首球起可切换结果特写，完成后不再重新排列。桌面支持指向鼠标位置的滚轮缩放、右键平移和双击放大；移动按钮可以切换拖动模式。手机三维区域支持双指缩放/平移、双击放大，操作范围限制在三维区域内。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
npm test
npm run build
```

`npm test` 检查完整出球、不放回、号码范围、先红后蓝及相同输入的状态复现。通过 `DRAW_TEST_COUNT` 可以扩大种子数量。物理测试具有实际运算量，不是预生成结果的单元测试。

## 发布

使用 Cloudflare Workers Static Assets；构建输出为 `dist/`，配置见 `wrangler.jsonc`。

```sh
npm run build
npx wrangler deploy
```

运行前需要登录具有目标账户和域名权限的 Cloudflare 账号。`routes` 只连接 `lottery.1eak.cool`。源码和依赖锁文件应一同提交，凭据不能提交到仓库。

GitHub Actions 负责构建与物理检查。Cloudflare 已连接该仓库的 main 分支，推送后运行 `npm test && npm run build` 并自动部署；已验证一次真实提交触发成功发布。预览分支部署关闭。验收范围和实际限制见 [DELIVERY.md](DELIVERY.md)。

## 物理模型的边界

依据制造商公开的双色球同类机械设备原理制作双逆向旋转混合和底部出球。搅拌部件形状、装球方式和通道是经过稳定性验证的简化模型，没有真实设备内部测量数据。该网站与中国福利彩票官方无关联，也没有使用官方视频或标志作为网站资产。

固定物理步长为 1/120 秒，物理在 Web Worker 中运行。低性能设备可能播放较慢，不能通过跳过物理步骤追赶时间。后台标签页暂停推进；返回后继续。回放要求相同模型版本和依赖锁定版本，不能将种子单独当作永久、跨所有版本的证明。

模拟结果不代表官方开奖，不用于预测。不承诺严格等概率；小规模稳定性测试也不是统计公平性认证。卡球、穿出边界或连续多球异常会终止场次并提示，不能用随机号码补齐。

## 参考

- [Ryo-Catteau Myosotis：双逆向旋转、底部出球](https://www.ryo-catteau.com/en/myosotis.htm)
- [四川福彩：双色球规则](https://www.scflcp.com.cn/yxgz/823145252.jhtml)
- [Rapier：确定性约束](https://rapier.rs/docs/user_guides/javascript/determinism/)
- [Cloudflare：静态资源](https://developers.cloudflare.com/workers/static-assets/)
