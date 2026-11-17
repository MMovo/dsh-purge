// Merged layer: dsh-purge 1.1.71 (rc.3 engine) + dsh-purge-community 1.7.18
// (permission ledger, tuning gate, native steering, extra hardening patches).
//
// Two jobs live here on purpose:
//  1. Patch table surgery — mark the 14 permission-boundary patches, retire the
//     two superseded steering patches, and carry the community-only patches.
//  2. The permission ledger — a single switch (`permissionPatches`), replay of
//     the recorded recipes against `.dshpurge.bak`, and containment checks so a
//     rollback can never write outside the host roots.
//
// This module never imports `core.js`: the caller injects the text applier and
// the marker predicate, so `core.js -> merge-layer.js` stays a one-way edge.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertWithinRoots } from "./path-boundary.js";

export const TUNING_FILE = "tuning.json";

/** Community 1.7.18 marks exactly these ids as permission-boundary patches. */
export const PERMISSION_OVERRIDE_IDS = Object.freeze([
  6, // SANDBOX_DENY_FILE_WRITE
  7, // SANDBOX_MODE_DEFAULT
  8, // APPROVAL_POLICY_DEFAULT
  9, // APPROVAL_AUTO_GRANT
  10, // APPROVAL_CONFIG_DEFAULT_NEVER
  13, // ESCALATION_WIDENING_EXEMPT
  14, // ESCALATION_GRANT_UNCONDITIONAL
  15, // SANDBOX_CONFINE_PASSTHROUGH
  16, // FS_FENCE_DISABLED
  35, // ESCALATION_NEVER_REJECT
  51, // FRESH_SESSION_FULL_ACCESS
  59, // OFFICIAL_AUTO_REVIEW_PASSTHROUGH
  60, // OFFICIAL_RUN_CODE_APPROVAL_NEUTRAL
  62, // OFFICIAL_TOOL_ASK_FAILOPEN
]);

/** #90 RESTORE_NATIVE_STEERING supersedes the 1.1.71-only steering rewrites. */
export const SUPERSEDED_PATCH_IDS = Object.freeze([85, 86]);

export const TUNING_DEFAULTS = Object.freeze({
  permissionPatches: true,
  contextManagement: false,
  extraPatches: [],
  routingGate: false, // 1.1.71 的区域闸默认关闭：合版以能力为准，需要时显式打开
  rewind: false,
  refusalRetry: false,
});

// ── patch table surgery ─────────────────────────────────────────────────────

export function permissionMarked(list) {
  const ids = new Set(PERMISSION_OVERRIDE_IDS);
  return list.map((p) => (ids.has(p.id) && !p.permissionOverride ? { ...p, permissionOverride: true } : p));
}

export function dropSuperseded(list) {
  const gone = new Set(SUPERSEDED_PATCH_IDS);
  return list.filter((p) => !gone.has(p.id));
}

// ── community-only patches (#89–#96) ────────────────────────────────────────

const ASK_USER_CAP = {
  id: 89,
  name: "ASK_USER_WAIT_CAPPED",
  layer: "工具",
  layer_en: "Tool",
  desc: "尊重模型给的等待时间，只把「无限等待(-1)」收成 5 分钟 / honor requested timeout, cap -1",
  file: ["tool-ask-user"],
  optional: true,
  // 旧版把 timeout 硬写成 1 秒；出现这个标记时视为「未应用」，由下面的迁移替换掉。
  forbid: ["[dsh-purge] ask_user_question never blocks a turn"],
  replacements: [
    {
      pattern: "\t\t\tconst timeout = validateTimeout(args.timeout ?? defaultTimeout);",
      replace:
        "\t\t\tconst timeout = validateTimeout(args.timeout === -1 ? 300 : (args.timeout ?? defaultTimeout)); // [dsh-purge] -1 capped at 300s",
    },
    {
      pattern: "\t\t\tconst timeout = 1; // [dsh-purge] ask_user_question never blocks a turn",
      replace:
        "\t\t\tconst timeout = validateTimeout(args.timeout === -1 ? 300 : (args.timeout ?? defaultTimeout)); // [dsh-purge] -1 capped at 300s",
    },
  ],
  markers: ["[dsh-purge] -1 capped at 300s"],
};

