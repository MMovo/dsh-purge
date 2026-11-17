# dsh-purge 合版 2.0.0-rc3

把两条代码线的优点合成一个插件，目标宿主 **0.2.2-rc.3**（DSH 桌面版）。

- 底座：`dsh-purge-1.1.71`（已适配 0.2.2-rc.3 的 `1.1.71-rc3`，上游主线，单文件 `lib/core.js`）
- 移植：`dsh-purge-community` **1.7.18** 的治理层与独有补丁

不是整目录覆盖。社区版的 `lib/core/{shared,verify}.mjs` 会拖进 `hostFs`、`steering.js`、`anchors.js`、`patches/index.mjs`、各 surface 适配器一整片依赖，1.1.71 里没有对应模块；所以治理层按「单文件、零循环依赖」重写，补丁按「追加/覆盖」两种方式并入。

## 一、合并了什么

| 来源 | 拿过来的东西 |
| --- | --- |
| 1.1.71-rc3 | 全部 82 条补丁；rc.3 锚点覆盖层（`lib/rc3-desktop-anchors.js`）；rc.3 增量锚点（`lib/rc3-extra-anchors.js`，补 #12 新版审批文案 + #35 真正拒绝点 `dsh-tools/lib/pipeline.js`）；`{{cwd}}` 重注册（`lib/working-directory-compat.js`）；DSML 正文泄漏兜底（`lib/native-tool-compat.js`）；网络白名单（`lib/net-scope.js`） |
| 1.7.18 | 14 条 `permissionOverride` 权限账簿、`permissionPatches` 总开关、`tuning.json` 调参、基线回放迁移（关闭/卸载时把权限改动撤回去）、路径围栏 `lib/path-boundary.js`、社区独有 #89–#96、`presets/unrestricted`（「无限制模式」人设）、**整条红军模式升级**（工具 56→64、证据账本、预设迁移层，见第九节） |

合版净结果：**88 条补丁**（82 + 6 条新增 + 2 条被取代），其中 14 条带 `permissionOverride` 标记，可整组关。

## 二、文件变化

新增：

| 文件 | 作用 |
| --- | --- |
| `lib/merge-layer.js` | 治理层：tuning 读写、补丁开关、权限账簿回放、#89–#96 定义。不 import `core.js`，回调由调用方注入 |
| `lib/path-boundary.js` | 从社区逐字复制：写文件前校验目标在允许根内（含 junction/软链） |
| `presets/unrestricted/` | 社区「无限制模式」预设（`agent.cordis.yml` + `preset.yml`） |
| `lib/preset-compat.js` | 社区预设迁移层：`migratePresetDefinition` / `registerPresetDefinitions` / `backupPresetMigration` / `adaptListAgents` / `ensureToolExecutor` |
| `lib/presets.js` | 把自带 `unrestricted` 预设落到 `$DSH_HOME/.agent-presets/unrestricted/`（已存在不覆盖），顺手应用 #24 |
| `lib/presets-plugin.js` | 注册「无限制模式」+「无限制模式 · 子任务」；内存注入旧 `toolFilter` 策略、剥离磁盘残留，见第十节 |
| `lib/remove-tree.js` | `removeTreeNoFollowSync`：删目录不跟 junction/软链（卸载与 PoC 清理用） |
| `lib/redteam/evidence-ledger.mjs` | 证据账本 + 残余未知项（零依赖 `node:sqlite`，语义哈希防篡改） |
| `lib/redteam/atomic-write.js` | 配置写盘改原子替换（settings / platform-config 用） |
| `lib/redteam/{index,tools,store-core,settings,platform-config,ui,validate,preset-composition}.js` | 换成 1.7.18 版：工具 56 → **64**，见第九节 |

改动：

