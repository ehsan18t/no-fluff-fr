// One command: run the same prompts with the last release's rules and with the working
// tree's rules, count what a script can count, let a blind judge compare the pairs, and
// print one result. Nothing is stored in the repo. See eval/README.md for what is
// measured and why.
//
//   node eval/run.mjs <tiny|small|medium|large|xl> [options]
//
//   --base <ref>         compare against this commit instead of the last release commit
//   --model <id>         writer model (default: claude-opus-5)
//   --effort <level>     reasoning effort: low|medium|high|xhigh|max (default: high)
//   --judge-model <id>   judge model (default: same as --model)
//   --no-judge           counts only, no judge calls
//   --reps N             runs per prompt (default: the level's)
//   --only id,id         a subset of the level's prompts
//   --out file.md        also write the result as Markdown
//   --dry-run            print the plan and the cost estimate, run nothing
//   --replies <dir>      score a previous run's replies again (the folder it printed), no generation
//
// Env: CONCURRENCY (default 6).

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

// ---------------------------------------------------------------------------- arguments

const LEVELS = { tiny: { tier: 1, reps: 1 }, small: { tier: 2, reps: 1 }, medium: { tier: 3, reps: 2 }, large: { tier: 4, reps: 3 }, xl: { tier: 5, reps: 3 } };
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(name);
const level = argv[0];
if (!LEVELS[level]) {
  console.error(`usage: node eval/run.mjs <${Object.keys(LEVELS).join("|")}> [--base <ref>] [--model <id>] [--judge-model <id>] [--no-judge] [--reps N] [--only id,id] [--out file.md] [--dry-run] [--replies <dir>]`);
  process.exit(2);
}
const reps = Number(flag("--reps") ?? LEVELS[level].reps);
const only = flag("--only")?.split(",");
// The plugin targets Opus 5, so the eval measures on it by default. Override with --model.
const WRITER_MODEL = "claude-opus-5";
const model = flag("--model") ?? WRITER_MODEL;
// Reasoning effort pinned so every session reasons the same. Override with --effort.
const EFFORT = "high";
const effort = flag("--effort") ?? EFFORT;
const judgeModel = flag("--judge-model") ?? model;
const useJudge = !has("--no-judge");
const outFile = flag("--out");
const dryRun = has("--dry-run");
const repliesDir = flag("--replies");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const COST = { reply: 0.08, judge: 0.03 }; // dollars, from earlier runs on Opus 5

const prompts = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8")).filter((p) => p.tier <= LEVELS[level].tier && (!only || only.includes(p.id)));
if (prompts.length === 0) {
  console.error("no prompts match");
  process.exit(2);
}

// ---------------------------------------------------------------------------- versions

const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const baseRef = flag("--base") ?? git("log", "-1", "--format=%H", "--grep=^chore(plugin): release");
if (!baseRef) {
  console.error("no release commit found, pass --base <ref>");
  process.exit(2);
}
const baseLabel = git("log", "-1", "--format=%h %s", baseRef);
const dirty = git("status", "--porcelain", "--", "inject", "hooks").length > 0;