const NATIVE_QUEUE_GUARD =
  '\t\tif (request.action.kind === "steer" && (target !== "next-turn" || agent.status !== "running")) throw new RemoteError("session/steer-unavailable", "current turn no longer accepts steering", { itemId: request.itemId });';
const NATIVE_PROMPT =
  '\t\t\t\t\tif (request.mode === "steer") agent.steer(message);\n\t\t\t\t\telse agent.followup(message);';
const NATIVE_QUEUE_CASE =
  '\t\t\tcase "steer":\n\t\t\t\tagent.inbox.remove(request.itemId);\n\t\t\t\tagent.steer(message);';
const NATIVE_STEER =
  '\tsteer(input) {\n\t\tthis.send(input, "next-step", true);\n\t}';
const OLD_QUEUE_FALLBACK =
  '\t\tif (request.action.kind === "steer" && (target !== "next-turn" || agent.status !== "running")) {\n' +
  "\t\t\t// [dsh-purge] steer degrades to followup instead of failing\n" +
  "\t\t\tagent.inbox.remove(request.itemId);\n" +
  "\t\t\tagent.followup(message);\n" +
  '\t\t\treturn { accepted: true, degraded: "followup" };\n' +
  "\t\t}";
const OLD_PROMPT =
  "\t\t\t\t\tagent.followup(message); // [dsh-purge-85] user prompt always next-turn (kill steer→next-step race)";
const OLD_QUEUE_CASE =
  '\t\t\tcase "steer":\n\t\t\t\tagent.inbox.remove(request.itemId);\n\t\t\t\tagent.followup(message); // [dsh-purge-86] queue steer → next-turn';
const OLD_STEER =
  '\tsteer(input) {\n\t\tthis.send(input, "next-turn", true); // [dsh-purge-86] user steer always next-turn\n\t}';
const UPSTREAM_RECOVERED_STEER =
  '\tsteer(input) {\n\t\tthis.send(input, "next-step", true); // [dsh-purge-86] steer() stays next-step for send_message\n\t}';
const HOST_QUEUE_CASE_GATED =
  '\t\t\tcase "steer":\n\t\t\t\tthis.ctx.get("sessionPersistence")?.dshGoDeletion?.assertAdmit(agent.id);\n\t\t\t\tagent.inbox.remove(request.itemId);\n\t\t\t\tagent.steer(message);';
const OLD_QUEUE_CASE_GATED =
  '\t\t\tcase "steer":\n\t\t\t\tthis.ctx.get("sessionPersistence")?.dshGoDeletion?.assertAdmit(agent.id);\n\t\t\t\tagent.inbox.remove(request.itemId);\n\t\t\t\tagent.followup(message); // [dsh-purge-86] queue steer → next-turn';

const RESTORE_NATIVE_STEERING = {
  id: 90,
  name: "RESTORE_NATIVE_STEERING",
  layer: "代码",
  layer_en: "Code",
  desc: "恢复原生插话与队列顺序，迁移旧 #85/#86 / restore native steering and queue order",
  file: ["api-session-controller", "agent-loop"],
  // 插话是用户直接感知的行为，锚点失配必须报出来，不能被可选补丁的 soft-ok 吞掉。
  strictFiles: true,
  requireAllTargets: true,
  fileOptional: ["agent-loop"],
  forbid: ["[dsh-purge-85]", "[dsh-purge-86]", "[dsh-purge] steer degrades to followup"],
  // 0.2.2-rc.3 原生就是 next-step/steer：没有旧标记、原生行齐全即视为已到位。
  settleCheck: (text) => nativeSteeringRestored(text),
  replacements: [
    { pattern: OLD_QUEUE_FALLBACK, replace: NATIVE_QUEUE_GUARD },
    { pattern: OLD_PROMPT, replace: NATIVE_PROMPT },
    { pattern: OLD_QUEUE_CASE, replace: NATIVE_QUEUE_CASE },
    { pattern: OLD_QUEUE_CASE_GATED, replace: HOST_QUEUE_CASE_GATED },
    { pattern: OLD_STEER, replace: NATIVE_STEER },
    { pattern: UPSTREAM_RECOVERED_STEER, replace: NATIVE_STEER },
  ],
};

