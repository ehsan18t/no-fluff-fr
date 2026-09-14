// Phase 2 measurement: runs every prompt in eval/prompts.json with the plugin off
// and on, in fresh headless sessions, and saves each reply.
//
//   node eval/run.mjs <label>        writes eval/runs/<label>/<prompt>-<off|on>-<n>.json
//
// Env: REPS (default 3), CONCURRENCY (default 6), MODEL (default claude-opus-5[1m]; both arms
// must use the same model). Reruns skip replies already saved.
//
// Isolation: --setting-sources "" keeps user and project settings (so other installed
// plugins and their hooks) out of both arms, --tools "" makes every reply plain text,
// and a neutral temp working directory keeps project CLAUDE.md and memory out.
// The only difference between the arms is --plugin-dir pointing at this repo.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const label = process.argv[2] ?? "baseline";
const REPS = Number(process.env.REPS ?? 3);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const MODEL = process.env.MODEL ?? "claude-opus-5[1m]";
const outDir = join(here, "runs", label);
mkdirSync(outDir, { recursive: true });
const cwd = mkdtempSync(join(tmpdir(), "nsb-eval-"));
const bin = process.platform === "win32" ? "claude.exe" : "claude";

const prompts = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8"));
const jobs = [];
for (const p of prompts) {
  for (const cond of ["off", "on"]) {
    for (let rep = 1; rep <= REPS; rep++) {
      const id = `${p.id}-${cond}-${rep}`;
      if (!existsSync(join(outDir, `${id}.json`))) jobs.push({ id, p, cond, rep });
    }
  }
}

function run({ id, p, cond, rep }) {
  const args = ["-p", "--model", MODEL, "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence"];
  if (cond === "on") args.push("--plugin-dir", repo);
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      try {
        const o = JSON.parse(out);
        if (o.is_error) throw new Error(o.result);
        const record = { id, prompt: p.id, kind: p.kind, cond, rep, model: o.modelUsage ? Object.keys(o.modelUsage) : null, cost_usd: o.total_cost_usd, duration_ms: o.duration_ms, result: o.result };
        writeFileSync(join(outDir, `${id}.json`), JSON.stringify(record, null, 2));
        console.log(`done ${id}`);
      } catch (e) {
        console.log(`FAIL ${id} exit ${code}: ${String(e.message).slice(0, 200)} ${err.slice(0, 200)}`);
      }
      resolve();
    });
    child.stdin.end(p.prompt);
  });
}

console.log(`${jobs.length} runs to do in ${outDir}`);
const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await run(queue.shift());
}));