const pairs = prompts.length * reps;
const estimate = pairs * 2 * COST.reply + (useJudge ? pairs * 2 * COST.judge : 0);
console.log(`no-fluff-fr eval, level ${level}: ${prompts.length} prompts x ${reps} run${reps > 1 ? "s" : ""} per version`);
console.log(`old = ${baseLabel}`);
console.log(`new = working tree${dirty ? "" : " (no uncommitted change in inject/ or hooks/)"}`);
console.log(`judge: ${useJudge ? "on, blind, both orders" : "off"}. Estimated cost: about $${estimate.toFixed(2)}`);
console.log(`writer model: ${model}${useJudge && judgeModel !== model ? `, judge model: ${judgeModel}` : ""}, effort: ${effort}`);
if (dryRun) {
  console.log(`prompts: ${prompts.map((p) => p.id).join(", ")}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------- generation

const bin = process.platform === "win32" ? "claude.exe" : "claude";
const work = repliesDir ?? mkdtempSync(join(tmpdir(), "no-fluff-fr-eval-"));
const cwd = join(work, "cwd");
mkdirSync(cwd, { recursive: true });
const seen = { writer: new Set(), judge: new Set(), background: new Set() };
// The writer is the model that produced the reply text (the most output tokens). Every other
// model a session bills (a fixed Haiku background call) is background, not the writer.
const writerOf = (usage) => Object.entries(usage).sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0]?.[0] ?? "unknown";
const noteModels = (kind, usage) => {
  const w = writerOf(usage);
  seen[kind].add(w);
  for (const k of Object.keys(usage)) if (k !== w) seen.background.add(k);
  return w;
};
let spent = 0;

function claude(args, input, cwdDir) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: cwdDir, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      try {
        const o = JSON.parse(out);
        if (o.is_error) throw new Error(o.result);
        spent += o.total_cost_usd ?? 0;
        resolve({ text: o.result, usage: o.modelUsage ?? {} });
      } catch (e) {
        resolve({ error: `exit ${code}: ${String(e.message).slice(0, 160)} ${err.slice(0, 160)}`.trim() });
      }
    });
    child.stdin.end(input);
  });
}

async function pool(jobs) {
  const queue = [...jobs];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await queue.shift()();
  }));
}

const arms = { old: null, new: repo };
const replies = {}; // replies[arm][id][rep] = text or null when failed
let failed = 0;

if (!repliesDir) {
  arms.old = join(work, "old-plugin");
  git("worktree", "add", "--detach", arms.old, baseRef);
  try {
    const jobs = [];
    for (const arm of ["old", "new"]) {
      mkdirSync(join(work, arm), { recursive: true });
      replies[arm] = {};
      for (const p of prompts) {
        replies[arm][p.id] = [];
        for (let rep = 1; rep <= reps; rep++) {
          jobs.push(async () => {
            const args = ["-p", "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence", "--plugin-dir", arms[arm]];
            if (model) args.push("--model", model);
            if (effort) args.push("--effort", effort);
            const r = await claude(args, p.prompt, cwd);
            if (r.error) {
              failed++;
              console.log(`FAIL ${arm} ${p.id}-${rep} ${r.error}`);
              replies[arm][p.id][rep - 1] = null;
              return;
            }
            const writer = noteModels("writer", r.usage);
            writeFileSync(join(work, arm, `${p.id}-${rep}.md`), `<!-- writer: ${writer} -->\n\n${r.text}`);
            replies[arm][p.id][rep - 1] = r.text;
            console.log(`done ${arm} ${p.id}-${rep}`);
          });
        }
      }
    }
    await pool(jobs);
  } finally {
    git("worktree", "remove", "--force", arms.old);
  }
} else {
  for (const arm of ["old", "new"]) {
    replies[arm] = {};
    for (const p of prompts) {
      replies[arm][p.id] = [];
      for (let rep = 1; rep <= reps; rep++) {
        const f = join(work, arm, `${p.id}-${rep}.md`);
        if (existsSync(f)) {
          const raw = readFileSync(f, "utf8");
          const m = raw.match(/^<!-- writer: (.*?) -->\n\n/);
          if (m) seen.writer.add(m[1]);
          replies[arm][p.id][rep - 1] = m ? raw.slice(m[0].length) : raw;
        } else {
          replies[arm][p.id][rep - 1] = null;
          failed++;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------- counts

const stripCode = (t) => t.replace(/```[\s\S]*?(```|$)/g, "");
const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const sentences = (t) =>
  stripCode(t)
    .replace(/^\s*(?:[-*+]|\d+[.)]|#+)\s+/gm, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const LABELED = /^\s*(?:[-*+]|\d+[.)])\s+(?:\S+\s+){0,2}\*\*/; // bold label or code within the first three tokens
const HEADING = /^\s*#{1,6}\s+(.*?)\s*$/;
const CODE = /\*\*([A-Z]{1,3})\d+\.?\*\*/;
const OFFER = /\b(let me know|say the word|want me to|happy to|i can also|feel free|if you want)\b/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const keyRe = (k) => (k.startsWith("re:") ? new RegExp(k.slice(3), "i") : new RegExp(`\\b${escapeRe(k)}\\b`, "i"));

function count(p, text) {
  const body = stripCode(text);
  const lines = body.split(/\r?\n/);
  const ss = sentences(text);
  let heading = null;
  let codeMismatch = 0;
  let badHeadings = 0;
  for (const l of lines) {
    const h = l.match(HEADING);
    if (h) {
      heading = h[1];
      if (words(heading).length > 3 || /\([A-Z]{1,3}\)/.test(heading)) badHeadings++;
      continue;
    }
    const c = BULLET.test(l) && l.match(CODE);
    if (c && heading && c[1][0] !== heading.replace(/[^A-Za-z]/g, "")[0]?.toUpperCase()) codeMismatch++;
  }
  const first = lines.find((l) => l.trim().length > 0) ?? "";
  const firstText = first.replace(/^\s*#+\s*/, "").replace(/\*\*/g, "");
  const lineOne = p.kind === "task" ? sentences(firstText).length === 1 : p.kind === "question" ? sentences(firstText).length === 1 && firstText.trim().endsWith("?") : null;
  const missing = (p.mustHave ?? []).filter((m) => !m.keys.some((k) => keyRe(k).test(text))).map((m) => m.fact);
  return {
    words: words(body).length,
    long: ss.filter((s) => words(s).length > 25).length,
    semicolons: (body.match(/;/g) ?? []).length,
    unlabeled: lines.filter((l) => BULLET.test(l) && !LABELED.test(l)).length,
    badHeadings,
    codeMismatch,
    offers: (body.match(OFFER) ?? []).length,
    jargon: (p.jargon ?? []).filter((j) => body.toLowerCase().includes(j.toLowerCase())).length,
    lineOne,
    missing,
    hasMustHave: Boolean(p.mustHave),
  };
}

const counts = { old: {}, new: {} };
for (const arm of ["old", "new"]) for (const p of prompts) counts[arm][p.id] = replies[arm][p.id].map((t) => (t == null ? null : count(p, t)));

// ---------------------------------------------------------------------------- judge

const CRITERIA = ["complete", "noise", "skimmable", "readable", "lineOne"];

function judgePrompt(p, a, b) {
  const facts = p.mustHave ? `Facts the reply must state:\n${p.mustHave.map((m) => `- ${m.fact}`).join("\n")}` : "There is no fixed list of required facts. Judge completeness on what a developer needs in order to act.";
  return `You are judging two replies to the same request, both written by an AI coding assistant to a developer. You did not write them. Be fair to both. Answer with JSON only.

The developer's request, and the facts the assistant had:
<<<
${p.prompt}
>>>

${facts}

Reply A:
<<<
${a}
>>>

Reply B:
<<<
${b}
>>>

Judge five things. For each, name the better reply, "A", "B" or "tie", with one sentence of reason:
1. complete: every fact the developer needs is stated. A missing fact counts against the reply.
2. noise: no line the developer would not act on: how it was checked, a restated request, content they can open in the file, the assistant's own notes, a step the developer said they would take, a fact with no consequence, an offer.
3. skimmable: the most important line first, one item per line, a bold label or code on each bullet, sections only when needed.
4. readable: every sentence read once, developer terms, exact names of files and values, no filler.
5. lineOne: the first line does its job: what changed for a task, the question itself for a question, the cause for an explanation.

Also list, each quoted and shortened to 12 words:
- missingA, missingB: facts missing from each reply
- noiseA, noiseB: noise lines in each reply

Return exactly this JSON and nothing else:
{"complete":{"winner":"A","why":""},"noise":{"winner":"","why":""},"skimmable":{"winner":"","why":""},"readable":{"winner":"","why":""},"lineOne":{"winner":"","why":""},"missingA":[],"missingB":[],"noiseA":[],"noiseB":[]}`;
}

function parseJudge(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// verdicts[id][rep] = { criterion: "new" | "old" | "tie" | "n/a" }, evidence lists keyed by arm
const verdicts = {};
const evidence = { missing: { old: [], new: [] }, noise: { old: [], new: [] } };
let judgeFailed = 0;

if (useJudge) {
  const jobs = [];
  for (const p of prompts) {
    verdicts[p.id] = [];
    for (let rep = 1; rep <= reps; rep++) {
      const o = replies.old[p.id][rep - 1];
      const n = replies.new[p.id][rep - 1];
      if (o == null || n == null) {
        verdicts[p.id][rep - 1] = null;
        continue;
      }
      jobs.push(async () => {
        const args = ["-p", "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence"];
        if (judgeModel) args.push("--model", judgeModel);
        if (effort) args.push("--effort", effort);
        // Order 1: A = old, B = new. Order 2: A = new, B = old. A disagreement is a tie.
        const [r1, r2] = await Promise.all([claude(args, judgePrompt(p, o, n), cwd), claude(args, judgePrompt(p, n, o), cwd)]);
        const j1 = r1.error ? null : parseJudge(r1.text);
        const j2 = r2.error ? null : parseJudge(r2.text);
        if (!j1 || !j2) {
          judgeFailed++;
          verdicts[p.id][rep - 1] = null;
          console.log(`JUDGE FAIL ${p.id}-${rep} ${r1.error ?? ""} ${r2.error ?? ""}`.trim());
          return;
        }
        [r1, r2].forEach((r) => noteModels("judge", r.usage ?? {}));
        const toArm1 = (w) => (w === "A" ? "old" : w === "B" ? "new" : "tie");
        const toArm2 = (w) => (w === "A" ? "new" : w === "B" ? "old" : "tie");
        const v = {};
        for (const c of CRITERIA) {
          const a = toArm1(j1[c]?.winner);
          const b = toArm2(j2[c]?.winner);
          v[c] = a === b ? a : "tie";
        }
        verdicts[p.id][rep - 1] = v;
        const add = (kind, arm, list) => (list ?? []).forEach((q) => evidence[kind][arm].push(`${p.id}${reps > 1 ? `-${rep}` : ""}: ${q}`));
        add("missing", "old", j1.missingA);
        add("missing", "new", j1.missingB);
        add("noise", "old", j1.noiseA);
        add("noise", "new", j1.noiseB);
        add("missing", "new", j2.missingA);
        add("missing", "old", j2.missingB);
        add("noise", "new", j2.noiseA);
        add("noise", "old", j2.noiseB);
        console.log(`judged ${p.id}-${rep}`);
      });
    }
  }
  await pool(jobs);
  for (const kind of ["missing", "noise"]) for (const arm of ["old", "new"]) evidence[kind][arm] = [...new Set(evidence[kind][arm])];
}

// ---------------------------------------------------------------------------- result

const sum = (arm, key) => Object.values(counts[arm]).flat().filter(Boolean).reduce((a, c) => a + c[key], 0);
const median = (arm) => {
  const v = Object.values(counts[arm]).flat().filter(Boolean).map((c) => c.words).sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0;
};
const missingCount = (arm) => Object.values(counts[arm]).flat().filter(Boolean).reduce((a, c) => a + c.missing.length, 0);
const lineOneScore = (arm) => {
  const v = Object.values(counts[arm]).flat().filter((c) => c && c.lineOne !== null);
  return `${v.filter((c) => c.lineOne).length}/${v.length}`;
};
const total = (arm) => Object.values(replies[arm]).flat().filter((t) => t != null).length;

const lines = [];
const say = (s = "") => lines.push(s);
say(`# no-fluff-fr eval: ${level}`);
say();
say(`${prompts.length} prompts x ${reps} run${reps > 1 ? "s" : ""} per version, ${total("old")} old and ${total("new")} new replies${failed ? `, ${failed} failed` : ""}. Old = \`${baseLabel}\`. New = working tree. Writer model: ${[...seen.writer].join(", ") || "unknown"}${seen.background.size ? ` (background: ${[...seen.background].join(", ")})` : ""}, effort ${effort}. Judge: ${useJudge ? `${[...seen.judge].join(", ") || "unknown"}, blind, both orders, a disagreement counts as a tie${judgeFailed ? `, ${judgeFailed} pair${judgeFailed > 1 ? "s" : ""} failed` : ""}` : "off"}. Cost: $${spent.toFixed(2)}. Replies: ${work}`);
if (seen.writer.size > 1) {
  say();
  say(`**WARNING:** the writer model varied across sessions (${[...seen.writer].join(", ")}). A comparison is valid only on one writer model. Pin it with --model.`);
}
say();
say("## Counts (a script counted these)");
say();
say("| Metric | Good is | Old | New |");
say("|---|---|---|---|");
say(`| Words per reply, median | lower, if no fact is missing | ${median("old")} | ${median("new")} |`);
say(`| Must-have facts missing (keyword check) | 0 | ${missingCount("old")} | ${missingCount("new")} |`);
say(`| Line one is one sentence (question ends with ?) | all | ${lineOneScore("old")} | ${lineOneScore("new")} |`);
say(`| Sentences over 25 words | lower | ${sum("old", "long")} | ${sum("new", "long")} |`);
say(`| Bullets without a bold label or code | 0 | ${sum("old", "unlabeled")} | ${sum("new", "unlabeled")} |`);
say(`| Headings over 3 words or with a letter in brackets | 0 | ${sum("old", "badHeadings")} | ${sum("new", "badHeadings")} |`);
say(`| Code letter not matching its heading | 0 | ${sum("old", "codeMismatch")} | ${sum("new", "codeMismatch")} |`);
say(`| Semicolons | 0 | ${sum("old", "semicolons")} | ${sum("new", "semicolons")} |`);
say(`| Offer phrases | 0 | ${sum("old", "offers")} | ${sum("new", "offers")} |`);
say(`| Jargon words copied from the prompt's notes | lower | ${sum("old", "jargon")} | ${sum("new", "jargon")} |`);
if (useJudge) {
  say();
  say("## Judge (blind pairs: which reply is better)");
  say();
  say("| Criterion | New better | Tie | Old better |");
  say("|---|---|---|---|");
  const all = Object.values(verdicts).flat().filter(Boolean);
  for (const c of CRITERIA) {
    say(`| ${c} | ${all.filter((v) => v[c] === "new").length} | ${all.filter((v) => v[c] === "tie").length} | ${all.filter((v) => v[c] === "old").length} |`);
  }
  for (const [kind, title] of [["missing", "Missing facts"], ["noise", "Noise lines"]]) {
    for (const arm of ["old", "new"]) {
      if (evidence[kind][arm].length) {
        say();
        say(`${title}, ${arm}:`);
        evidence[kind][arm].forEach((q) => say(`- ${q}`));
      }
    }
  }
}
say();
say("## Per prompt");
say();
say(`| Prompt | Words old/new | Missing old/new | Line one old/new |${useJudge ? " Judge: complete, noise, skimmable, readable, line one |" : ""}`);
say(`|---|---|---|---|${useJudge ? "---|" : ""}`);
const mark = (v) => (v === "new" ? "n" : v === "old" ? "o" : v === "tie" ? "-" : "?");
const yn = (c) => (c == null ? "?" : c.lineOne === null ? "n/a" : c.lineOne ? "yes" : "no");
for (const p of prompts) {
  for (let rep = 1; rep <= reps; rep++) {
    const o = counts.old[p.id][rep - 1];
    const n = counts.new[p.id][rep - 1];
    const cell = (c, f) => (c == null ? "failed" : f(c));
    const label = `${p.id}${reps > 1 ? `-${rep}` : ""}`;
    const miss = (c) => (c.hasMustHave ? String(c.missing.length) : "n/a");
    const v = useJudge ? verdicts[p.id]?.[rep - 1] : null;
    say(`| ${label} | ${cell(o, (c) => c.words)} / ${cell(n, (c) => c.words)} | ${cell(o, miss)} / ${cell(n, miss)} | ${yn(o)} / ${yn(n)} |${useJudge ? ` ${v ? CRITERIA.map((c) => mark(v[c])).join(" ") : "failed"} |` : ""}`);
  }
}
if (useJudge) {
  say();
  say("Judge column: n = new better, o = old better, - = tie, in the order complete, noise, skimmable, readable, line one.");
}
const missingByKeyword = ["old", "new"].flatMap((arm) => prompts.flatMap((p) => counts[arm][p.id].flatMap((c, i) => (c ? c.missing.map((f) => `${arm} ${p.id}${reps > 1 ? `-${i + 1}` : ""}: ${f}`) : []))));
if (missingByKeyword.length) {
  say();
  say("Must-have facts the keyword check did not find:");
  missingByKeyword.forEach((f) => say(`- ${f}`));
}
say();
say("One reply per prompt is one sample. A difference of one line either way is chance. Look for the same direction across prompts, and for the quoted lines.");

const result = lines.join("\n");
console.log();
console.log(result);
if (outFile) writeFileSync(outFile, result + "\n");