/** 某个文件是否已经是原生的 steering 语义（无旧标记 + 原生分支齐全）。 */
export function nativeSteeringRestored(text) {
  const source = String(text).replace(/\r\n/g, "\n");
  if ([OLD_QUEUE_FALLBACK, OLD_PROMPT, OLD_QUEUE_CASE, OLD_STEER, UPSTREAM_RECOVERED_STEER]
    .some((part) => source.includes(part))) return false;
  if (source.includes("[dsh-purge-85]") || source.includes("[dsh-purge-86]")) return false;
  const controller = source.includes("async updateQueue(");
  const loop = source.includes("\tsteer(input) {");
  if (!controller && !loop) return false;
  const controllerOk = !controller
    || ((source.includes(NATIVE_PROMPT) || source.includes("if (request.mode === \"steer\") agent.steer(message);"))
      && (source.includes(NATIVE_QUEUE_CASE) || source.includes(HOST_QUEUE_CASE_GATED)));
  const loopOk = !loop || source.includes(NATIVE_STEER) || source.includes('this.send(input, "next-step", true);');
  return controllerOk && loopOk;
}

const COOKIE_NAME_IGNORE_PORT = {
  id: 91,
  name: "BROWSER_COOKIE_NAME_IGNORE_PORT",
  layer: "代码",
  layer_en: "Code",
  surfaces: ["desktop"],
  desc: "仅桌面端：会话 cookie 名忽略端口，避免随机端口累积 cookie 撑爆请求头（431）/ cookie name ignores port",
  file: ["client-connection"],
  optional: true,
  replacements: [
    {
      pattern: 'encodeBase64Url(createHash("sha256").update(authority).digest())',
      replace:
        'encodeBase64Url(createHash("sha256").update(String(authority).replace(/:[0-9]+$/u, "")).digest()) /* [dsh-purge] cookie-name-ignore-port */',
    },
  ],
  marker: "[dsh-purge] cookie-name-ignore-port",
};

const HOST_MAX_HTTP_HEADER_SIZE = {
  id: 92,
  name: "HOST_MAX_HTTP_HEADER_SIZE",
  layer: "代码",
  layer_en: "Code",
  desc: "放宽 host 进程 HTTP 请求头上限到 256KB，兜住历史 cookie 累积 / raise host max-http-header-size",
  file: "desktop-shell",
  surfaces: ["desktop"],
  optional: true,
  replacements: [
    {
      pattern:
        /("--expose-internals",)(?: \/\* \[dsh-purge\] raise-host-header-limit \*\/ "--max-http-header-size=262144",)*/g,
      replace: '$1 /* [dsh-purge] raise-host-header-limit */ "--max-http-header-size=262144",',
    },
  ],
  marker: "[dsh-purge] raise-host-header-limit",
};

const SANDBOX_POLICY_BRAND_NEUTRAL = {
  id: 93,
  name: "SANDBOX_POLICY_BRAND_NEUTRAL",
  layer: "提示词",
  layer_en: "Prompt",
  desc: "沙箱策略文案去掉 DSH 品牌词 / drop DSH branding from every file-policy line",
  file: ["sandbox-policy"],
  optional: true,
  multiHit: true,
  skipIfMarked: true,
  replacements: [
    { pattern: "Current DSH file policy: ", replace: "Current file policy: " },
    { pattern: "enforced by the DSH file sandbox", replace: "enforced by the file sandbox" },
    { pattern: "The DSH file sandbox does not restrict", replace: "The file sandbox does not restrict" },
  ],
  markers: ["Current file policy: "],
};

