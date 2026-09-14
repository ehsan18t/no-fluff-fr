// Scores a measurement run: words per reply (code blocks excluded) and prose
// paragraphs left after line one, per prompt and overall, plugin off vs on.
//
//   node eval/score.mjs <label>      reads eval/runs/<label>, writes eval/results/<label>/
//
// Writes metrics.md (the numbers) and replies.md (every reply, grouped by prompt,
// for the caveat and line-one judgment, which is done by a reader, not this script).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "baseline";
const runDir = join(here, "runs", label);
const outDir = join(here, "results", label);
mkdirSync(outDir, { recursive: true });

const runs = readdirSync(runDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(runDir, f), "utf8")));
const prompts = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8"));

const stripCode = (text) => text.replace(/```[\s\S]*?(```|$)/g, "");
const words = (text) => stripCode(text).split(/\s+/).filter(Boolean).length;

// A paragraph is a blank-line-separated block after line one, with no list, table,
// heading or quote lines, holding more than 25 words.
function paragraphs(text) {
  const lines = stripCode(text).split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const blocks = lines.slice(first + 1).join("\n").split(/\n\s*\n/);
  return blocks.filter((b) => {
    const ls = b.split("\n").filter((l) => l.trim());
    return ls.length && ls.every((l) => !/^\s*([-*+]\s|\d+[.)]\s|\||#|>)/.test(l)) && b.split(/\s+/).filter(Boolean).length > 25;
  }).length;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const rows = [];
const all = { off: [], on: [] };
const withPara = { off: 0, on: 0 };
const count = { off: 0, on: 0 };
let cost = 0;
for (const p of prompts) {
  const row = { id: p.id, kind: p.kind };
  for (const cond of ["off", "on"]) {
    const rs = runs.filter((r) => r.prompt === p.id && r.cond === cond);
    const ws = rs.map((r) => words(r.result));
    all[cond].push(...ws);
    row[cond] = { median: median(ws), n: rs.length, para: rs.filter((r) => paragraphs(r.result) > 0).length };
    withPara[cond] += row[cond].para;
    count[cond] += rs.length;
    cost += rs.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  }
  rows.push(row);
}

const pct = (off, on) => (off ? `${Math.round(((on - off) / off) * 100)}%` : "n/a");
const md = [
  `# Measurement: ${label}`,
  "",
  `Replies: ${count.off} off, ${count.on} on. Models: ${[...new Set(runs.flatMap((r) => r.model ?? []))].join(", ")}. Cost: $${cost.toFixed(2)}.`,
  "",
  "| Prompt | Kind | Median words off | Median words on | Change | Replies with a paragraph off | on |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.kind} | ${r.off.median} | ${r.on.median} | ${pct(r.off.median, r.on.median)} | ${r.off.para}/${r.off.n} | ${r.on.para}/${r.on.n} |`),
  `| **All** | | **${median(all.off)}** | **${median(all.on)}** | **${pct(median(all.off), median(all.on))}** | **${withPara.off}/${count.off}** | **${withPara.on}/${count.on}** |`,
  "",
].join("\n");
writeFileSync(join(outDir, "metrics.md"), md);

const replies = [`# Replies: ${label}`, ""];
for (const p of prompts) {
  replies.push(`## ${p.id}`, "", "Prompt:", "", "````text", p.prompt, "````", "");
  for (const cond of ["off", "on"]) {
    for (const r of runs.filter((x) => x.prompt === p.id && x.cond === cond).sort((a, b) => a.rep - b.rep)) {
      replies.push(`### ${p.id} ${cond} ${r.rep}`, "", "````markdown", r.result, "````", "");
    }
  }
}
writeFileSync(join(outDir, "replies.md"), replies.join("\n"));
console.log(md);