| 文件 | 改动 |
| --- | --- |
| `lib/core.js` | 补丁表接上 `permissionMarked(dropSuperseded(withMergePatches(...)))`；`targetFiles()` 增加 `client-connection`/`skill-badge`/`tool-ask-user`/`experimental-inspector(-client)`；`patchRootsFor()`；`applyPatches` 尊重开关并跑账簿；`patchStatus` 新增 `disabled` 态；`filePatchSettled` 支持 `settleCheck` |
| `lib/extract-asar.js` | **修一个 Windows 真 bug**：`hostFs` 只包装了 `openSync` 没包装 `closeSync`/`readSync`，`fs.closeSync(fd)` 等于调用 undefined，备份占位符的文件句柄永不关闭，随后 rename 覆盖它报 `EPERM`，`.dshpurge.bak` 整批建不出来。补上 fd 级直通后 63 个备份正常落盘 |
| `lib/index.js` | 区域闸改为按 `tuning.json` 的 `routingGate` 决定是否安装（默认关） |
| `bin/dsh-purge.js` | 新增 `--tuning` 子命令；`--status` 里显示开关与账簿摘要 |
| `package.json` | `version: 2.0.0-rc3`、`dshTarget: 0.2.2-rc.3`、description 改合版说明；包名仍是 `dsh-purge`（bin、`cordis.patch.yml`、profile 目录都按这个名字找） |

## 三、权限账簿（社区独有，1.1.71 原本没有）

14 条补丁带 `permissionOverride: true`：

```
#6  SANDBOX_DENY_FILE_WRITE          "(deny file-write*)" → "(allow file-write*)"
#7  SANDBOX_MODE_DEFAULT             'workspace-write' → 'danger-full-access'
#8  APPROVAL_POLICY_DEFAULT          cordis.patch.yml 里的 policy 默认值
#9  APPROVAL_AUTO_GRANT              审批 never 时直接返回 allowed-once
#10 APPROVAL_CONFIG_DEFAULT_NEVER    配置项 default("never")
#13 ESCALATION_WIDENING_EXEMPT       提权梯度豁免
#14 ESCALATION_GRANT_UNCONDITIONAL   提权一律授予
#15 SANDBOX_CONFINE_PASSTHROUGH      confine 参数透传
#16 FS_FENCE_DISABLED                文件围栏拆除
#35 ESCALATION_NEVER_REJECT          用户拒绝/取消 → 放行（含 dsh-tools 的 serviceAsk）
#51 FRESH_SESSION_FULL_ACCESS        新会话保住 full-access
#59 OFFICIAL_AUTO_REVIEW_PASSTHROUGH 自动审阅直通
#60 OFFICIAL_RUN_CODE_APPROVAL_NEUTRAL  run_code 审批文案中性化
#62 OFFICIAL_TOOL_ASK_FAILOPEN       无审批通道 / agent-less → allow
```

行为：

- `permissionPatches: false` → 这 14 条不落盘；已经打上的，按旁边的 `.dshpurge.bak` 基线**回放**，把权限改动撤回去（不是整文件还原，其它补丁的改动保留）。
- 回放失败（基线缺、内容对不上）会显示 `unmatched` 并给出原因，不静默放行。
- 修改走 `assertWithinRoots`，目标必须落在 `@deepseek-ai` / 包根 / 源码树之内。

## 四、开关：`tuning.json`

位置：`$DSH_HOME/dsh-purge/tuning.json`（默认 `~/.dsh/dsh-purge/tuning.json`），文件不存在就是全默认。

```json
{
  "permissionPatches": true,
  "contextManagement": false,
  "extraPatches": [],
  "routingGate": false,
  "rewind": false,
  "refusalRetry": false
}
```

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `permissionPatches` | `true` | 14 条权限补丁这一组是否生效。关掉即「只保留非权限清洗」 |
| `contextManagement` | `false` | 上下文管理组（`optIn` 补丁） |
| `extraPatches` | `[]` | 单独点开 `optIn` / 默认关闭的补丁 id |
| `routingGate` | `false` | 区域闸：攻击类任务命中境外/银行域名且不在 `net-scope-allow.txt` 白名单时，这一轮停车 |
| `rewind` / `refusalRetry` | `false` | 回滚类、拒答重试类补丁 |

命令行：

```bash
dsh-purge --tuning                              # 看当前开关与被挡下的补丁
dsh-purge --tuning permissionPatches=false      # 只保留非权限清洗
dsh-purge --tuning routingGate=true             # 打开区域闸
dsh-purge --tuning extraPatches=89,91           # 点开默认关闭的补丁
dsh-purge --apply                               # 让改动落到宿主
```

改完必须再 `--apply` 一次：开→补丁落盘，关→按基线撤回。

## 五、新增的 6 条补丁（#89–#96，来自社区）

