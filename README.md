<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge 合版 2.0.0-rc3</h1>

<p align="center"><strong>1.1.71 的引擎 + 1.7.18 的权限账簿 · 适配 DeepSeek Harness 0.2.2-rc.3</strong></p>

<p align="center">
  <em>上游来源：<code>YuJunZhiXue/dsh-purge</code> v1.1.71（镜像：<code>ZXEB/dsh-purge</code>）+ 社区线 <code>dsh-purge-community</code> 1.7.18。本版把两条线的优点合成一个包，并在 0.2.2-rc.3 上逐条验证过。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0--rc3-1a73e8?style=flat" alt="version">
  <img src="https://img.shields.io/badge/dsh-0.2.2--rc.3-blue" alt="dsh 0.2.2-rc.3">
  <img src="https://img.shields.io/badge/patches-88-7c3aed?style=flat" alt="88 patches">
  <img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=fff" alt="Node.js">
</p>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

> **装完必须重启宿主。** 插件在启动时自检并重新应用补丁；只把文件放进 `node_modules` 不重启，等于没装。首次装好后的顺序是：**重启 → 右侧栏「清洗」→「应用」**（或命令行 `dsh-purge --apply`）。

---

## 目录

- [一、这是什么](#一这是什么)
- [二、这版比上游 1.1.71 多了什么](#二这版比上游-1171-多了什么)
- [三、环境要求](#三环境要求)
- [四、安装](#四安装)
- [五、目录结构与运行时文件](#五目录结构与运行时文件)
- [六、使用](#六使用)
- [七、配置项](#七配置项)
- [八、补丁构成（88 条）](#八补丁构成88-条)
- [九、红军模式（演练台）](#九红军模式演练台)
- [十、工作原理](#十工作原理)
- [十一、更新、还原、卸载](#十一更新还原卸载)
- [十二、常见问题（FAQ）](#十二常见问题faq)
- [十三、兼容性](#十三兼容性)
- [十四、声明、署名与许可](#十四声明署名与许可)

---

<a id="一这是什么"></a>

## 一、这是什么

`dsh-purge` 是给**本机已安装的官方 DeepSeek Harness** 用的红队 / 鲁棒性评测插件。它不改模型，改的是**宿主层**：Harness 在运行时决定提示词、审批闸门、沙箱策略、工具可见性、会话迁移。很多「模型不答」其实不是模型拒绝，而是宿主层先拦住了。这个插件把这两层分开，让你在自己的安装上做受控评测。

本包是**合版**，三条血脉各取所长：

| 血脉 | 提供了什么 |
|---|---|
| 上游 1.1.71（`ZXEB/dsh-purge` 镜像） | 补丁引擎、桌面 / Web 双宿主、侧栏面板、提示词加密内置、演练台骨架 |
| 本包的 rc.3 适配层 | 在 0.2.2-rc.3 上把锚点逐条重打（`lib/rc3-desktop-anchors.js`、`lib/rc3-extra-anchors.js`），并补 `{{cwd}}` 重注册与 DSML 正文兜底 |
| 社区 1.7.18（`dsh-purge-community`） | **权限账簿**（14 条 `permissionOverride` + `tuning.json` 总开关 + 迁移回滚）、路径围栏、#89–#96、红军模式 64 工具与证据账本 |

| 你会得到 | 作用 |
|---|---|
| **dsh-purge 侧栏** | 会话标题旁的按钮，右侧栏两页：**清洗** / **演练台** |
| **清洗** | 分组显示 88 条补丁状态，应用 / 还原 / 卸载，提示词编辑，多套规则集 |
| **权限账簿** | 14 条改权限的补丁单独成册，可整组关、可回滚、换包时自动迁移 |
| **三个模式** | 红队模式、无限制模式、无限制模式 · 子任务（见[第六节](#六使用)） |
| **演练台** | 授权后的资产库、技能、证据账本（仅用于自管主机、离线靶标或书面授权演练） |
| **启动自检** | 每次启动检查并重新应用；`node_modules` 被覆盖后不用手改文件 |

不写死盘符：先看 `$DSH_HOME`，再看 dsh 启动器旁的 `.dsh`，最后回落 `~/.dsh`。不改 Harness 源码树，只改本机 `@deepseek-ai/*` 包产物与 `$DSH_HOME` 下的覆盖文件。

---

<a id="二这版比上游-1171-多了什么"></a>

## 二、这版比上游 1.1.71 多了什么

| 项 | 上游 1.1.71 | 本版 2.0.0-rc3 |
|---|---|---|
| 补丁数 | 82 | **88**（新增 #89–#96 中的 8 条，剔除被取代的 #85 / #86） |
| 适配宿主 | `dshTarget: 0.2.0-rc.2` | **`0.2.2-rc.3`**，在原始 rc.3 包树上跑通（见[第十节](#十工作原理)） |
| 权限补丁 | 无标记，一律硬打 | **14 条带 `permissionOverride`**，`tuning.json` 一句 `permissionPatches=false` 整组关 |
| 换包 / 卸载 | 只还原备份 | **权限账簿迁移**：按备份清单重放，把权限配置改回去 |
| 显式工具面 | — | #89 收口 `ask_user` 的无限等待、#90 恢复原生插话、#91/#92 桌面 cookie 与 header 上限、#93/#94 品牌中性化、#95/#96 inspector 帧预算 |
| 红军模式 | 56 工具 | **64 工具**（+证据账本 4 个、未知项 3 个、未闭环计数 1 个）+ `UnknownRegistry` |
| 预设 | 只有 `redteam` | `redteam` + `unrestricted` + `unrestricted · 子任务`（rc.3 下由内存注入拆出，见第六节） |
| Windows 备份 | `hostFs` 缺 `closeSync`，`.dshpurge.bak` 一个都建不出来（rename 报 `EPERM`） | 已修，63 个备份正常落盘 |
| 区域闸 | 默认开（境外 / 银行域名停车） | **默认关**，`dsh-purge --tuning routingGate=true` 才启用 |

细账（每条改了什么、为什么这么改、验证数字）在 [MERGED.md](MERGED.md)；0.2.2-rc.3 适配过程在 [ADAPTATION.md](ADAPTATION.md)；版本流水在 [release-notes.md](release-notes.md)。

---

<a id="三环境要求"></a>

## 三、环境要求

| 项 | 要求 |
|---|---|
| dsh | **0.2.2-rc.3**（本包 `dshTarget` 即此值）。0.2.0-rc.2 / rc.1 上大部分补丁仍能落，但 #35 / #60 / #62 / #12 会缺 rc.3 的拆包路径与文案锚点 |
| 宿主 | 官方桌面 EXE（profile `desktop`）或官方 `dsh web`（profile `web`）；两个宿主**分别安装、分别应用** |
| Node.js | **≥ 18**；Windows 下要「无闪窗」与 fd 直通建议 **≥ 22** |
| 包管理器 | 用 dsh 自带的 pnpm（`dsh plugin` 会调用它），不必单独装 |
| 网络 | 本地目录安装**完全离线**可用；「检查更新」才会访问 GitHub |

---

<a id="四安装"></a>

## 四、安装

本包是**本地目录**形态，不是 npm 源（上游 npm 包已 404）。三条路，任选一条。

### 4.1 方式 A：插件面板添加本地目录（推荐）

宿主里 **设置 → 插件 → 添加插件 → 本地目录**，选到**能直接看到 `package.json` 的那一层**：

```
C:\Users\Administrator\Documents\deepseek-harness\1\dsh-purge-1.1.71 new
```

装完**完全退出宿主**（桌面端托盘右键退出，不是关窗口）再重开。

### 4.2 方式 B：`dsh plugin add`（CLI）

```powershell
# 先完全退出宿主
dsh plugin --profile desktop add "C:\Users\Administrator\Documents\deepseek-harness\1\dsh-purge-1.1.71 new"
# 重开宿主
```

`dsh` 不在 PATH 时用它自带的 cli 入口（路径按你的安装位置改）：

```powershell
& "E:\deepseek\resources\app\bin\dsh.cmd" plugin --profile desktop add "<目录>"
```

### 4.3 方式 C：手工 link（面板与 CLI 都失败时兜底）

profile 目录是 `%USERPROFILE%\.dsh\profiles\desktop`。改它的 `package.json`，在 `dsh.profile.bundles` 里加一项、在 `dependencies` 里加 `link:`，然后让 pnpm 建链接：

```jsonc
{
  "dsh": { "profile": { "bundles": ["…原有项", "dsh-purge"] } },
  "dependencies": { "dsh-purge": "link:C:/Users/Administrator/Documents/deepseek-harness/1/dsh-purge-1.1.71 new" }
}
```

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm install --lockfile-only=false
```

本机现在就是这个状态：`node_modules\dsh-purge -> ..\..\..\..\Documents\deepseek-harness\1\dsh-purge-1.1.71 new`，`pnpm-lock.yaml` 里 `specifier` / `version` 都是同一条 `link:`。**改源码后不需要重装**，重启宿主即生效。

### 4.4 安装后的三步（不做等于没装）

1. **完全退出并重开宿主**——插件在启动时才自检、才重新应用补丁。
2. 打开右侧栏 **清洗 → 应用**（或命令行 `dsh-purge --apply`）。
3. `dsh-purge --status` 看一遍：应当没有 `pending`，只剩环境性的 `missing_file`（见 [FAQ 3](#十二常见问题faq)）。

### 4.5 安装验证清单

```sh
dsh-purge --status        # 宿主版本、DSH_HOME、补丁 applied/pending、开关、账簿摘要
dsh-purge --help          # 子命令是否齐全（--status/--apply/--revert/--uninstall/--tuning/--edit）
```

模式下拉里应能看到 **红队模式 / 无限制模式 / 无限制模式 · 子任务** 三项。

---

<a id="五目录结构与运行时文件"></a>

## 五、目录结构与运行时文件

仓库（相对本 README）：

| 路径 | 说明 |
|---|---|
| `bin/dsh-purge.js` | CLI 入口（`--status / --apply / --revert / --uninstall / --tuning / --edit`） |
| `lib/core.js` | 补丁表与引擎：`ALL_PATCHES`、`applyPatches`、`patchStatus`、`targetFiles`、备份与还原 |
| `lib/merge-layer.js` | 治理层：`tuning.json` 读写、补丁开关、权限账簿回放、#89–#96 定义（不 import `core.js`，回调由调用方注入） |
| `lib/rc3-desktop-anchors.js` | 0.2.2-rc.3 桌面锚点覆盖（#14 #32 #35 #40 #53 #56 #76 #77 #80 #88） |
| `lib/rc3-extra-anchors.js` | rc.3 追加锚点（#12 审批文案、#35 `dsh-tools` 拒绝点） |
| `lib/presets.js` / `lib/presets-plugin.js` | 注册「无限制模式」与其子预设；内存注入旧 `toolFilter` 策略、剥离磁盘残留 |
| `lib/preset-compat.js` | 预设迁移层：`migratePresetDefinition` / `registerPresetDefinitions` / `backupPresetMigration` |
| `lib/path-boundary.js` / `lib/remove-tree.js` | 写文件前校验根目录（含 junction）；删目录不跟软链 |
| `lib/working-directory-compat.js` | rc.3 把工作目录移进服务后，重新注册 `{{cwd}}` |
| `lib/native-tool-compat.js` | DSML 正文泄漏兜底（清理 replay 后重问一次） |
| `lib/redteam/` | 演练台：工具（64）、事实库、证据账本、UI、预设组装 |
| `presets/redteam/`、`presets/unrestricted/` | 红队预设、无限制预设 |
| `skills/redteam/` | 随包技能 23 个（侦察、扫描、隧道、口令、横向、报告等） |
| `cordis.patch.yml` | bundle patch：注册 `dsh-purge`、`redteam`、`presets-plugin`、`store`、`ui` 五个入口 |
| `docs/` | banner、预览图、授权声明页、上游许可与披露文件 |
| `MERGED.md` / `ADAPTATION.md` / `release-notes.md` | 合版说明 / rc.3 适配说明 / 版本流水 |

运行时（`$DSH_HOME` 下，Web 与桌面各一份）：

| 文件/目录 | 说明 |
|---|---|
| `prompt-inject.md` | 会话覆盖段；用户文件，还原时保留 |
| `dsh-purge/tuning.json` | 权限账簿开关：`permissionPatches` 等六个键 |
| `dsh-purge/preset-migrations/` | 预设迁移备份（`unrestricted-<digest>/`，含原件与 manifest） |
| `dsh-purge/applied.json`、`override-state.json`、`installed-rev` | 补丁落点、覆盖状态、已应用版本 |
| `rules/`、`skills/<id>/SKILL.md`、`net-scope-allow.txt` | 规则集、导入的技能、「自己的服务器」白名单 |
| `redteam/` | 演练台事实库（SQLite）：`engagements/<靶标id>/assets.db`、`agents/`、`runs/`、`reports/`、`current` |

---

<a id="六使用"></a>

## 六、使用

```sh
# 命令行
dsh-purge --status                     # 宿主、DSH_HOME、补丁 applied/pending、开关、账簿
dsh-purge --apply                      # 应用全部补丁（提示词 + 代码 + shim + override）
dsh-purge --revert                     # 回滚还原
dsh-purge --uninstall                  # 卸载（已应用则先还原）
dsh-purge --tuning                     # 查看开关
dsh-purge --tuning permissionPatches=false   # 只保留非权限补丁
dsh-purge --edit                       # 编辑注入文件 prompt-inject.md

# 聊天命令
/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <压缩包或文件夹> | create <id> [说明] | delete <id> | help
/rewind

# 模型工具
purge_status   purge_apply   purge_revert
```

### 三个模式

| 模式 | 预设 id | 工具面 | 什么时候用 |
|---|---|---|---|
| 红队模式 | `redteam` | 64 个 `redteam_*` 工具 + 23 个随包技能 | 授权演练：资产、证据、报告 |
| 无限制模式 | `unrestricted` | 标准工具全集（34 行） | 只想要「不重复声明边界」的普通干活 |
| 无限制模式 · 子任务 | `unrestricted-child-b5beb73b2d` | 31 行（子会话去掉 `subagent_fork` / `workflow` / `ralph`） | 由父预设的 `subagent` 行自动指向；手动选它等于「直接当叶子执行者」 |

预设已存在时插件只做**就地修复**、不覆盖你的改动（`action: kept`）。要强制重铺一次：`REDTEAM_PRESET_REFRESH=1` 启动一次。

回退：输入框旁「回退一次 / 回退上一轮」，已发送内容回到输入框，这一轮发出的内容与已完成任务从当前对话撤掉；`/rewind` 等价。

---

<a id="七配置项"></a>

## 七、配置项

### 7.1 插件配置（`cordis.patch.yml` 的 `dsh-purge` 条目）

改 `$DSH_HOME/profiles/<desktop|web>/cordis.patch.yml` 后**重启宿主**生效：

```yaml
- id: dsh-purge
  config:
    enabled: true                 # 插件总开关
    autoApplyOnStart: false       # 启动时自动应用（默认关；开了才每次自检重应用）
    autoUpdateOnStart: false      # 启动时检查更新
    autoRevertOnMissing: false    # 保留字段
    injectOnce: false             # 保留字段
    stripMnemon: true             # 去掉 mnemon 段
    verbose: false                # 控制台详细日志
    postPrompt: ""                # 额外提示段（默认空）
    postPromptOrder: 5100         # 需大于内置全局顺序，否则该段被跳过
    autoRetry: true               # 失败自动重试
    retryMax: 3
    autoContinue: false           # 自动续跑
    continueMax: 3
    continueText: "继续"
    capabilityProtocol: true      # 注入能力协议段
    hooksDenyBypass: true         # 跳过 hooks 拒绝拦截
```

### 7.2 权限账簿（`$DSH_HOME/dsh-purge/tuning.json`）

这六个键只影响**治理层**，不动补丁内容：

| 键 | 默认 | 作用 |
|---|---|---|
| `permissionPatches` | `true` | 关掉则 14 条 `permissionOverride` 补丁整体停用（`--status` 里显示 `disabled`），再 apply 会按备份把权限配置改回去 |
| `contextManagement` | `false` | 上下文管理相关补丁的 opt-in 组 |
| `extraPatches` | `[]` | 默认关闭的补丁 id 列表，例如 `[89, 95]` |
| `routingGate` | `false` | 区域闸：开则「攻击类任务 + 境外/银行域名且不在白名单」时停车 |
| `rewind` | `false` | 回退相关补丁的 opt-in 组 |
| `refusalRetry` | `false` | 拒答重试相关补丁的 opt-in 组 |

```sh
dsh-purge --tuning                              # 查看
dsh-purge --tuning permissionPatches=false      # 写入
dsh-purge --tuning routingGate=true             # 打开区域闸
```

白名单在 `$DSH_HOME/net-scope-allow.txt`（面板「自己的服务器」写入，只认精确 IP 或完整主机名；网段、通配符、密钥、密码会被丢掉）。

---

<a id="八补丁构成88-条"></a>

## 八、补丁构成（88 条）

| 分层 | 条数 | 说明 |
|---|---|---|
| 提示词 | 27 | 改写系统提示词里的策略句、拒绝话术、工具说明 |
| 代码 | 49 | 直接改 `@deepseek-ai/*` 包产物：审批、沙箱、工具流水线、会话、压缩、桌面壳 |
| 工具 | 9 | 工具可见性与条数上限 |
| 兼容 | 3 | 0.1.5（1 条）、0.2.0（2 条）分支锚点 |

**14 条权限账簿**（`permissionOverride: true`）：

| id | 改什么 |
|---|---|
| #6 | 沙箱 `(deny file-write*)` → `(allow file-write*)` |
| #7 | 沙箱默认 `workspace-write` → `danger-full-access` |
| #8 | `cordis.patch.yml` 里 policy 三元式同步改默认值 |
| #9 | 审批 `never` 时直接 `allowed-once`，跳过整个 waterfall |
| #10 | 审批 schema 默认值 `.default("never")` |
| #13 | 提权梯度豁免 |
| #14 | 提权无条件授予（`approveEscalation` 直接 `return mode`） |
| #15 | sandbox confine 透传 |
| #16 | fs fence 关闭 |
| #35 | 用户拒绝 → 放行（覆盖 `escalation` + `dsh-tools` 两个真实拒绝点） |
| #51 | 新会话保住 full-access |
| #59 | 官方 auto-review 直通 |
| #60 | run_code 审批文案中性化（PTC 拆包后 4 个文件键） |
| #62 | 工具审批 fail-open（无审批通道 / agent-less / 通道不可用 → allow） |

**新增的 8 条（#89–#96，来自社区线）**：

| id | 名字 | 作用 |
|---|---|---|
| #89 | `ASK_USER_WAIT_CAPPED` | 尊重模型给的等待时间，只把「无限等待 `-1`」收成 5 分钟 |
| #90 | `RESTORE_NATIVE_STEERING` | 恢复原生插话与队列顺序，迁移旧 #85/#86（旧规则会把 `steer` 降级成 followup） |
| #91 | `BROWSER_COOKIE_NAME_IGNORE_PORT` | 桌面端会话 cookie 名忽略端口，避免随机端口累积 cookie 撑爆请求头 |
| #92 | `HOST_MAX_HTTP_HEADER_SIZE` | host 进程 `--max-http-header-size=262144`，兜住历史 cookie |
| #93 | `SANDBOX_POLICY_BRAND_NEUTRAL` | 沙箱策略文案去掉 DSH 品牌词 |
| #94 | `SKILL_BADGE_DESCRIPTION_NEUTRAL` | 技能徽章描述去掉官方品牌要求 |
| #95/#96 | `INSPECTOR_FRAME_BUDGET_RECORD_OVERHEAD(_CLIENT)` | Cordis 树预留记录开销，超限时保留上一帧而不是白屏 |

**被取代的 2 条**：#85 / #86（`steer` 强制降级为 followup 的旧规则）。#90 装上时会把它们从补丁表剔除，并对**已落地**的旧标记做迁移；卸载不会把它们请回来。

不适配的补丁不会被盲改：锚点找不到就 `skipped`，目标文件不存在就 `missing_file`，被开关挡下就 `disabled`。

---

<a id="九红军模式演练台"></a>

## 九、红军模式（演练台）

1.1.71 自带一份演练台，社区线把它扩到 **64 个工具**并加了证据账本，本版整条采纳。

| 能力 | 工具 |
|---|---|
| 目标与资产 | `redteam_session_bind` / `_start` / `_status`、资产增删查、导入导出 |
| 侦察与扫描 | 端口、目录、指纹、子域、JS 提取（按授权范围） |
| 隧道与横向 | 建隧道、内网探测、横向清单 |
| 口令 | 生成候选、验证（不出网） |
| **证据账本** | `redteam_evidence_record` / `_list` / `_verify` / `_upgrade` |
| **未知项** | `redteam_unknown_record` / `_list` / `_resolve`、`redteam_unverified_count` |
| 报告 | 生成、复放、导出 |

证据四档可信度：`claimed`（子智能体自报，必须带 `source_agent`）→ `observed`（指挥侧实测，`authority` 不能是 `subagent-report`）→ `derived` / `inferred`。每条 `ev_id = "ev_" + sha256(规范化语义)`，同一事实重复记录命中 `duplicate: true` 而不是写两条；行被手工改过，读取时抛 `evidence integrity mismatch`。

演练台首次进入需读声明、等倒计时、滚到文末、勾选三项，之后才可用；**清洗不需要这一步**。产物在 `$DSH_HOME/redteam/`：`engagements/<靶标id>/assets.db`（资产库与证据账本同库）、`agents/`、`runs/`、`reports/`。

---

<a id="十工作原理"></a>

## 十、工作原理

```
启动 → 定位 DSH_HOME 与 aiBase（@deepseek-ai 包目录）
     → patchStatus：先看补丁的 markers 有没有落地，再决定 pending / applied
     → apply：备份目标文件为 <file>.dshpurge.bak → 逐条替换 → 写 markers → 记 applied.json
     → 权限账簿：读 tuning.json，按备份清单回放「当前该是什么权限配置」
     → 预设：安装 → 内存注入策略 → 迁移拆子预设 → 注册到 agentPresets
```

几条设计约束，都是踩过坑之后定下来的：

- **markers 才是真相**：补丁落地会写入 `// [dsh-purge] …` 注释，`--status` 以标记为准，不以「我替换过」为准。
- **幂等**：同一份补丁跑第二遍全是 `already`；重复应用不会叠注释。
- **还原只认备份**：没有 `.dshpurge.bak` 的文件，还原时只去掉本插件写入的行，不动别的。
- **用户文件不覆盖**：`prompt-inject.md`、规则集、导入的技能、`presets/*/agent.cordis.yml` 的用户改动，还原与更新都保留。
- **rc.3 适配靠锚点覆盖，不改主干**：`withDesktopAnchors()` 按 id 整条覆盖，`withRc3Extra()` 只追加锚点与文件键——这样 rc.2 上的老锚点仍在，不会被「越修越窄」。

原始 0.2.2-rc.3 包树上的实测（不是本机已打过补丁的宿主）：

| 指标 | 结果 |
|---|---|
| 只读状态 | `pending 64 / applied 7 / na 14 / missing_file 2 / skipped 1`，零 `pattern_not_found` |
| 首轮 apply | `applied 64 / already 7 / missing_file 16 / skipped 1` |
| 二次 apply | 全 `already`（幂等） |
| 终态 | `applied 72 / na 14 / missing_file 2` |
| 逐条 markers 审计 | 应用成功且有标记 69；未命中 17 条中 2 条是 rc.3 模板已达标（#76/#80），1 条是环境缺 `desktop-shell`（#92），其余 14 条是本机/包集没有对应文件的键 |
| 改写文件语法 | 35 个被改写的宿主 `.js` 全部 `node --check` 通过 |

---

<a id="十一更新还原卸载"></a>

## 十一、更新、还原、卸载

**更新**：因为是 `link:` 安装，改完源码**重启宿主即可**；换了目录或重新安装走[第四节](#四安装)任一条路。

**还原**（保留插件，只回原版宿主）：

```sh
dsh-purge --revert        # 或 /purge revert，或面板「还原」
```

- 每个目标文件应用前备份为 `<文件>.dshpurge.bak`；还原用备份覆盖回去并删除备份。
- `prompt-inject.md` 是用户文件，还原时保留。

**卸载**：

```sh
dsh-purge --uninstall     # 或 /purge uninstall，或面板「清洗 → 卸载」
```

会先还原（若已应用），再删注入文件、规则库与插件自身，然后重启宿主。权限账簿的迁移备份留在 `$DSH_HOME/dsh-purge/preset-migrations/`，要彻底清干净就一起删。

---

<a id="十二常见问题faq"></a>

## 十二、常见问题（FAQ）

**1. rc.3 上预设挂载报 `tool-subagent: toolFilter is no longer supported`**
0.2.2-rc.3 的 `dsh-tool-subagent` 见到 `toolFilter` 直接抛错、整份预设挂不掉。本版已处理：磁盘模板不写它，红队预设自举时用 `repairToolFilter()` 剥离旧残留；无限制模式的子预设策略改在内存里注入后再交给迁移器拆分。**不要手工把 `toolFilter` 加回 `agent.cordis.yml`。**

**2. 模式下拉里看不到「无限制模式 / · 子任务」**
① 先确认已重启宿主；② 确认 `cordis.patch.yml` 的 `insert` 里有 `- id: dsh-purge-presets`；③ 看启动日志有没有 `dsh-purge-presets: 注册失败 …`；④ 旧磁盘预设若带 `toolFilter`，自举会打一行「已剥离磁盘预设里的 toolFilter」——这是正常的。要强制重铺：`REDTEAM_PRESET_REFRESH=1` 启动一次。

**3. `--status` 里有 2 条 `missing_file`（#71 / #83）**
`#71 LIANGSHEN_IDENTITY_LINE`、`#83 DESKTOP_HOST_CLOSE_NO_FATAL` 依赖「密封安装的桌面壳 exe」。非密封 / 免安装布局下 `officialShellMain()` 返回空，属**环境性**缺失，不是适配缺陷。#92 同理（`desktop-shell` 键为空时自动跳过）。

**4. #76 / #80 显示 applied 但没有标记**
rc.3 的模板本身已经达标（`preset-unrestricted` 的 persona 已无英文身份句，`minimal.patch.yml` 已无待删的工具行），所以这两条是**空转**，没有可写的标记。不影响其他补丁。

**5. Windows 上一条 `.dshpurge.bak` 都建不出来 / rename 报 `EPERM`**
1.1.71 的 `hostFs` 只包了 `openSync` 没包 `closeSync`，占位句柄永不关闭。本版已补 fd 级直通，63 个备份正常落盘。若你从旧版升级，先 `--revert` 再重启。

**6. 权限好像没放开**
先 `dsh-purge --tuning` 看 `permissionPatches` 是不是被关过（`false`）。关着的时候 14 条权限补丁状态是 `disabled`，`--apply` 不会落。改回 `true` 再 apply。

**7. 区域闸为什么没拦住境外目标**
本版**默认关**（上游 1.1.71 默认开）。要开：`dsh-purge --tuning routingGate=true`，重启生效。白名单仍走 `$DSH_HOME/net-scope-allow.txt`。

**8. `dsh plugin add dsh-purge` 报 404**
上游 npm 包已下架。用[第四节](#四安装)的本地目录 / `link:` 方式。

---

<a id="十三兼容性"></a>

## 十三、兼容性

| 插件版本 | 适配 dsh | 说明 |
|---|---|---|
| **2.0.0-rc3**（本包） | **0.2.2-rc.3** | 合版：1.1.71 引擎 + 1.7.18 治理层，88 条补丁 |
| 1.1.71-rc3 | 0.2.2-rc.3 | 上游 1.1.71 + rc.3 适配（`ADAPTATION.md`） |
| 1.7.18（社区线） | 0.2.1-rc.1 | 权限账簿来源；在 rc.3 上 #35/#60/#62/#12 落不全 |
| 1.1.71（上游） | 0.2.0-rc.2 | 镜像 `ZXEB/dsh-purge` |

不适配的补丁不会被盲改，只会 `skipped` / `missing_file` / `disabled`。

---

<a id="十四声明署名与许可"></a>

## 十四、声明、署名与许可

**署名要求（沿用原作者条款）**：借用本项目的名称、思路、代码或提示词，必须署名并写明来源。原始来源：**`YuJunZhiXue/dsh-purge`（作者：小杨）**；镜像重建：**`ZXEB/dsh-purge`**；治理层来源：**`dsh-purge-community` 1.7.18**。去掉署名、隐去来源、据为己有会被追究。

**用途与边界**

1. 本包代码、文档、补丁、默认提示词**不含**恶意程序、后门、未授权渗透工具、勒索软件、撞库脚本，也不含针对公网或第三方系统的攻击载荷。
2. 补丁与提示词注入只作用于**你本机已安装的官方 DeepSeek Harness**（`@deepseek-ai` 包、本地 profile / `$DSH_HOME`）；目标是你自己的本地软件，不是别人的站点、服务器、账号或信息系统。
3. 应用 / 注入 / 还原 / 卸载都只动本地文件与本地进程，**不扫描、不探测、不向任何公网主机发送攻击流量**。「检查更新」只访问本插件自己的仓库比对版本，不构成对第三方系统的探测，也不构成任何授权。
4. 演练台只在你**有权管理**的官方 Harness、离线本地合成靶标、已授权靶场或合规实验环境中使用。
5. **中国大陆、香港、澳门**的网段与解析到这些地区的服务器 / 域名默认禁止访问、扫描、探测；唯一例外是你**事先登记**的那一个精确 IP 或完整主机名。密钥、密码、网段、通配符、对话里的口头声明都不构成例外。
6. 禁止用于违反《中华人民共和国刑法》《网络安全法》《数据安全法》《个人信息保护法》及适用法律法规、监管规则的行为；禁止未授权入侵攻击、敲诈破坏、撞库、传播恶意载荷；禁止生成传播法律禁止的内容；禁止违反模型服务商条款。
7. 本项目按 MIT「现状」提供，不担保完整性与适用性。下载、部署、运行、修改、分发及其产生的一切输入输出，**责任由使用者自行承担**；作者与贡献者不承担直接、间接或连带责任。
8. 一旦用于非法攻击或恶意活动，开源许可**即刻自动终止**，须停止使用并永久销毁所有副本与衍生品。
9. 本项目是独立开源安全评测研究项目，与 DeepSeek 及其关联方**无**雇佣、商业、授权或背书关系；此处「官方」仅指评测目标是你机器上的官方 Harness 包。

**许可**：MIT，见 [LICENSE](LICENSE)（版权行保留原作者 `Copyright (c) 2026 小杨`）。

**致谢**：原作者 小杨（`YuJunZhiXue`）、社区线维护者（`dsh-purge-community` 1.7.18）、[LINUX DO](https://linux.do) 社区，以及 `docs/redteam-upstream-*` 中列明的上游项目与披露文件。
