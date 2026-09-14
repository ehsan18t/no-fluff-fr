// Gate for the shipped plugin files. Run in CI, never as a hook.
//
//   node scripts/check.mjs [plugin-root]
//
// Fails (exit 1) when:
// - rules.md exceeds 8,000 bytes. The harness cuts one hook's output above roughly
//   10 KB to a short preview, so the rules would silently arrive incomplete.
// - reminder.md exceeds 500 bytes. It is paid for on every prompt.
// - either file has a non-ASCII byte, which Windows PowerShell can mis-decode.
// - hooks.json, plugin.json or marketplace.json does not parse.
// - a file referenced as ${CLAUDE_PLUGIN_ROOT}/<path> in hooks.json does not exist.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const LIMITS = { "rules.md": 8000, "reminder.md": 500 };
const errors = [];

for (const [name, limit] of Object.entries(LIMITS)) {
  const path = join(root, name);
  if (!existsSync(path)) continue; // reported below if the hooks reference it
  const bytes = readFileSync(path);
  if (bytes.length > limit) errors.push(`${name} is ${bytes.length} bytes, over the ${limit}-byte limit`);
  const at = bytes.findIndex((b) => b > 0x7f);
  if (at !== -1) {
    const line = bytes.subarray(0, at).toString("latin1").split("\n").length;
    errors.push(`${name} has a non-ASCII byte at line ${line}`);
  }
}

function parseJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch (e) {
    errors.push(`${rel} does not parse: ${e.message}`);
    return null;
  }
}

parseJson(".claude-plugin/plugin.json");
parseJson(".claude-plugin/marketplace.json");
const hooks = parseJson("hooks/hooks.json");

if (hooks) {
  const referenced = new Set();
  for (const groups of Object.values(hooks.hooks ?? {})) {
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        for (const text of [hook.command, ...(hook.args ?? [])]) {
          for (const m of String(text ?? "").matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/g)) referenced.add(m[1]);
        }
      }
    }
  }
  if (referenced.size === 0) errors.push("hooks/hooks.json references no plugin file");
  for (const rel of referenced) {
    if (!existsSync(join(root, rel))) errors.push(`${rel} is referenced by hooks/hooks.json but does not exist`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log("ok");