const SKILL_BADGE_NEUTRAL = {
  id: 94,
  name: "SKILL_BADGE_DESCRIPTION_NEUTRAL",
  layer: "提示词",
  layer_en: "Prompt",
  desc: "技能徽章描述去掉官方品牌要求 / neutralize skill-badge branding requirement",
  file: ["skill-badge"],
  optional: true,
  replacements: [
    {
      pattern:
        "Add the official \u201Cpowered by dsh\u201D badge to documents, pull requests, merge requests, and other content produced with DeepSeek Harness.",
      replace: "Add a small attribution badge to documents, pull requests, merge requests, and other content.",
    },
    {
      pattern:
        "Also use when the user asks for a dsh badge, powered-by-dsh attribution, or a reusable dsh badge asset or snippet.",
      replace: "Also use when the user asks for a badge, attribution line, or a reusable badge asset or snippet.",
    },
  ],
  markers: ["Add a small attribution badge to documents"],
};

function inspectorBudgetPatch(id, file, moduleName, budget) {
  const limitError = 'throw new Error("inspector: source state exceeds the source-frame byte limit");';
  const reserveMarker = "/* [dsh-purge] reserve inspector record overhead */";
  const dropMarker = "/* [dsh-purge] discard oversized Cordis tree */";
  const budgetLine = `maxBytes: ${budget} - 4096`;
  const indent = moduleName === "index.js" ? "\t\t\t" : "\t\t\t\t\t";
  const restore = "else this.state.set(topic, previous);\n" + indent;
  return {
    id,
    name: id === 95 ? "INSPECTOR_FRAME_BUDGET_RECORD_OVERHEAD" : "INSPECTOR_FRAME_BUDGET_RECORD_OVERHEAD_CLIENT",
    layer: "代码",
    layer_en: "Code",
    desc: "Cordis 树预留记录开销，超限时保留上一帧 / reserve inspector record overhead",
    file,
    replacements: [
      { pattern: budgetLine + "\n", replace: budgetLine + " - 1024 " + reserveMarker + "\n" },
      {
        pattern: restore + limitError,
        replace: restore + 'if (topic === "cordis/tree") return; ' + dropMarker + "\n" + indent + limitError,
      },
      {
        // 0.2.2-rc.2/rc.3 的 client bundle 压成一行，格式化锚点匹配不到时走这条。
        pattern:
          'if(!this.stateFits()){if(previous===void 0)this.state.delete(topic);else this.state.set(topic,previous);throw new Error(`inspector: source state exceeds the source-frame byte limit`)}this.enqueue(record)',
        replace:
          'if(!this.stateFits()){if(previous===void 0)this.state.delete(topic);else this.state.set(topic,previous);if(topic===`cordis/tree`)return; ' +
          dropMarker +
          'throw new Error(`inspector: source state exceeds the source-frame byte limit`)}this.enqueue(record)',
      },
    ],
    markers: [reserveMarker, dropMarker],
    markersAny: true,
    optional: true,
    // rc.3 原生已预留 STATE_RECORD_OVERHEAD_BYTES；这里锚点缺失代表加固已在上游，
    // 不是漂移。
    silentWhenMissing: true,
  };
}

export const MERGE_PATCHES = Object.freeze([
  ASK_USER_CAP,
  RESTORE_NATIVE_STEERING,
  COOKIE_NAME_IGNORE_PORT,
  HOST_MAX_HTTP_HEADER_SIZE,
  SANDBOX_POLICY_BRAND_NEUTRAL,
  SKILL_BADGE_NEUTRAL,
  inspectorBudgetPatch(95, ["experimental-inspector"], "index.js", "spec.maxSourceFrameBytes"),
  inspectorBudgetPatch(96, ["experimental-inspector-client"], "client.js", "bootstrap.maxFrameBytes"),
]);

