#!/usr/bin/env node

import * as core from "../lib/core.js";
import * as rules from "../lib/rules.js";
import {
  PERMISSION_OVERRIDE_IDS,
  TUNING_DEFAULTS,
  disabledPatchIds,
  readTuning,
  tuningPath,
  writeTuning,
} from "../lib/merge-layer.js";

const args = process.argv.slice(2);

const TUNING_HELP = `  permissionPatches  true|false   14 条权限补丁这一组是否生效
  contextManagement  true|false   上下文管理组（optIn 补丁）
  routingGate        true|false   区域闸：攻击类任务命中境外/银行域名时停车
  rewind             true|false   回滚/撤销相关补丁
  refusalRetry       true|false   拒答重试
  extraPatches       1,2,3        optIn/默认关闭补丁的白名单`;

function tuningLines(dshHome) {
  const tuning = readTuning(dshHome);
  const off = disabledPatchIds(core.ALL_PATCHES, tuning);
  const out = [];
  out.push(`  配置文件 / tuning  ${tuningPath(dshHome)}`);
  for (const key of Object.keys(TUNING_DEFAULTS)) {
    out.push(`    ${key.padEnd(18)} ${JSON.stringify(tuning[key])}`);
  }
  out.push(`  权限补丁组 ${PERMISSION_OVERRIDE_IDS.length} 条 —— ${tuning.permissionPatches === false ? "关闭 / off" : "启用 / on"}`);
  out.push(`  当前被开关挡下的补丁 ${off.size} 条${off.size ? "：" + [...off].sort((a, b) => a - b).map((id) => "#" + id).join(" ") : ""}`);
  return out;
}

function parseTuningValue(raw) {
  const text = String(raw).trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (text !== "" && Number.isFinite(Number(text))) return Number(text);
  if (text.includes(",")) return text.split(",").map((part) => part.trim()).filter(Boolean);
  return text;
}

function runTuning(state) {
  const pairs = args.filter((a) => a.includes("=") && !a.startsWith("--"));
  if (!pairs.length) {
    console.log("dsh-purge tuning（合版开关）");
    console.log(tuningLines(state.dsh_home).join("\n"));
    console.log("");
    console.log(TUNING_HELP);
    console.log("");
    console.log("  写法：dsh-purge --tuning permissionPatches=false routingGate=true");
    console.log("  改完需重新 --apply 一次，让被关掉的补丁按基线还原。");
    return 0;
  }
  const values = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    const key = pair.slice(0, at).trim();
    if (!(key in TUNING_DEFAULTS)) {
      console.log(`[ERROR] 未知开关 ${key}，可用：${Object.keys(TUNING_DEFAULTS).join(", ")}`);
      return 1;
    }
    const value = parseTuningValue(pair.slice(at + 1));
    if (key === "extraPatches") {
      const list = Array.isArray(value) ? value : String(value).split(",");
      values.extraPatches = list.map(Number).filter(Number.isFinite);
    } else {
      values[key] = value === true || value === "true";
    }
  }
  const next = writeTuning(values, state.dsh_home);
  console.log("dsh-purge tuning 已更新");
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${key.padEnd(18)} ${JSON.stringify(next[key])}  (${JSON.stringify(TUNING_DEFAULTS[key])} → ${JSON.stringify(next[key])})`);
  }
  console.log("");
  console.log(tuningLines(state.dsh_home).join("\n"));
  console.log("");
  console.log("下一步：dsh-purge --apply 让改动落到宿主，然后重启 dsh。");
  return 0;
}

function printStatus(state) {
  const out = [];
  out.push("dsh-purge 状态 / Status");
  out.push("  宿主 / surface " + (state.surface || "web"));
  out.push("  DSH_HOME      " + state.dsh_home);
  if (state.desktop_install) out.push("  桌面安装       " + state.desktop_install);
  if (state.ai_base) {
    out.push("  插件根 / root  " + state.ai_base);
    for (const [key, fp] of Object.entries(state.files)) {
      out.push(`    ${key.padEnd(22)} ${fp}`);
    }
  } else {
    out.push("  插件根 / root  " + core.missingAiBaseMessage());
  }
  out.push(`  shim 目录      ${state.shim_dir || "未定位 / not found"}`);
  out.push(`  备份 / backup  ${state.has_backup ? "有 / yes" : "无 / no"}`);
  out.push(`  注入文件       ${state.override_path}`);
  out.push(`  注入状态       ${state.override_status}`);
  out.push("");
  out.push(`  补丁 ${state.patches_applied}/${core.ALL_PATCHES.length} 已清洗, ${state.patches_pending} 待清洗`);
  out.push(...tuningLines(state.dsh_home));
  for (const p of core.ALL_PATCHES) {
    const s = state.patch_status[p.id];
    const mark = s === "applied" ? "✓" : s === "pending" ? "✗" : "·";
    out.push(`    ${mark} [#${String(p.id).padEnd(2)}] ${p.name.padEnd(30)} ${p.layer}/${p.layer_en} — ${s}`);
  }
  out.push("");
  out.push(`  shim: dsh.cmd=${state.shim_cmd}  dsh.ps1=${state.shim_ps1}  dsh=${state.shim_bin}`);
  return out.join("\n");
}

