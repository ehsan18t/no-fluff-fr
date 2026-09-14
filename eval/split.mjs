// One-point test: each prompt in eval/split-prompts.json reports a single finding.
// A reply fails when it splits that one finding into a heading or into bullets
// labeled as its parts (Evidence, Impact, Fix, ...). Separate items such as a
// risk or an assumption may still have their own bullets; a prompt with no
// separate items sets maxBullets.
//
//   node eval/split.mjs <label>                 runs the prompts with this repo as the plugin
//   node eval/split.mjs <label> --replies <dir> scores replies already saved as <prompt>-<n>.md
//
// Env: REPS (default 6), CONCURRENCY (default 6), PLUGIN_DIR (default: this repo).
// Writes eval/runs/<label>/split/<prompt>-<n>.md and eval/results/<label>/split.md.
// Isolation is the same as eval/run.mjs.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const args = process.argv.slice(2);
const label = args[0];
if (!label || label.startsWith("--")) {
  console.error("usage: node eval/split.mjs <label> [--replies <dir>]");
  process.exit(2);
}
const repliesAt = args.indexOf("--replies");
const runDir = repliesAt === -1 ? join(here, "runs", label, "split") : args[repliesAt + 1];
const outDir = join(here, "results", label);
const REPS = Number(process.env.REPS ?? 6);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const pluginDir = process.env.PLUGIN_DIR ?? repo;
const prompts = JSON.parse(readFileSync(join(here, "split-prompts.json"), "utf8"));

if (repliesAt === -1) {
  mkdirSync(runDir, { recursive: true });
  const cwd = mkdtempSync(join(tmpdir(), "nsb-split-"));
  const bin = process.platform === "win32" ? "claude.exe" : "claude";
  const queue = prompts
    .flatMap((p) => Array.from({ length: REPS }, (_, i) => ({ p, rep: i + 1 })))
    .filter(({ p, rep }) => !existsSync(join(runDir, `${p.id}-${rep}.md`)));
  console.log(`${queue.length} runs to do in ${runDir}`);
  const run = ({ p, rep }) =>
    new Promise((resolve) => {
      const child = spawn(bin, ["-p", "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence", "--plugin-dir", pluginDir], { cwd, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) => {
        try {
          const o = JSON.parse(out);
          if (o.is_error) throw new Error(o.result);
          writeFileSync(join(runDir, `${p.id}-${rep}.md`), o.result);
          console.log(`done ${p.id}-${rep}`);
        } catch (e) {
          console.log(`FAIL ${p.id}-${rep} exit ${code}: ${String(e.message).slice(0, 200)} ${err.slice(0, 200)}`);
        }
        resolve();
      });
      child.stdin.end(p.prompt);
    });
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await run(queue.shift());
  }));
}

const HEADING = /^#{1,6}\s/;
const BULLET = /^\s*([-*+]|\d+[.)])\s/;
const PART = /^\s*([-*+]|\d+[.)])\s+\*\*(evidence|impact|consequence|proposed|fix|why|cause|question|recommendation|finding|details|context|not verified|status|verified)\b/i;
const rep = (f) => Number(f.match(/-(\d+)\.md$/)[1]);

const rows = [];
const replies = [];
let split = 0;
let total = 0;
for (const p of prompts) {
  const files = readdirSync(runDir).filter((f) => f.startsWith(`${p.id}-`) && f.endsWith(".md")).sort((a, b) => rep(a) - rep(b));
  for (const f of files) {
    const text = readFileSync(join(runDir, f), "utf8");
    const lines = text.replace(/```[\s\S]*?(```|$)/g, "").split(/\r?\n/);
    const headings = lines.filter((l) => HEADING.test(l)).length;
    const bullets = lines.filter((l) => BULLET.test(l)).length;
    const parts = lines.filter((l) => PART.test(l)).length;
    const isSplit = headings > 0 || parts > 0 || (p.maxBullets !== undefined && bullets > p.maxBullets);
    total++;
    if (isSplit) split++;
    rows.push(`| ${p.id} | ${rep(f)} | ${headings} | ${bullets} | ${parts} | ${isSplit ? "yes" : "no"} |`);
    replies.push(`### ${p.id} ${rep(f)}${isSplit ? " (split)" : ""}`, "", "````markdown", text, "````", "");
  }
}

mkdirSync(outDir, { recursive: true });
const md = [
  `# One-point test: ${label}`,
  "",
  `${split} of ${total} replies split a single finding into a heading or labeled parts.`,
  "",
  "A reply counts as split when it has a heading, a bullet whose bold label names a part of the finding (Evidence, Impact, Fix, ...), or more bullets than the prompt allows (`maxBullets` in split-prompts.json, set only for a prompt with no separate items).",
  "",
  "| Prompt | Run | Headings | Bullets | Labeled parts | Split |",
  "|---|---|---|---|---|---|",
  ...rows,
  "",
  "## Replies",
  "",
  ...replies,
].join("\n");
writeFileSync(join(outDir, "split.md"), md);
console.log(`${label}: ${split} of ${total} split, written to ${join(outDir, "split.md")}`);