export function withMergePatches(list, extra = MERGE_PATCHES) {
  const seen = new Set(list.map((p) => p.id));
  return [...list, ...extra.filter((p) => !seen.has(p.id))];
}

// ── tuning gate ─────────────────────────────────────────────────────────────

export function homeOf(dshHome) {
  if (dshHome) return dshHome;
  if (process.env.DSH_HOME) return process.env.DSH_HOME;
  return path.join(os.homedir(), ".dsh");
}

export function tuningPath(dshHome) {
  return path.join(homeOf(dshHome), "dsh-purge", TUNING_FILE);
}

export function readTuning(dshHome) {
  const file = tuningPath(dshHome);
  const tuning = { ...TUNING_DEFAULTS, extraPatches: [] };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return tuning;
  }
  if (!raw || typeof raw !== "object") return tuning;
  if (raw.permissionPatches === false) tuning.permissionPatches = false;
  tuning.contextManagement = raw.contextManagement === true;
  if (Array.isArray(raw.extraPatches)) {
    tuning.extraPatches = raw.extraPatches.map(Number).filter(Number.isFinite);
  }
  if (raw.routingGate === true) tuning.routingGate = true;
  if (raw.rewind === true) tuning.rewind = true;
  if (raw.refusalRetry === true) tuning.refusalRetry = true;
  return tuning;
}

export function writeTuning(patchValues, dshHome) {
  const file = tuningPath(dshHome);
  const current = readTuning(dshHome);
  const next = { ...current, ...(patchValues || {}) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

/** Normalize an options object into something `patchEnabled` can consume. */
export function patchGateOf(options = {}) {
  if (Array.isArray(options.extraPatches)) return options.extraPatches;
  if (options.tuning && typeof options.tuning === "object") return options.tuning;
  return readTuning(options.dshHome);
}

/**
 * 补丁是否启用。
 * - 传数组：旧口径，只有列在清单里的默认关闭补丁才启用。
 * - 传对象：tuning 结构，按补丁组判定。
 * - 不传：读本机 tuning.json。
 */
export function patchEnabled(patch, gate = null) {
  if (!patch?.disabledByDefault && !patch?.permissionOverride) return true;
  if (Array.isArray(gate)) return gate.map(Number).includes(Number(patch.id));
  const t = gate && typeof gate === "object"
    ? { ...TUNING_DEFAULTS, extraPatches: [], ...gate }
    : readTuning();
  if (patch.permissionOverride) return t.permissionPatches !== false;
  const listed = (t.extraPatches || []).map(Number).includes(Number(patch.id));
  if (patch.optIn) return t.contextManagement === true || listed;
  return listed;
}

export function disabledPatchIds(patches, gate) {
  const out = new Set();
  for (const p of patches) if (!patchEnabled(p, gate)) out.add(p.id);
  return out;
}

// ── permission ledger: replay recipes against the recorded baseline ─────────

function replacementsOf(patch, fallback) {
  if (Array.isArray(patch.replacements)) return patch.replacements;
  if (Array.isArray(patch.patterns)) return patch.patterns.map((pattern) => ({ pattern, replace: patch.replace }));
  return typeof patch.replace === "string" && patch.pattern ? [{ pattern: patch.pattern, replace: patch.replace }] : [];
}

function ownMarkers(patch, fallback) {
  const markers = [patch.marker, ...(patch.markers || [])];
  for (const { replace } of replacementsOf(patch, fallback)) {
    if (typeof replace === "string") markers.push(...replace.split("\n").map((line) => line.trim()));
  }
  return markers.filter((m) => typeof m === "string" && m.includes("[dsh-purge]"));
}

function hasOwnMarker(source, patch, fallback) {
  return ownMarkers(patch, fallback).some((marker) => source.includes(marker));
}

/**
 * 从 baseline（备份）重放历史配方，得到「关掉这组补丁后」应有的文本。
 * 任何无法证明归属的差异都退回原文件，并给出可读冲突原因。
 */
export function replayedText({ baseline, current, patches, disabled, file, apply, applied }) {
  const looksApplied = (text, patch) => applied(text, patch);
  const removed = patches.filter((p) => disabled.has(p.id));
  if (baseline === null) {
    if (removed.some((p) => looksApplied(current, p) || hasOwnMarker(current, p))) {
      throw Error("missing permission migration backup");
    }
    return current;
  }
  if (!baseline.length) throw Error("empty permission migration backup");
  if (removed.some((p) => hasOwnMarker(baseline, p) && hasOwnMarker(current, p))) {
    throw Error("permission backup contains a previous plugin marker");
  }
  if (current === baseline) return current;
  for (const group of [patches, removed, patches.filter((p) => looksApplied(current, p))]) {
    let old = baseline;
    let desired = baseline;
    for (const patch of group) {
      const step = apply(old, patch, file);
      if (!step || !step.changed) continue;
      old = step.text;
      if (!disabled.has(patch.id)) {
        const again = apply(desired, patch, file);
        if (again) desired = again.text;
      }
    }
    if (old === current) return desired;
    if (desired === current) return current;
  }
  // 无法复现的编辑：保留现场，但若权限锚点的出现次数变了就报冲突。
  for (const patch of removed) {
    for (const { pattern, replace } of replacementsOf(patch)) {
      if (typeof replace !== "string") continue;
      if (occurrences(baseline, pattern) !== occurrences(current, pattern)) {
        throw Error("permission edits differ from the recorded baseline");
      }
      if (occurrences(baseline, replace) !== occurrences(current, replace)) {
        throw Error("permission edits differ from the recorded baseline");
      }
    }
  }
  return current;
}

function occurrences(source, pattern) {
  if (pattern instanceof RegExp) {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    return [...source.matchAll(new RegExp(pattern.source, flags))].length;
  }
  return pattern ? source.split(String(pattern)).length - 1 : 0;
}

function readUtf8(fp) {
  const bytes = fs.readFileSync(fp);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes)) throw Error("invalid UTF-8 in permission migration file");
  return text;
}