| id | 名称 | 做什么 |
| --- | --- | --- |
| #89 | `ASK_USER_WAIT_CAPPED` | `ask_user` 的 `timeout: -1` 不再无限等，封顶 300s |
| #90 | `RESTORE_NATIVE_STEERING` | 把 #85/#86 造成的「插话降级成 followup」修回原生 `steer`/next-step；rc.3 原生已正确时视为已到位（`settleCheck`） |
| #91 | `BROWSER_COOKIE_NAME_IGNORE_PORT` | 浏览器 cookie 名忽略端口，换端口不用重新登录 |
| #92 | `HOST_MAX_HTTP_HEADER_SIZE` | 桌面壳加 `--max-http-header-size=262144`（非密封安装下无对象，显示 `na`） |
| #93 | `SANDBOX_POLICY_BRAND_NEUTRAL` | 沙箱提示去掉品牌词 |
| #94 | `SKILL_BADGE_DESCRIPTION_NEUTRAL` | skill 徽章描述中性化 |
| #95/#96 | `INSPECTOR_FRAME_BUDGET_*` | inspector 帧预算：源码帧 / bootstrap 帧上限 |

被取代的两条：**#85 / #86**（steer 降级为 followup）在合版里直接剔除 —— 与 #90 的诉求相反，留着只会互相打架。

## 六、验证（原始 0.2.2-rc.3 树，不是本机已打补丁的宿主）

做法：`npm pack` 46 个 `@deepseek-ai/*@0.2.2-rc.3` 解到临时目录 → `DSH_SURFACE=desktop`、假 `$DSH_HOME`、`DSH_PURGE_DEEP_AIBASE_SCAN=1` → 调 `patchStatus` / `applyPatches`。

```
只读状态   { pending 64, applied 7,  na 14, missing_file 2, skipped 1 }   无 unmatched / pattern_not_found
apply 首轮 { applied 64, already 7, missing_file 16, skipped 1 }
apply 次轮 { already 71, missing_file 16, skipped 1 }                     幂等
终态状态   { applied 72, na 14, missing_file 2 }
marker 审计 marked 69 / unmarked 17
```

权限账簿回环（同一棵树）：

```
permissionPatches=false → status { applied 58, disabled 14, na 14, missing_file 2 }
apply                   → { already 57, disabled 14, ... }，dsh-sandbox-local 里恢复成 "(deny file-write*)"
permissionPatches=true  → apply 重新落 14 条，回到 "(allow file-write*)"
```

unmarked 17 条都不是缺陷：`#76`（rc.3 预设模板已自带中文人设段）、`#80`（rc.3 minimal 预设没有可删的工具行）属空转；`#92` 是非密封安装无桌面壳；`#28 #30 #31 #45 #46 #47 #49 #57 #64 #65 #71 #82 #83 #84` 在本机/在所抓包集里没有对应文件键。

本机真实宿主（已被 1.1.76 打过）只读状态：`{ applied 69, pending 7, na 10, missing_file 2 }`，pending 恰是新增的 #89/#90/#91/#93/#94/#95/#96 —— 装本版后 `--apply` 一次即补齐。

## 七、安装与回滚

```bash
# 备份现有插件
cp -r ~/.dsh/profiles/desktop/node_modules/dsh-purge{,.bak}

# 覆盖为本合版
rsync -a --delete ./ ~/.dsh/profiles/desktop/node_modules/dsh-purge/

# 重启 dsh，然后
node ~/.dsh/profiles/desktop/node_modules/dsh-purge/bin/dsh-purge.js --status
node ~/.dsh/profiles/desktop/node_modules/dsh-purge/bin/dsh-purge.js --apply
```

回滚：`dsh-purge --revert` 按 `.dshpurge.bak` 还原宿主文件，或把 `.bak` 目录换回来。

## 八、注意

- 与 1.7.18、1.1.71 都**不能混装**：补丁 id 与锚点体系不同，`permissionOverride`、`RC3_DESKTOP_PATCH_OVERRIDES` 互不认识。
- `dshTarget` 写的是 `0.2.2-rc.3`；换宿主版本要重新核锚点，`patchStatus` 里出现 `unmatched` 就是锚点漂了。
- 首次 `--apply` 之前先 `backupAll`（CLI 已内置）；手工调用 `applyPatches` 时要自己先建备份，否则权限账簿没有基线可回放。

## 九、红军模式（`redteam`，整条从 1.7.18 移植）

1.1.71 自带一份红队演练台（56 个工具、`presets/redteam`、23 个随包技能）。社区 1.7.18 那条线把它扩到了 **64 个工具**并加了证据账本，这一节记录合并结果。

