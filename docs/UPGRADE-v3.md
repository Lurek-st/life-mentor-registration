# 从 v2.0.0 升级到 v3.0.0

v3 是开源通用版的新主版本。新报名增加必填联系邮箱；备份下载需要再次输入工作人员口令；正式云环境必须配置自己的 `CANONICAL_ORIGIN`。已有报名中的空邮箱保留原样，不补猜邮箱，不把报名自动记为到场。

**新安装直接使用 README 的初始化步骤，不运行下面的旧库迁移。**

## 已有 v2 数据库

1. 先保存 v2 的完整 JSON 备份、源码版本和私有配置。另行保管原 `APP_SECRET`；备份文件不包含它。保留旧部署作为恢复材料，但不让旧入口继续公开连接正式数据库。
2. 在 v2 后台暂时关闭报名，安排工作人员暂停修改。再次下载最终备份，核对人数和场次。升级期间不要让 v2 与 v3 同时写入同一个库。
3. 在独立测试数据库先恢复备份并演练。默认工号规则兼容 v2 的字母、数字、点、下划线和短横线；邮箱默认接受完整有效地址。不要在升级时顺便强制另一套身份规则。
4. 对**原本使用本仓库 v2.0.0、尚未执行这些迁移**的数据库，核对账户和数据库名称后依次应用迁移。以下 `--remote` 会修改你指定的云数据库。

```sh
npx wrangler d1 migrations list YOUR_DATABASE --config wrangler.jsonc --remote
npx wrangler d1 migrations apply YOUR_DATABASE --config wrangler.jsonc --remote
```

迁移保留原表数据，新增邮箱、工作人员补录、参会记录和核对表。Wrangler 用 `d1_migrations` 记录已执行文件，再次运行只处理未完成项。编号中的空缺是有意保留的，不需要补一份 0002。不要把 `schema/v2.sql` 当作旧库升级脚本：`CREATE TABLE IF NOT EXISTS` 不会给现有表添加字段。也不要给已用最新结构初始化的新库重复运行旧库迁移。

如果你的分支已经自行增加相同字段、没有迁移记录，或迁移中途报错，停止发布，先核对结构和迁移记录；不要手工删表或盲目重复 `ALTER TABLE`。

5. 配置 `APP_MODE=formal`、原 `APP_SECRET`、原 `DATA_SPACE`、工作人员口令和 `CANONICAL_ORIGIN=https://YOUR_PROJECT.pages.dev`。地址必须是 HTTPS origin，不带末尾 `/`、路径、参数或 `#staff`。构建并部署 v3，旧配置文件不要提交 Git。
6. 核对健康接口的 `release: "3.0.0"`、正式模式、旧场次与报名总数；抽查中文、前导零、旧凭证找回、取消状态和导出。已有记录默认保持待核对，独立到场补记保留其确认依据。验证后再开放报名。

## 通过备份恢复到新库

推荐在独立数据库验证恢复，原库先保留。工具只生成 SQL，不连接云端，不执行覆盖。

旧 JSON 备份：

```sh
node scripts/prepare-restore-v2.mjs work/backup.json work/restore.sql
```

v3 加密备份（PowerShell 7，密码输入隐藏，通过管道传给进程）：

```powershell
Read-Host -Prompt "备份密码" -MaskInput | node scripts/prepare-restore-v2.mjs work/backup.mentor-backup work/restore.sql --password-stdin
```

输出文件已存在时工具会拒绝覆盖。生成的 SQL **含明文个人资料和私密凭证的哈希**，只存受限私有位置。先向空的本机数据库导入并验收，再由维护者决定是否恢复到自己的空云库。恢复脚本拒绝已含业务数据的目标库。原 `APP_SECRET` 必须单独恢复；管理员登录会话和限流计数不恢复，工作人员需重新登录。

恢复旧 v2 JSON 时会补齐空邮箱和默认报名来源。v3 备份如果声明包含参会核对但缺失相关表，会被拒绝，不将缺失数据当成空表。密码错误或文件被改动也会拒绝。

## 回退

发布失败时先保持报名关闭。最稳妥的回退是将升级前备份恢复到独立空库，部署对应旧版源码并切换私有绑定；不要删除新表来强行降级。有新报名或核对结果产生后，先核对并保留这些增量，不能直接覆盖回旧快照。

仓库的 `npm run test:upgrade` 使用虚构数据，验证真实本机 D1 迁移、重复应用，以及随仓库发布的恢复命令。它不证明你的备份文件、账号配置或校园网络已通过验收。

参考：[Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。
