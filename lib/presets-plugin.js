// Registers the bundled `unrestricted` agent preset and its `· 子任务` companion.
//
// DSH 0.1.7+ 的模式下拉只认 `agentPresets.register()`：把文件夹丢进
// `~/.dsh/.agent-presets/` 不会出现在下拉里（红队预设早期也踩过这个坑）。
// 所以这里和 lib/redteam/index.js 一样，等 registry 就绪后软注册一次，卸载时释放。
//
// 0.2.2-rc.3 起 `dsh-tool-subagent` 会拒绝磁盘上的 `toolFilter`（抛
// `tool-subagent: toolFilter is no longer supported`，整份预设挂载失败）；
// 而「无限制模式 · 子任务」恰好是迁移器按 toolFilter 拆出来的子预设。
// 因此策略只在**内存里**注入：磁盘模板保持干净，用户手工改文件也不会重新踩坑。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPresetDefinition } from "./redteam/preset-composition.js";
import { UNRESTRICTED_PRESET, bundledPresetDir, userPresetDir, installPreset } from "./presets.js";
import { findDshHome } from "./core.js";
import {
  profileOwnsPreset,
  adaptListAgents,
  ensureToolExecutor,
  withLegacyChildIds,
  migratePresetDefinition,
  backupPresetMigration,
  registerPresetDefinitions,
} from "./preset-compat.js";

export const name = "dsh-purge-presets";
export const inject = [];

const RETRY_LIMIT = 40;
const SUBAGENT = "@deepseek-ai/dsh-tool-subagent";

/** 子会话排除这三件套；父会话仍有完整工具面。等价于 1.7.18 预设文件里的旧 toolFilter。 */
const LEGACY_CHILD_POLICY = { deny: ["subagent_fork", "workflow", "ralph"] };

function presetDir() {
  // 用户改过就用磁盘上那份，否则用包内模板。
  try {
    const user = userPresetDir();
    if (existsSync(join(user, "agent.cordis.yml")) || existsSync(join(user, "preset.yml"))) return user;
  } catch {
    /* 没有 DSH_HOME 时退回包内 */
  }
  return bundledPresetDir(UNRESTRICTED_PRESET);
}

function visitRows(rows, fn) {
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    fn(row);
    if (row.group === true) visitRows(row.config, fn);
  }
}

/**
 * 0.2.2-rc.3 的 `dsh-tool-subagent` 会把带 toolFilter 的预设判成致命错误，
 * 而社区版落过盘的副本还留着这段（本机就有一份）。这里就地剥掉：
 * 策略改由内存注入，磁盘保持 rc.3 能解析的样子。
 */
function stripLegacyToolFilter(dir, ctx) {
  const file = join(dir, "agent.cordis.yml");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  if (!/^[ \t]*toolFilter:/m.test(text)) return false;
  // 连缩进更深的子行一起删（`toolFilter:` 下面只能是 deny 列表或等价映射）。
  const stripped = text.replace(/^([ \t]*)toolFilter:[ \t]*\r?\n(?:\1[ \t]+[^\r\n]*(?:\r?\n|$))+/gm, "");
  if (stripped === text) return false;
  try {
    writeFileSync(file, stripped);
    ctx.logger?.info?.("dsh-purge-presets: 已剥离磁盘预设里的 toolFilter（rc.3 会拒绝整份预设）：%s", file);
    return true;
  } catch (error) {
    ctx.logger?.warn?.("dsh-purge-presets: 磁盘预设无法修复 %s", error.message);
    return false;
  }
}

/**
 * 在内存副本里补回旧策略，让 `migratePresetDefinition()` 能拆出子预设。
 * 找不到 subagent 行时返回 undefined：那就照常注册单一份，不硬造。
 */
function withChildPolicy(definition) {
  const clone = structuredClone(definition);
  let tagged = false;
  visitRows(clone.plugins, (row) => {
    if (row.name !== SUBAGENT) return;
    const config = row.config ?? {};
    // 同名包挂了多行（spawn / fork / codex / claude-code），只有 spawn 那一行
    // 能承载子预设策略；把 toolFilter 贴到 fork 行会被迁移器判为「provider 不明确」。
    const isPrimary = row.id === "tool-subagent" || config.provider === "spawn";
    if (!isPrimary || config.agentPreset !== undefined || config.allowedAgentPresets !== undefined) return;
    row.config = { ...config, provider: config.provider ?? "spawn", toolFilter: { deny: [...LEGACY_CHILD_POLICY.deny] } };
    tagged = true;
  });
  return tagged ? clone : undefined;
}

export function apply(ctx) {
  let release;
  let stopped = false;
  let tries = 0;

  const registry = () => {
    try {
      const fromProxy = ctx.agentPresets;
      if (fromProxy && typeof fromProxy.register === "function") return fromProxy;
    } catch {
      /* 未 inject 时读属性会抛 */
    }
    try {
      const fromGet = ctx.get?.("agentPresets");
      if (fromGet && typeof fromGet.register === "function") return fromGet;
    } catch {
      /* 服务还没起 */
    }
    return null;
  };

  const declare = async () => {
    if (stopped) return;
    const reg = registry();
    if (!reg) {
      if (tries++ < RETRY_LIMIT) setTimeout(declare, 500);
      return;
    }
    try {
      if (profileOwnsPreset(ctx, UNRESTRICTED_PRESET)) {
        ctx.logger?.info?.("dsh-purge-presets: 当前 profile 已声明 %s，由宿主注册", UNRESTRICTED_PRESET);
        return;
      }
      try { installPreset({ force: false }); }
      catch (error) { ctx.logger?.warn?.("dsh-purge-presets: %s", error.message); }
      const dir = presetDir();
      stripLegacyToolFilter(dir, ctx);
      const anchor = ctx.get?.("profileContext")?.installAnchor;
      const loaded = ensureToolExecutor(adaptListAgents(readPresetDefinition(UNRESTRICTED_PRESET, dir), anchor), anchor);
      const source = withChildPolicy(loaded) ?? loaded;
      const migrated = migratePresetDefinition(source, { stableChildIds: true });
      const backup = backupPresetMigration({ home: findDshHome(), dir, id: migrated.definitions.at(-1).id, policies: migrated.policies });
      release = await registerPresetDefinitions(reg, withLegacyChildIds(migrated, findDshHome()));
      if (stopped) { await release(); release = undefined; return; }
      const ids = migrated.definitions.map((entry) => entry.id);
      ctx.logger?.info?.("dsh-purge-presets: 已注册预设 %s", ids.join(" + "));
      if (backup) ctx.logger?.info?.("dsh-purge-presets: 子任务策略已迁移；原始配置保持不变，备份 %s", backup);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      ctx.logger?.warn?.("dsh-purge-presets: 注册失败 %s", message);
      // 重复注册 / 定义非法属于终态，重试只会刷日志。
      if (/already|duplicate|invalid/i.test(message)) return;
      if (tries++ < RETRY_LIMIT) setTimeout(declare, 1000);
    }
  };

  declare();

  ctx.effect(() => async () => {
    stopped = true;
    try {
      await release?.();
    } catch {
      /* ignore */
    }
  }, "dsh-purge-presets.registration");
}