| 项 | 1.1.71 原版 | 合版（= 1.7.18） |
| --- | --- | --- |
| 工具数 | 56 | **64** |
| 新增工具 | — | `redteam_evidence_record` / `_list` / `_verify` / `_upgrade`、`redteam_unknown_record` / `_list` / `_resolve`、`redteam_unverified_count` |
| 证据账本 | — | `lib/redteam/evidence-ledger.mjs`（516 行，零依赖，只用 `node:crypto` + `node:sqlite`） |
| 残余未知项 | — | `UnknownRegistry`（同一文件）：`open/investigating/blocked/contradicted/resolved/withdrawn` |
| 原子写 | — | `lib/redteam/atomic-write.js`（settings / platform-config 改用它写配置） |
| 无跟随删树 | — | `lib/remove-tree.js`（`removeTreeNoFollowSync`，删 PoC 目录不跟 junction） |
| 预设迁移 | — | `lib/preset-compat.js`（`migratePresetDefinition` / `registerPresetDefinitions` / `backupPresetMigration`，把旧 `listAgents` 迁成原生子预设） |
| 路径围栏 | — | `path-boundary.js` 复用：`dirOf`/`metaPathOf`/`dbPathOf`/`promptsDirOf` 全部走 `assertNoLinkedDescendants`，id 过 `pathComponent`（挡 `..`、盘符、设备名、NTFS 流） |
| 产物迁移 | — | 关闭/卸载时 `removeTreeNoFollowSync` 不再误删指向靶标库的软链 |

### 证据账本怎么用

写入只走工具，模型不碰 SQL；每条 evidence 的 `ev_id = "ev_" + sha256(规范化语义)`，同一事实重复记录会命中 `duplicate: true` 而不是写两条。可信度四档：

- `claimed` —— 子智能体自报（**必须带 `source_agent`**）
- `observed` —— 指挥侧实测（`authority` 不能是 `subagent-report`，否则直接拒绝）
- `derived` / `inferred` —— 推导与推测

`redteam_unverified_count` 报的是"还有几条 claimed/inferred 没闭环"（`countUnresolvedClaims`），已闭环的不算——避免账本越用越吓人。读取时 `parseEvidenceRow` 会重算语义哈希，行被手工改过就抛 `evidence integrity mismatch: ev_…`。

### rc.3 兼容修复（合版新做，两边原版都没有或各缺一半）

1. **`toolFilter` 必须从磁盘上消失**：0.2.2-rc.3 的 `dsh-tool-subagent` 直接 `throw tool-subagent: toolFilter is no longer supported ... select it with agentPreset`，预设里带这段会让整份预设挂载失败、模式从下拉里消失。合版把 `presets/redteam`、`presets/unrestricted` 里的 `toolFilter` 段删掉（`maxDepth: 1` 兜叶子约束），并保留社区的 `repairToolFilter()`：老机器上已落地的预设会在自举时就地摘除，实测返回 `repaired: "tools-package+tool-filter+delegation"`。**唯一例外是「无限制模式 · 子任务」**——它本来就是靠 `toolFilter` 拆出来的，所以策略改在内存里注入（见第十节），磁盘仍然干净。
2. **组合损坏自动重装**（1.1.71 侧保留并加固）：`needsCompositionRepair()` 发现预设缺 `- id: workflow-ptc`、或 `dsh-workflow-worker-thread` 仍用 `provider: spawn` 且没 `disabled: true` 时强制重装——否则预设目录明明在，模式却永远挂不上。原判据是 `text.includes('id: workflow-ptc')`，会被 `id: workflow-ptc-removed` 这类残留子串骗过；合版改成行锚定正则 `/^\s*-\s*id:\s*workflow-ptc\s*$/m`（实测：故意破坏后 `apply()` 能把 `workflow-ptc` 回补，健康预设再跑一次 mtime 不变、走 kept）。
3. **工具行包名**：统一回 `dsh-purge/redteam/tools`（社区版写的是 `dsh-purge-community/redteam/tools`，装到这里会解析不到），`package.json` 的 `exports` 已含 `./redteam`、`./redteam/store`、`./redteam/ui`、`./redteam/tools`。

### 自测（隔离 `DSH_HOME`，未碰真实 profile）

