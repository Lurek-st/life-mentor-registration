# 部署指南

此项目的部署目标为 Cloudflare Pages（静态资源与 `_worker.js`）和 D1 数据库。以下指令只用于**你自己的新项目与数据库**。本仓库没有公共报名演示站，也不提供作者的生产资源。

已有 v2 系统请先看 [升级指南](UPGRADE-v3.md)，以下初始化命令仅适用于新建空库。

## 1. 先本机验证

完成 README 的快速开始与测试。使用自己的 Cloudflare 账户，在控制台确认当前计划、用量和费用；需要时由账户负责人处理账单。项目不要求购买自定义域名，Pages 可提供站点地址，但校园或单位网络是否能访问，需要在实际网络验证。

## 2. 建立演示项目

```sh
npx wrangler login
npx wrangler pages project create YOUR_PROJECT --production-branch main
npx wrangler d1 create YOUR_DEMO_DATABASE
```

把 `wrangler.jsonc.example` 复制为 `wrangler.jsonc`，填写返回的数据库名称、ID 和自己的 Pages 项目名。保留 `APP_MODE: "preview"`，为 `DATA_SPACE` 使用独立值，例如 `my-demo-v1`。实际配置已在 `.gitignore` 中排除。

初始化**空的演示库**，先核对名称和账户：

```sh
npm run setup
npx wrangler d1 execute YOUR_DEMO_DATABASE --config wrangler.jsonc --remote --file=work/seed-demo.sql
```

`--remote` 会修改云数据库；演示种子包含虚构排期，不要导入正在使用的数据库。

## 3. 设置密钥并部署

为云环境生成两份独立随机值：`ADMIN_PASSWORD` 建议至少 24 个随机字符；`APP_SECRET` 使用至少 32 字节随机材料。分别保存到密码管理器，通过交互提示输入。不要复用本机的演示密钥，也不要把值写进命令行、GitHub 或文档。

```sh
npx wrangler pages secret put ADMIN_PASSWORD --project-name YOUR_PROJECT
npx wrangler pages secret put APP_SECRET --project-name YOUR_PROJECT
npm run build
npx wrangler pages deploy dist --project-name YOUR_PROJECT --branch main
```

进入 Pages 项目设置，核对**生产环境**的 `DB` 绑定、普通变量和两个 secret，必要时重新部署。这里的“生产环境”是 Pages 的主分支环境；只有 `APP_MODE=formal` 才表示本应用接收正式报名。

本站采用 Pages Advanced Mode。不要只把 `src/` 上传为静态站，也不要把 `_worker.js` 排除。构建产物的 `_routes.json` 将 `/api/*` 交给 Worker，其他路径使用静态资源。

## 4. 正式使用

推荐另外创建正式 Pages 项目和正式 D1，避免演示分支误连正式数据。正式库只导入结构：

```sh
npx wrangler d1 execute YOUR_FORMAL_DATABASE --config wrangler.jsonc --remote --file=schema/v2.sql
```

将私有配置指向正式项目与正式库，设置 `APP_MODE=formal`、唯一的 `DATA_SPACE`（例如 `my-training-2026`）及 `CANONICAL_ORIGIN=https://YOUR_PROJECT.pages.dev`（准确的正式 HTTPS 域名，不带末尾斜线），使用独立密钥并再次构建部署。空库没有轮次和场次，需在 `/#staff` 新建轮次、再创建真实活动。不要将演示库里的测试报名直接转为正式名单。

发布报名链接前：

1. 核对 `/api/health` 返回 `ok: true`、`mode: "formal"`，`/api/sessions` 返回预期 `dataSpace`。
2. 后台确认每场主题、地点、日期、截止、容量，以及全局报名开关、每人可报场数、自行取消规则。
3. 修改信息使用说明、组织方联系途径和保存期限，明确谁能看名单、怎样处理更正及删除。
4. 在实际使用的微信和校园/单位网络验证打开、报名、查看、取消；测试资料由工作人员处理。
5. 确定负责人员、备份存放位置与恢复演练。不要对正式站运行仓库的变更性测试。

缺少正确的 `CANONICAL_ORIGIN` 时正式云 API 会返回配置未完成；部署别名上的正式 API 被拒绝。此前旧部署不会因此自动受到保护，仍需退役或设置访问策略。正式主网址应保持可供参加者访问。

## 维护提示

- GitHub Actions 只做本机测试；没有自动部署。更新网站必须在自己的环境手动执行部署。
- `APP_SECRET` 参与工号哈希、请求校验和后台密码摘要。已有数据时不要随意替换；需要迁移策略，否则会破坏去重或口令校验。备份恢复必须保留原值，详见运维文档。
- 修改网站地址或 `DATA_SPACE` 会影响浏览器保存的个人凭证；迁移前安排好凭证导出、导入与用户沟通。
- 修改 Pages 配置后检查实际绑定；预览和正式环境不能仅靠页面标签区分，必须使用独立数据库。
- 本地测试不证明云端免费额度、账单计划、网络可达性或长期可用性。定期核查服务商用量。

官方参考（命令和设置以服务商当前文档为准）：[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[Wrangler 配置](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)、[数据库与环境绑定](https://developers.cloudflare.com/pages/functions/bindings/)、[Pages Functions 费用](https://developers.cloudflare.com/pages/functions/pricing/)、[D1 费用](https://developers.cloudflare.com/d1/platform/pricing/)。
