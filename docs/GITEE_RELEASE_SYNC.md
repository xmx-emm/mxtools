# 自动同步 GitHub 发行到 Gitee

目标仓库固定为 `mengxin_code/mxtools`，来源为 `xmx-emm/mxtools`。
GitHub 仓库的 Actions secret `GITEE_TOKEN` 需要具备目标仓库的 Git 推送、
Release 创建/更新和附件读写权限。令牌只在同步步骤中使用，不写入 Git 配置文件。

## 日常发布

1. 在 GitHub 草稿 Release 中上传完整附件，再发布正式版本 `vX.Y.Z`。
2. `Sync release to Gitee` 自动执行，无需在 Gitee 点仓库同步。
3. 查看 Actions 结果；成功时 Gitee 发行说明标记附件已逐个验证 SHA-256。

工作流复制标题、说明及符合大小上限的发行附件，不重新构建应用。
它只推送对应 Git tag 和其可达提交，不移动 Gitee 分支，不强制覆盖冲突 tag。
Gitee 首页代码分支是否同步是独立设置，不影响发行附件同步。

默认附件上限为 100,000,000 字节。超过上限的文件在 Gitee 发行说明中保留
GitHub 下载链接，并明确标记未镜像。当前 v0.0.7 的约 217 MB 离线包使用此方式；
普通安装版与便携版可镜像。若目标仓库实际配额允许更大的附件，可配置 GitHub
Actions variable `GITEE_MAX_ASSET_BYTES`。仓库总附件配额仍由 Gitee 执行。

## 补同步与重试

在 GitHub Actions 打开 `Sync release to Gitee` → `Run workflow`，
选择默认分支，输入 `v0.0.7` 或其它已发布的正式 tag。
工作流文件必须先进入 GitHub 默认分支，才能看到手动运行入口。
手动补同步读取默认分支的同步脚本，无需修改旧版本 tag。

失败后可重跑同一次 Actions，或重新手动运行同一 tag。脚本按 tag 复用发行，
重新下载并校验同名附件，只上传缺少的文件。服务端接受上传但响应丢失时，
下次运行会发现并校验该附件。遇到同名但内容不同、重复附件或冲突 tag 会失败，
不会自动删除或覆盖。请先核查冲突，避免改写已经分发的正式版本。

读取请求对网络错误、429 和 5xx 最多尝试三次；写入请求不盲目自动重试。
附件上传使用 runner 自带的 curl（HTTP/1.1），令牌经 stdin 传入，不放在参数或文件中。
上传有连接、低速和总时限；Node fetch 在实际 Gitee 上传中持续超时，未用于附件 POST。
实测 GitHub runner 到 Gitee 的附件上传很慢，因此单个附件允许最多 15 分钟，
工作流允许 40 分钟；连续 30 秒低于 1 KB/s 仍会中断，不会无限挂起。
同步中断时发行说明保留未完成提示。下载和校验完成后才写入完成提示。
若发布后继续添加附件，需要手动补同步；`release.published` 不监听附件上传事件。
若未来由另一个工作流使用默认 `GITHUB_TOKEN` 发布 Release，该事件不会触发
新的 Actions，应从发布流程显式调用同步脚本或手动 dispatch。

## 与应用内在线更新的关系

若原发行含 `.sig` 和 `latest.json`，附件仍原样复制，`latest.json` 最后上传。
全部附件校验成功后，`gitee-updater-manifest.mjs` 核对版本、安装包名和签名，
生成只替换下载地址的国内清单，写入独立的 `updates` 分支 `latest.json`。
该分支不移动代码主分支，旧版本补同步不会降低更新清单版本。
公开读取地址为 `https://gitee.com/mengxin_code/mxtools/raw/updates/latest.json`。
v0.0.7 等没有签名清单的历史发行只同步附件，不生成更新清单。
0.0.8 客户端优先 Gitee，异常时回退 GitHub；操作说明见 `ONLINE_UPDATE_RELEASE.md`。

## 本地检查

```powershell
npm.cmd test -- tests/scripts/sync-gitee-release.test.ts
$env:RELEASE_TAG = 'v0.0.7'
node scripts/sync-gitee-release.mjs --dry-run
```

`--dry-run` 只读取 GitHub 的公开发行元数据，显示可镜像/仅链接数量；
无需 Gitee 令牌，不推 tag、不上传、不更新发行，也不证明 Gitee 写权限可用。

参考：[Gitee Release API](https://gitee.com/sdk/gitee5j/blob/main/docs/RepositoriesApi.md)、
[GitHub Release 事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)。