- `installPreset({force:true})` → `action: installed`，23 个随包技能落到 `$DSH_HOME/redteam/skills`，预设里 `name: dsh-purge/redteam/tools`、`toolFilter` 计数 0、`workflow-ptc` 在、`customSkillDirs` 已变成 `dshHomePath('redteam/skills')`。
- 账本生命周期：claim（`unresolved 1`）→ `verify` 语义命中 `matched: true` → `upgrade` 生成 observed 并写 `evidence_verification` 链接；篡改 `result` 后 `get()` 抛 `evidence integrity mismatch`。
- `RedteamStore`：`openEngagement('测试靶标 A', ['10.0.0.0/30'])` → `activeEngagementId` = `测试靶标-a`、`listEngagements` 带 13 项统计；`dbPathOf('../../etc')` 与 `dirOf('a:b')` 均抛 `invalid path component`。

### 用法

模式下拉选「红队模式」（预设 id `redteam`）。预设已存在时只做就地修复、不覆盖；要强制重铺一次：`REDTEAM_PRESET_REFRESH=1` 启动一次。演练产物在 `$DSH_HOME/redteam/`：`engagements/<靶标id>/assets.db`（资产库 + 证据账本同库）、`agents/`、`runs/`、`reports/`，`current` 文件记当前靶标指针。

## 十、两个无限制预设（`unrestricted` + `unrestricted · 子任务`）

1.7.18 自带的 `presets/unrestricted` 会注册出**两个**模式，合版把这套机制补齐了（1.1.71 侧原本没有 `lib/presets.js` / `lib/presets-plugin.js`，所以只有文件、没有下拉项）。

| 模式 | 预设 id | 来源 | 工具面 |
| --- | --- | --- | --- |
| 无限制模式 | `unrestricted` | `presets/unrestricted/`（`preset.yml` name=无限制模式） | 完整 34 行工具 |
| 无限制模式 · 子任务 | `unrestricted-child-b5beb73b2d` | 迁移器按子会话策略拆出的子预设 | 31 行（去掉 `subagent_fork` / `workflow` / `ralph`） |

### 子预设是怎么来的（rc.3 的关键改动）

社区原设计：预设文件里写 `toolFilter: {deny: [subagent_fork, workflow, ralph]}`，`migratePresetDefinition()` 把它转成原生子预设，并把父预设那一行改成 `agentPreset: <childId>`。**但 rc.3 见到 `toolFilter` 就抛**，两者直接冲突。

合版的做法：`lib/presets-plugin.js` 在**内存副本**里补回这段策略（`withChildPolicy()`，只贴到 `id: tool-subagent` 且 `provider: spawn` 的那一行——同名包还挂着 `fork`/`codex`/`claude-code` 三行，贴错会被迁移器判成「provider 不明确」），再交给迁移器拆分。于是：

- 磁盘模板没有 `toolFilter` → rc.3 能正常解析；用户手改文件也不会重新踩坑；
- 下拉里依旧拿到两个模式，子预设 id 用 `stableChildIds`（`hash({id, deny})`）算，跨版本稳定；
- 老机器上落过盘的副本（例如社区版写下的那份）由 `stripLegacyToolFilter()` 在自举时就地剥离，并打一行日志。

历史别名：只有当 `$DSH_HOME/dsh-purge/preset-migrations` 或旧路径 `dsh-purge-community/preset-migrations` 里真有备份、且其 `childId` 与当前策略对得上时，才会多注册一条 `…（历史兼容 · xxxxxxxx）`。首发安装不会凭空多出幽灵条目（社区原实现无条件塞一条）。

### 自测

- 全新 `DSH_HOME`：注册 `unrestricted` + `unrestricted-child-b5beb73b2d`，两者 `toolFilter` 出现次数 0，父预设 `subagent.agentPreset=unrestricted-child-b5beb73b2d`，子预设行数 31（无 `tool-subagent-fork`/`workflow`/`ralph`）。
- 铺入本机那份**带 toolFilter** 的旧磁盘预设：日志出现「已剥离磁盘预设里的 toolFilter」，落地文件 `grep -c toolFilter` = 0，随后照常注册两个模式。
- 铺入社区历史备份（`unrestricted-a78064a936b4899b`）：其 `childId` 与当前子预设 id 相同 → 不再额外注册别名，仍是两个模式。
- `cordis.patch.yml` 的 `insert` 段新增 `- id: dsh-purge-presets / name: dsh-purge/presets-plugin`；`package.json` `exports` 增加 `./presets-plugin`。