/**
 * 关闭（或卸载）权限补丁时，把已打上的权限改动从活文件里撤回到 baseline。
 * 返回 Map<patchId, row[]>，row = { path, status: restored|pending|unmatched, error? }
 */
export async function reconcilePermissionLedger({
  files,
  patches,
  gate,
  roots,
  save = false,
  apply,
  applied,
  keysOf,
  pathsOf,
  writeFile,
}) {
  const result = new Map();
  const disabled = disabledPatchIds(patches, gate);
  if (!disabled.size) return result;
  const targets = new Map();
  for (const p of patches) {
    const keys = keysOf(p);
    const paths = keys.flatMap((key) => pathsOf(files, key)).filter(Boolean);
    for (const fp of new Set(paths)) {
      if (!targets.has(fp)) targets.set(fp, []);
      targets.get(fp).push(p);
    }
  }
  for (const [file, owners] of targets) {
    const hit = owners.filter((p) => disabled.has(p.id));
    if (!hit.length) continue;
    let row;
    try {
      assertWithinRoots(file, roots);
      if (!fs.lstatSync(file).isFile()) throw Error("non-regular permission target");
      const backup = file + ".dshpurge.bak";
      let baseline = null;
      try {
        if (!fs.lstatSync(backup).isFile()) throw Error("non-regular permission backup");
        baseline = readUtf8(backup);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const current = readUtf8(file);
      const next = replayedText({ baseline, current, patches: owners, disabled, file, apply, applied });
      if (next !== current) {
        if (save && typeof writeFile === "function") await writeFile(file, next, current);
        row = { path: file, status: save ? "restored" : "pending" };
      }
    } catch (error) {
      row = { path: file, status: "unmatched", error: error.message };
    }
    if (!row) continue;
    for (const p of hit) {
      if (!result.has(p.id)) result.set(p.id, []);
      result.get(p.id).push(row);
    }
  }
  return result;
}
