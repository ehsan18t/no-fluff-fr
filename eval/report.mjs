// Task-report test: each prompt in eval/report-prompts.json hands the model the
// facts of a finished task, noise included (checks it ran, its own notes, a step
// the user said they would take), and asks for the reply to the user. The script
// counts words, lines and bullets per reply and collects the replies for a reader,
// who counts the lines the user does not act on and checks that each prompt's
// mustHave items survived.
//
//   node eval/report.mjs <label>                 runs the prompts with this repo as the plugin
//   node eval/report.mjs <label> --replies <dir> scores replies already saved as <prompt>-<n>.md
//
// Env: REPS (default 6), CONCURRENCY (default 6), PLUGIN_DIR (default: this repo),
// MODEL (default claude-opus-5[1m]).
// Writes eval/runs/<label>/report/<prompt>-<n>.md and eval/results/<label>/report.md.
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
  console.error("usage: node eval/report.mjs <label> [--replies <dir>]");
  process.exit(2);
}
const repliesAt = args.indexOf("--replies");
const runDir = repliesAt === -1 ? join(here, "runs", label, "report") : args[repliesAt + 1];
const outDir = join(here, "results", label);
const REPS = Number(process.env.REPS ?? 6);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const pluginDir = process.env.PLUGIN_DIR ?? repo;
const MODEL = process.env.MODEL ?? "claude-opus-5[1m]";
const prompts = JSON.parse(readFileSync(join(here, "report-prompts.json"), "utf8"));

if (repliesAt === -1) {
  mkdirSync(runDir, { recursive: true });
  const cwd = mkdtempSync(join(tmpdir(), "nsb-report-"));
  const bin = process.platform === "win32" ? "claude.exe" : "claude";
  const queue = prompts
    .flatMap((p) => Array.from({ length: REPS }, (_, i) => ({ p, rep: i + 1 })))
    .filter(({ p, rep }) => !existsSync(join(runDir, `${p.id}-${rep}.md`)));
  console.log(`${queue.length} runs to do in ${runDir}`);
  const run = ({ p, rep }) =>
    new Promise((resolve) => {
      const child = spawn(bin, ["-p", "--model", MODEL, "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence", "--plugin-dir", pluginDir], { cwd, stdio: ["pipe", "pipe", "pipe"] });
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

const BULLET = /^\s*([-*+]|\d+[.)])\s/;
const rep = (f) => Number(f.match(/-(\d+)\.md$/)[1]);
const rows = [];
const replies = [];
const allWords = [];
for (const p of prompts) {
  const files = readdirSync(runDir).filter((f) => f.startsWith(`${p.id}-`) && f.endsWith(".md")).sort((a, b) => rep(a) - rep(b));
  for (const f of files) {
    const text = readFileSync(join(runDir, f), "utf8");
    const noCode = text.replace(/```[\s\S]*?(```|$)/g, "");
    const lines = noCode.split(/\r?\n/).filter((l) => l.trim());
    const words = noCode.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
    const bullets = lines.filter((l) => BULLET.test(l)).length;
    const codeBlocks = (text.match(/```/g) ?? []).length / 2;
    allWords.push(words);
    rows.push(`| ${p.id} | ${rep(f)} | ${words} | ${lines.length} | ${bullets} | ${codeBlocks} |`);
    replies.push(`### ${p.id} ${rep(f)}`, "", "````markdown", text, "````", "");
  }
}
const sorted = [...allWords].sort((a, b) => a - b);
const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : NaN;

mkdirSync(outDir, { recursive: true });
const md = [
  `# Task-report test: ${label}`,
  "",
  `${allWords.length} replies, median ${median} words. A reader counts the lines the user does not act on in \`report-judgment.md\`.`,
  "",
  "| Prompt | Run | Words | Lines | Bullets | Code blocks |",
  "|---|---|---|---|---|---|",
  ...rows,
  "",
  "## Must-have items per prompt",
  "",
  ...prompts.flatMap((p) => [`- ${p.id}: ${p.mustHave.join("; ")}`]),
  "",
  "## Replies",
  "",
  ...replies,
].join("\n");
writeFileSync(join(outDir, "report.md"), md);
console.log(`${label}: ${allWords.length} replies, median ${median} words, written to ${join(outDir, "report.md")}`);