async function main() {
  const mode = args.find((a) => ["--apply", "--revert", "--uninstall", "--status", "--edit", "--tuning", "--help"].includes(a));

  if (mode === "--help" || args.includes("-h")) {
    console.log(`dsh-purge 用法（合版 2.0.0-rc3）:
  dsh-purge --status     显示状态（含 tuning 开关与权限账簿）
  dsh-purge --apply      应用全部清洗（提示词+代码+shim+override）
  dsh-purge --revert     回滚还原
  dsh-purge --uninstall  卸载插件（已应用则先还原）
  dsh-purge --tuning     查看开关；带 key=value 则写入
  dsh-purge --edit       编辑注入文件 prompt-inject.md
  dsh-purge --help       帮助

开关示例:
  dsh-purge --tuning permissionPatches=false   只保留非权限补丁
  dsh-purge --tuning routingGate=true          打开区域闸
  dsh-purge --tuning extraPatches=89,91        打开默认关闭的补丁`);
    return;
  }

  if (mode === "--tuning") {
    const state = await core.gatherState();
    process.exitCode = runTuning(state);
    return;
  }

  const state = await core.gatherState();
  console.log(printStatus(state));
  console.log("");

  if (mode === "--apply") {
    if (!state.ai_base) {
      console.log("[ERROR] " + core.missingAiBaseMessage());
      console.log("  fix: 把 DSH_BASE 指到含 dsh-agent-instructions/lib 的 @deepseek-ai 目录");
      process.exit(1);
    }
    const inject = rules.resolveInjectText(state.dsh_home);
    if (!inject.text) {
      console.log("[ERROR] 提示词和规则集都是空的，必须先添加提示词");
      process.exit(1);
    }
    const { hosts, report } = await core.applyPatchesAllHosts(core.ALL_PATCHES, {
      preserveClientBundles: false,
      forApply: true,
    });
    for (const h of hosts) console.log(`  宿主 / host → ${h.aiBase}`);
    for (const r of report) {
      const m = r.status === "applied" ? "✓ 已清洗" : r.status === "already" ? "- 已是最新" : r.status === "missing_file" ? "⚠ 文件缺失" : `✗ ${r.status}`;
      console.log(`  ${m} patch #${String(r.patch_id).padEnd(2)} ${r.name}`);
    }
    const flashHost = hosts[0]?.aiBase || state.ai_base;
    const flash = core.silenceCmdFlash(flashHost);
    console.log(`  cmd-flash=${flash.entry} phase-1=${flash.phase1} ok=${flash.ok}`);
    if (hosts.length > 1) {
      console.log(`  多宿主 / multi-host: ${hosts.length} 份 @deepseek-ai 已清洗`);
    }
    console.log(inject.source === "rule"
      ? "  - 使用当前规则集，不改写提示词文件"
      : "  - 使用已有提示词文件");
    if (state.shim_dir) {
      const r = await core.patchShim(state.shim_dir);
      for (const [fname, st] of Object.entries(r)) {
        if (st === "patched") console.log(`  ✓ shim ${fname} 注入 / injected`);
        else if (st === "already_patched") console.log(`  - shim ${fname} 已注入 / already injected`);
        else if (st === "missing") console.log(`  - shim ${fname} 不存在 / missing`);
        else console.log(`  ⚠ shim ${fname}: ${st}`);
      }
    } else {
      console.log("  ⚠ 未定位 shim 目录，跳过注入");
    }
    console.log("");
    console.log("全部完成 / All done。重启 dsh 生效 / Restart dsh to take effect.");
  } else if (mode === "--revert") {
    if (state.ai_base || core.enumeratePatchAiBases().length) {
      const { reverted, errors } = await core.revertAllHosts();
      for (const p of reverted) console.log(`  ✓ 已还原 / Reverted ${p}`);
      for (const [p, e] of errors) console.log(`  ⚠ 还原失败 ${p}: ${e}`);
      if (reverted.length === 0) console.log("  - 没有补丁备份可还原 / no patch backup");
    }
    if (state.shim_dir) {
      const r = await core.revertShim(state.shim_dir);
      for (const [fname, st] of Object.entries(r)) {
        if (st === "reverted" || st === "stripped_inject") console.log(`  ✓ shim ${fname}: ${st}`);
        else console.log(`  - shim ${fname}: ${st}`);
      }
    }
    console.log("");
    console.log("回滚完成 / Revert done。重启 dsh 后恢复 / restart to restore.");
    console.log("注: prompt-inject.md 保留（用户文件）/ prompt-inject.md kept (user file)");
  } else if (mode === "--uninstall") {
    const { uninstallPurge } = await import("../lib/uninstall.js");
    const result = await uninstallPurge();
    if (result.applied) console.log("  已检测到补丁，已还原回原版。");
    else console.log("  未检测到已应用补丁，仍会清除插件文件。");
    if (result.override?.removed) console.log(`  已删除 ${result.override.path}`);
    if (result.stripped?.length) console.log(`  已从 profile 移除: ${result.stripped.join(", ")}`);
    for (const e of result.errors || []) console.log(`  ⚠ ${e}`);
    if (!result.ok) {
      console.log("  卸载中止：还原失败，插件文件未删除。");
      process.exit(1);
    }
    console.log("");
    console.log("卸载完成。请重启 dsh。");
  } else if (mode === "--edit") {
    const r = core.editOverride(state.dsh_home);
    if (!r.ok && r.needCreate) {
      await core.installOverride(state.dsh_home, true);
      console.log(`  ✓ 已创建默认注入文件：${state.override_path}`);
      core.editOverride(state.dsh_home);
    } else {
      console.log(`  → 已打开 ${r.editor} 编辑注入文件：${r.path}`);
    }
    console.log("  编辑完成后重启 dsh 生效。");
  } else {
    console.log("默认不清洗，使用 --apply 应用清洗。");
  }
}

main().catch((e) => {
  console.error("[dsh-purge] error:", e);
  process.exit(1);
});
