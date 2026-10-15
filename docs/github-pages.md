# 用 GitHub Pages 发布餐账

网页代码放在 GitHub，登录和采购记录仍由 Supabase 保存。
本项目的 Actions 工作流会测试、构建并部署网站。代码上传成功不等于网站已上线。

## 1. 设置公开连接 key

打开 GitHub 仓库的 **Settings → Secrets and variables → Actions**。
点击 **New repository secret**：

- Name：`VITE_SUPABASE_PUBLISHABLE_KEY`
- Secret：Supabase 的 Publishable key，通常以 `sb_publishable_` 开头。

点击 **Add secret**。不要使用数据库密码、Secret key 或 service-role key。
GitHub 的配置与 Codex 云环境配置独立，需在这里单独保存一次。
Publishable key 会包含在网页构建中，这是 Supabase 的正常使用方式；采购数据
由用户登录和数据库权限规则保护。

## 2. 启用 Pages

打开 **Settings → Pages**，在 **Build and deployment → Source** 选择
**GitHub Actions**。免费方案通常需要公开仓库；私有仓库的 Pages 可用性取决于
GitHub 套餐。不要为了开启 Pages 随意更改仓库可见性。

## 3. 运行部署

打开 **Actions → Deploy restaurant website → Run workflow**，选择 `main`
后运行。以后对 `main` 的推送会自动重新部署。

两个任务 `build` 和 `deploy` 都成功后，部署任务会提供实际网站地址。
按照当前账号和仓库名，预期地址为：

`https://zonhii90-cmd.github.io/Restaurant-Expense-Tracker/`

此地址在部署成功前可能返回 404，不代表网站已上线。

## 4. 首次使用检查

1. 使用已启用的管理员账号登录，不要使用数据库密码。
2. 输入一张真实采购单据，确认多项商品一起保存成功。
3. 刷新页面，确认采购记录仍在。
4. 查看月度报表并下载 Excel。
5. 再用另一台设备登录，确认能看到相同记录。

请在 Supabase 的 **Authentication → URL Configuration → Site URL** 设置
实际网站地址。当前应用使用邮箱和密码登录；员工账号的创建、密码重置和权限
管理仍在 Supabase 后台完成。

代码中没有保存任何登录密码或私密服务密钥。不要关闭数据库 RLS 来排查错误。
