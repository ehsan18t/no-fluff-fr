// One command: run the same prompts with no plugin, with the old rules and with the new
// rules, count what a script can count, let a blind judge compare the new rules against
// each of the other two, and print one result. While inject/ differs from the last
// release, old is that release and new is the working tree. While it does not, old is
// the release before it and new is the last release. Nothing is stored in the repo. See
// eval/README.md for what is measured and why.
//
//   node eval/run.mjs <tiny|small|medium|large|xl> [options]
//
//   --base <ref>         the old rules come from this commit, the new ones from the working tree
//   --no-baseline        skip the no-plugin arm (the bare model in the same isolation)
//   --model <id>         writer model (default: claude-opus-5)
//   --effort <level>     reasoning effort: low|medium|high|xhigh|max (default: high)
//   --judge-model <id>   judge model (default: same as --model)
//   --no-judge           counts only, no judge calls
//   --reps N             runs per prompt (default: the level's)
//   --only id,id         a subset of the level's prompts
//   --out file.md        also write the report (or the JSON, with --json) to a file
//   --json               print the result object instead of the report
//   --paths              put the real replies path into the files this writes, not just
//                        the terminal. Those paths carry your username, so leave it off
//                        for anything you commit or send on.
//   --label <text>       what to call the new arm (default: its version when it is a release,
//                        else the short HEAD hash). Use the version the rules will ship as.
//   --replies <dir>      score a previous run's replies again (the folder it printed), no generation
//
// Every run writes result.json beside the replies. `node eval/report.mjs <result.json>`
// re-renders any past run in the current format, for free.
//
// Env: CONCURRENCY (default 6).

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// This file measures. report.mjs decides how the measurement reads. Nothing in there
// can change a number, which is why the two are separate files.
import { render } from "./report.mjs";

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
  console.error(`usage: node eval/run.mjs <${Object.keys(LEVELS).join("|")}> [--base <ref>] [--no-baseline] [--model <id>] [--judge-model <id>] [--no-judge] [--reps N] [--only id,id] [--out file.md] [--json] [--paths] [--replies <dir>]`);
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
const asJson = has("--json");
// Off by default so nothing this run writes can leak the absolute temp path, which
// carries the username of whoever ran it. The terminal gets the real paths either way.
const showPaths = has("--paths");
const repliesDir = flag("--replies");
// The no-plugin arm is the bare model in the same isolation: what a reply looks like
// with no rules at all, which is what the other two arms are measured against. It runs
// by default, --no-baseline drops it for a cheap rules iteration, and a rescore of a
// folder without a none/ directory has no baseline either way.
let baseline = !has("--no-baseline");
if (repliesDir && !existsSync(join(repliesDir, "none"))) baseline = false;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

const prompts = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8")).filter((p) => p.tier <= LEVELS[level].tier && (!only || only.includes(p.id)));
if (prompts.length === 0) {
  console.error("no prompts match");
  process.exit(2);
}

// ---------------------------------------------------------------------------- versions

const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const lines = (s) => (s ? s.split("\n") : []);
// Releases, highest version first: the X.Y.Z tags, plus every release commit whose
// version has no tag. Releases from before tags existed are found by their commit
// subject alone. Sorted by version, not by where they came from, because a tagged and
// an untagged release can sit on either side of each other.
const VERSION = /^\d+\.\d+\.\d+$/;
const tagged = lines(git("tag", "-l", "[0-9]*")).filter((t) => VERSION.test(t)).map((t) => ({ version: t, ref: git("rev-list", "-1", t) }));
const logged = lines(git("log", "--format=%H %s", "--grep=^chore(plugin): release")).map((l) => ({ version: /^\S+ chore\(plugin\): release (\S+)$/.exec(l)?.[1], ref: l.split(" ")[0] }));
const byVersion = (a, b) => { const [x, y] = [a, b].map((r) => r.version.split(".").map(Number)); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; };
const releases = [...tagged, ...logged.filter((l) => VERSION.test(l.version ?? "") && !tagged.some((t) => t.version === l.version))].sort(byVersion);
const dirty = git("status", "--porcelain", "--", "inject", "hooks").length > 0;
// Which two sets of rules the run compares. With inject/ as the last release left it,
// the working tree has nothing new to measure, so the run compares that release with
// the one before it. Once a file under inject/ differs, committed or not, it compares
// the last release with the working tree. --base names the old commit by hand, and the
// new rules are then the working tree.
const changed = releases[0] ? git("diff", "--name-only", releases[0].ref, "--", "inject").length > 0 || git("status", "--porcelain", "--", "inject").length > 0 : true;
const twoReleases = !flag("--base") && !changed;
const oldRelease = twoReleases ? releases[1] : releases[0];
const baseRef = flag("--base") ?? oldRelease?.ref;
if (!baseRef) {
  console.error(twoReleases ? "inject/ equals the only release, so there is nothing to compare it with. Pass --base <ref>" : "no release found, pass --base <ref>");
  process.exit(2);
}
const baseLabel = git("log", "-1", "--format=%h %s", baseRef);
// The commit the new rules are checked out from, or null when they are the working tree.
const newRef = twoReleases ? releases[0].ref : null;
// What to call the new rules: the version when they are a release, else the short HEAD
// hash, because the next version has no number until it is released. Not read from
// plugin.json: that holds the last released version until the release commit bumps it,
// which would label both arms the same. --label names the version they will ship as.
const newLabel = flag("--label") ?? (twoReleases ? releases[0].version : `${git("rev-parse", "--short", "HEAD")}${dirty ? " uncommitted" : ""}`);
// What the result records about the two columns. version is set when the old commit is
// a release, so the report never has to read it back out of a commit subject. A regrade
// cannot know which rules wrote the replies it was handed, and the repo may have moved
// since, so it keeps what the run that wrote them recorded unless a flag says otherwise.
let prior = null;
if (repliesDir) try { prior = JSON.parse(readFileSync(join(repliesDir, "result.json"), "utf8")); } catch {}
const oldInfo = prior?.old && !flag("--base") ? prior.old : { ref: baseRef, label: baseLabel, version: releases.find((r) => r.ref === git("rev-parse", `${baseRef}^{commit}`))?.version ?? null };
const newInfo = prior?.new && !flag("--label") ? prior.new : { ref: newRef, label: newLabel };

const perArm = prompts.length * reps;
// Two judge sessions per reply, see ROUNDS below. No dollar estimate: prices change, a
// subscription has no dollar figure, and the run reports what it used in tokens when
// it is done.
const ROUNDS = 2;
const planned = { writer: repliesDir ? 0 : perArm * (baseline ? 3 : 2), judge: useJudge ? perArm * (baseline ? 3 : 2) * ROUNDS : 0 };
console.log(`no-fluff-fr eval, level ${level}: ${prompts.length} prompts x ${reps} ${reps > 1 ? "replies" : "reply"} for each of`);
if (baseline) console.log("none = no plugin");
console.log(`old = ${oldInfo.label}`);
console.log(`new = ${prior?.new === newInfo ?`${newInfo.label}, as the run that wrote these replies recorded it` : newRef ? `${git("log", "-1", "--format=%h %s", newRef)} (inject/ is unchanged since it)` : `${newLabel}, from the working tree${dirty ? "" : " (no uncommitted change in inject/ or hooks/)"}`}`);
console.log(`judge: ${useJudge ? `on, each reply graded alone, ${ROUNDS} times` : "off"}. Sessions: ${planned.writer} writer, ${planned.judge} judge`);
console.log(`writer model: ${model}${useJudge && judgeModel !== model ? `, judge model: ${judgeModel}` : ""}, effort: ${effort}`);
console.log(`prompts: ${prompts.map((p) => p.id).join(", ")}`);

// ---------------------------------------------------------------------------- generation

const bin = process.platform === "win32" ? "claude.exe" : "claude";
const work = repliesDir ?? mkdtempSync(join(tmpdir(), "no-fluff-fr-eval-"));
const cwd = join(work, "cwd");
mkdirSync(cwd, { recursive: true });
const seen = { writer: new Set(), judge: new Set(), background: new Set() };
// Tokens per role, summed over every model a session billed, the background call
// included. Output is kept apart from input: output carries the thinking, and input is
// mostly cache reads of the system prompt, which cost a fraction of a fresh token.
const usage = { writer: { sessions: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }, judge: { sessions: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0 } };
// The writer is the model that produced the reply text (the most output tokens). Every other
// model a session bills (a fixed Haiku background call) is background, not the writer.
const writerOf = (u) => Object.entries(u).sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0]?.[0] ?? "unknown";
const noteModels = (kind, u) => {
  const w = writerOf(u);
  seen[kind].add(w);
  for (const k of Object.keys(u)) if (k !== w) seen.background.add(k);
  const t = usage[kind];
  t.sessions++;
  for (const m of Object.values(u)) {
    t.input += m.inputTokens ?? 0;
    t.output += m.outputTokens ?? 0;
    t.cacheRead += m.cacheReadInputTokens ?? 0;
    t.cacheCreate += m.cacheCreationInputTokens ?? 0;
  }
  return w;
};

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

const ARMS = baseline ? ["none", "old", "new"] : ["old", "new"];
// The plugin directory each arm loads. null is no plugin at all.
const arms = { none: null, old: null, new: newRef ? null : repo };
const replies = {}; // replies[arm][id][rep] = text or null when failed
let failed = 0;

if (!repliesDir) {
  // A column that is a commit loads its plugin from a temporary worktree of that commit.
  const trees = [[join(work, "old-plugin"), baseRef], ...(newRef ? [[join(work, "new-plugin"), newRef]] : [])];
  try {
    for (const [dir, ref] of trees) git("worktree", "add", "--detach", dir, ref);
    arms.old = trees[0][0];
    if (newRef) arms.new = trees[1][0];
    const jobs = [];
    for (const arm of ARMS) {
      mkdirSync(join(work, arm), { recursive: true });
      replies[arm] = {};
      for (const p of prompts) {
        replies[arm][p.id] = [];
        for (let rep = 1; rep <= reps; rep++) {
          jobs.push(async () => {
            const args = ["-p", "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence"];
            if (arms[arm]) args.push("--plugin-dir", arms[arm]);
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
    for (const [dir] of trees) if (existsSync(dir)) git("worktree", "remove", "--force", dir);
  }
} else {
  for (const arm of ARMS) {
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
// An undo hint on an extra ("revert if you want a hard break") is an offer too: the
// reader knows they can revert, so the line only offers. Every phrase here occurs in a
// saved reply; a phrase no reply has ever used is not counted.
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
  // The mirror of mustHave: lines from the prompt's own facts that the rules say must go.
  const kept = (p.noise ?? []).filter((n) => n.keys.some((k) => keyRe(k).test(text))).map((n) => n.line);
  // A heading whose section is exactly one top-level bullet and nothing else. Indented
  // lines belong to the bullet above them, and a closing Next line belongs to no section.
  let singleHeadings = 0;
  let section = null;
  const closeSection = () => { if (section && section.bullets === 1 && section.other === 0) singleHeadings++; };
  for (const l of lines) {
    if (HEADING.test(l)) {
      closeSection();
      section = { bullets: 0, other: 0 };
    } else if (section && l.trim() && !/^\s/.test(l) && !/^\**next\b/i.test(l)) {
      if (BULLET.test(l)) section.bullets++;
      else section.other++;
    }
  }
  closeSection();
  return {
    words: words(body).length,
    long: ss.filter((s) => words(s).length > 25).length,
    semicolons: (body.match(/;/g) ?? []).length,
    unlabeled: lines.filter((l) => BULLET.test(l) && !LABELED.test(l)).length,
    badHeadings,
    codeMismatch,
    jargon: (p.jargon ?? []).filter((j) => body.toLowerCase().includes(j.toLowerCase())).length,
    lineOne,
    missing,
    hasMustHave: Boolean(p.mustHave),
    kept,
    keptCount: kept.length,
    hasNoise: Boolean(p.noise),
    singleHeadings,
  };
}

const counts = Object.fromEntries(ARMS.map((arm) => [arm, {}]));
for (const arm of ARMS) for (const p of prompts) counts[arm][p.id] = replies[arm][p.id].map((t) => (t == null ? null : count(p, t)));

// ---------------------------------------------------------------------------- judge

const CRITERIA = ["complete", "noise", "skimmable", "readable", "lineOne", "extras", "offers"];
// Noise, offers and the wording of an extra are too varied for a phrase list, so the judge
// finds them and the script only counts the lines it quoted. The three never overlap:
// every offer goes to offers, any other fault of an extra to extras, the rest to noise.
//
// The ways an extra (a change made without being asked) is written wrongly, offers
// apart. A new way is one more line here: the report's format does not change.
const EXTRA_FAILS = [
  'says again that it was not asked for, when its label or heading already says so ("**Extra:** ... Not asked for.")',
];
// Hints for the judge, not a list to match: an offer in any other words is still an offer.
const OFFER_HINTS = [
  'an offer of more work, usually at the end ("Want me to fix it there too?", "Let me know if you\'d like the tests split")',
  'an offer or a hint, inside an item, that something can be undone, reverted, removed, split or dropped ("Revert if you want a hard break", "I can split it into its own commit", "Say the word and I drop the line", "it\'s a one-line removal")',
];
// The questions whose quoted lines are counted into the Counts table, one row each.
const FOUND = [
  ["noise", "Noise lines the judges found"],
  ["offers", "Offers the judges found"],
  ["extras", "Badly written extras the judges found"],
];


// One reply at a time. Comparing two replies gave one number per pairing, which read as
// a score of the reply and was not one. A pass or fail per reply gives every arm the same
// unit, passes out of its replies, and leaves nothing to tie.
function judgePrompt(p, text) {
  const facts = p.mustHave ? `Facts the reply must state:\n${p.mustHave.map((m) => `- ${m.fact}`).join("\n")}` : "There is no fixed list of required facts. Judge completeness on what a developer needs in order to act.";
  return `You are grading one reply written by an AI coding assistant to a developer who reads for under a minute and may stop at any line. You did not write it. Answer with JSON only.

The developer's request, and the facts the assistant had:
<<<
${p.prompt}
>>>

${facts}

The reply:
<<<
${text}
>>>

Grade seven things, each pass or fail:
1. complete: every fact the developer needs in order to act is stated. A missing fact counts against the reply.
2. noise: no line the developer would not act on or decide from. Noise: the story of how the work was done or checked, a restated request, a confirmation that something matches the request or was left unchanged, content they can open in the file, the assistant's own notes, a command or step the developer said they would run, internals the developer does not need in order to act, a fact with no consequence for them, a fact the reply already stated, a closing next action that repeats a line above, praise, a suggestion they did not ask for. An offer belongs to offers below and how an extra is worded belongs to extras below: neither is ever noise. Not noise: a check result with its numbers ("48 pass, 3 new"), anything not run or not verified, a risk, an assumption, an irreversible step, a change the assistant made that was not asked for, the one-sentence reason for a decision, the downside of a workaround or alternative the reply suggests, a heading, a bold label, a code such as R1.
3. skimmable: the most important line first, one item per line, a bold label or code on each bullet, sections only when needed.
4. readable: every sentence read once, developer terms, exact names of files and values, no filler.
5. lineOne: the first line does its job: what changed for a task, the question itself for a question, the cause for an explanation.
6. extras: an extra is a change the assistant made that the developer did not ask for. Each extra names what changed and stops. An extra fails when it:
${EXTRA_FAILS.map((f) => `   - ${f}`).join("\n")}
   A reply with no extras passes. A reason for the extra, its risk, or what it costs to remove is not a fail. An offer on an extra belongs to offers below, not here.
7. offers: the reply makes no offer, anywhere. An offer is:
${OFFER_HINTS.map((f) => `   - ${f}`).join("\n")}
   These are examples, not a list: an offer in any other words is an offer. Not an offer: the question itself when the developer's request was to ask one, the options of that question, one next action the developer has to take.

A fail needs evidence. For complete, list the missing facts, each in at most 12 words. For the other six, quote each line that breaks the criterion by its first 12 words exactly as written, every such line, because the quotes are counted. When the fault is an offer or a repeat inside a longer line, quote from the first word of that sentence instead. Quote a line under only one of noise, extras and offers. A criterion with nothing to list passes. Give one sentence of reason for each fail.

Return exactly this JSON and nothing else:
{${CRITERIA.map((c) => `"${c}":{"pass":true,"why":"","quotes":[]}`).join(",")}}`;
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

// A fail without a quoted line is an opinion, and the judge does not always obey the
// rule it was given, so the rule is applied here as well: a fail with nothing quoted
// becomes a pass, with the judge's words kept behind it so result.json still shows
// it. A criterion the judge left out of its JSON is no answer and stays null.
function bind(j) {
  if (!j) return null;
  const out = {};
  for (const c of CRITERIA) {
    const g = j[c];
    if (!g || typeof g !== "object") {
      out[c] = null;
      continue;
    }
    const quotes = (Array.isArray(g.quotes) ? g.quotes : []).map(String).filter((q) => q.trim());
    let pass = !(g.pass === false || g.pass === "false");
    let why = String(g.why ?? "");
    if (!pass && quotes.length === 0) {
      pass = true;
      why = `pass for lack of evidence. Judge said: ${why}`;
    }
    out[c] = { pass, why, quotes };
  }
  return out;
}

// Every reply is graded ROUNDS times, in separate sessions with the same prompt, so the
// report can say how often the judge agrees with itself. grades[arm][id][rep] is one
// entry per round, each { criterion: { pass, why, quotes } | null }, or null when that
// session failed. judgments keeps every grade flat for result.json.
const grades = Object.fromEntries(ARMS.map((arm) => [arm, {}]));
for (const arm of ARMS) for (const p of prompts) grades[arm][p.id] = replies[arm][p.id].map(() => Array(ROUNDS).fill(null));
const judgments = [];
let judgeFailed = 0;

if (useJudge) {
  const jobs = [];
  for (const arm of ARMS) {
    for (const p of prompts) {
      for (let rep = 1; rep <= reps; rep++) {
        const text = replies[arm][p.id][rep - 1];
        if (text == null) continue;
        for (let round = 1; round <= ROUNDS; round++) {
          jobs.push(async () => {
            const args = ["-p", "--tools", "", "--setting-sources", "", "--output-format", "json", "--no-session-persistence"];
            if (judgeModel) args.push("--model", judgeModel);
            if (effort) args.push("--effort", effort);
            const r = await claude(args, judgePrompt(p, text), cwd);
            // A session that answered was billed, whether or not its answer parsed.
            if (!r.error) noteModels("judge", r.usage ?? {});
            const g = r.error ? null : bind(parseJudge(r.text));
            if (!g) {
              judgeFailed++;
              console.log(`JUDGE FAIL ${arm} ${p.id}-${rep} round ${round} ${r.error ?? "unparseable answer"}`);
              return;
            }
            grades[arm][p.id][rep - 1][round - 1] = g;
            for (const c of CRITERIA) if (g[c]) judgments.push({ arm, id: p.id, rep, round, criterion: c, pass: g[c].pass, why: g[c].why, quotes: g[c].quotes });
            console.log(`graded ${arm} ${p.id}-${rep} round ${round}`);
          });
        }
      }
    }
  }
  await pool(jobs);
}

// ---------------------------------------------------------------------------- result

const label = (id, rep) => `${id}${reps > 1 ? `-${rep}` : ""}`;
const sum = (arm, key) => Object.values(counts[arm]).flat().filter(Boolean).reduce((a, c) => a + c[key], 0);
const median = (arm) => {
  const v = Object.values(counts[arm]).flat().filter(Boolean).map((c) => c.words).sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0;
};
const missingCount = (arm) => Object.values(counts[arm]).flat().filter(Boolean).reduce((a, c) => a + c.missing.length, 0);
const total = (arm) => Object.values(replies[arm]).flat().filter((t) => t != null).length;
const pctOf = (from, to) => (from ? Math.round(((to - from) / from) * 100) : 0);
// One object holds every number this run measured. It is the only thing the report
// is built from, it is written to result.json beside the replies, and eval/report.mjs
// turns it into markdown without recomputing any of it.

// Passes per criterion per arm, out of the replies the judge graded in that arm. A reply
// is graded when every round answered; one whose session failed is left out of its arm's
// denominator, and the report prints that denominator beside the number when it differs
// from the row's. A check passes when every round passes it, so a round that fails is
// a fail and a disagreement between rounds is a fail with its quote. `agreed` counts the
// replies whose rounds gave the same answer, which is the judge's agreement with itself.
const graded = (arm) => Object.values(grades[arm]).flat().filter((rounds) => rounds.every(Boolean));
const answeredBy = (rounds, c) => rounds.every((g) => g[c]);
const answered = (arm, c) => graded(arm).filter((rounds) => answeredBy(rounds, c)).length;
const passes = (arm, c) => graded(arm).filter((rounds) => answeredBy(rounds, c) && rounds.every((g) => g[c].pass)).length;
const agreed = (arm, c) => graded(arm).filter((rounds) => answeredBy(rounds, c) && rounds.every((g) => g[c].pass === rounds[0][c].pass)).length;
const judgeRows = CRITERIA.map((c) => ({
  key: c,
  of: Math.max(0, ...ARMS.map((arm) => answered(arm, c))),
  passes: Object.fromEntries(ARMS.map((arm) => [arm, passes(arm, c)])),
  agreed: Object.fromEntries(ARMS.map((arm) => [arm, agreed(arm, c)])),
  graded: Object.fromEntries(ARMS.map((arm) => [arm, answered(arm, c)])),
}));
// Sorted by the new rules' lead over the old, biggest first.
judgeRows.sort((x, y) => y.passes.new - y.passes.old - (x.passes.new - x.passes.old));
// Checks are criteria times graded replies: what the headline counts per arm.
const checks = (arm) => ({ pass: CRITERIA.reduce((a, c) => a + passes(arm, c), 0), of: CRITERIA.reduce((a, c) => a + answered(arm, c), 0), agreed: CRITERIA.reduce((a, c) => a + agreed(arm, c), 0) });
const wordPct = pctOf(median("old"), median("new"));

// A fact the new arm dropped and the old arm stated is a regression, not a win.
// The key is `<prompt id>::<fact>`; a fact may contain "::", a prompt id never does.
const keyOf = (id, rep, fact) => `${label(id, rep)}::${fact}`;
const splitFact = (s) => ({ id: s.slice(0, s.indexOf("::")), fact: s.slice(s.indexOf("::") + 2) });
const missedIn = (arm) => new Set(prompts.flatMap((p) => counts[arm][p.id].flatMap((c, i) => (c ? c.missing.map((f) => keyOf(p.id, i + 1, f)) : []))));
// Prompts whose session failed in that arm, so their facts are neither kept nor missed.
const noReplyIn = (arm) => new Set(prompts.flatMap((p) => counts[arm][p.id].map((c, i) => (c ? null : label(p.id, i + 1))).filter(Boolean)));
const missed = Object.fromEntries(ARMS.map((arm) => [arm, missedIn(arm)]));
const noReply = Object.fromEntries(ARMS.map((arm) => [arm, noReplyIn(arm)]));
const factsLost = [...missed.new].filter((f) => !missed.old.has(f));
// The same for noise lines, keyed the same way: a line the new arm keeps and the old
// arm cuts is a regression.
const keptIn = (arm) => new Set(prompts.flatMap((p) => counts[arm][p.id].flatMap((c, i) => (c ? c.kept.map((f) => keyOf(p.id, i + 1, f)) : []))));
const keptBy = Object.fromEntries(ARMS.map((arm) => [arm, keptIn(arm)]));
const noiseGained = [...keptBy.new].filter((f) => !keptBy.old.has(f));

const lineOneOf = (arm) => {
  const v = Object.values(counts[arm]).flat().filter((c) => c && c.lineOne !== null);
  return { hit: v.filter((c) => c.lineOne).length, of: v.length };
};

// Lower is better for every row here. `shown` is false where every arm already sits at
// the target, so the report can collapse them into one line instead of six empty rows.
const countRows = [
  ["Bullets with no bold label or code", "0", "unlabeled"],
  ["Must-have facts missed", "0", "missing"],
  ["Noise lines kept", "0", "keptCount"],
  ["Headings over one item", "0", "singleHeadings"],
  ["Sentences over 25 words", "0", "long"],
  ["Semicolons", "0", "semicolons"],
  ["Headings over 3 words or with a bracketed letter", "0", "badHeadings"],
  ["Code letters not matching their heading", "0", "codeMismatch"],
  ["Jargon copied from the prompt's notes", "lower", "jargon"],
  ["Words per reply, median", "lower", "words"],
].map(([what, target, key]) => {
  const of = (arm) => (key === "missing" ? missingCount(arm) : key === "words" ? median(arm) : sum(arm, key));
  const r = { what, target, old: of("old"), new: of("new"), pct: key === "words" };
  if (baseline) r.none = of("none");
  r.shown = ARMS.some((arm) => of(arm) !== 0);
  return r;
});
// What the judges found, counted: the lines quoted under a question, once per reply even
// when both judges quote it. The judge decides what an offer is, the script only counts.
const foundIn = (arm, c) => {
  const seen = new Set();
  for (const j of judgments) if (j.arm === arm && j.criterion === c && !j.pass) for (const q of j.quotes) seen.add(`${j.id}|${j.rep}|${q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40)}`);
  return seen.size;
};
if (useJudge) {
  for (const [c, what] of FOUND) {
    const r = { what, target: "0", old: foundIn("old", c), new: foundIn("new", c), pct: false };
    if (baseline) r.none = foundIn("none", c);
    r.shown = ARMS.some((arm) => foundIn(arm, c) !== 0);
    countRows.push(r);
  }
}
const worseCounts = countRows.filter((r) => r.new > r.old);
// A count where the new rules do worse than no rules at all is a rule that backfires.
// Only over the same number of replies: a failed session in one arm would otherwise
// turn a sum, or a median of nothing, into a regression.
const worseThanNone = baseline && total("none") === total("new") ? countRows.filter((r) => r.new > r.none) : [];

const yn = (c) => (c == null ? "?" : c.lineOne === null ? "n/a" : c.lineOne ? "yes" : "no");
const miss = (c) => (c == null ? null : c.hasMustHave ? String(c.missing.length) : "n/a");
const keep = (c) => (c == null ? null : c.hasNoise ? String(c.kept.length) : "n/a");
// Criteria one reply passed in every round, or null when it was not graded.
const passedIn = (arm, p, rep) => {
  const rounds = grades[arm][p.id]?.[rep - 1] ?? null;
  return rounds && rounds.every(Boolean) ? CRITERIA.filter((c) => answeredBy(rounds, c) && rounds.every((g) => g[c].pass)).length : null;
};
const promptRows = [];
for (const p of prompts) {
  for (let rep = 1; rep <= reps; rep++) {
    const o = counts.old[p.id][rep - 1];
    const n = counts.new[p.id][rep - 1];
    const b = baseline ? counts.none[p.id][rep - 1] : null;
    // null, not 0, when a reply failed: there is no change to report, and 0% would
    // read as "unchanged" next to a cell that says failed.
    const pct = o && n && o.words ? pctOf(o.words, n.words) : null;
    const j = useJudge ? Object.fromEntries(ARMS.map((arm) => [arm, passedIn(arm, p, rep)])) : null;
    promptRows.push({
      id: label(p.id, rep),
      words: { ...(baseline ? { none: b?.words ?? null } : {}), old: o?.words ?? null, new: n?.words ?? null, pct },
      missed: { ...(baseline ? { none: miss(b) } : {}), old: miss(o), new: miss(n) },
      kept: { ...(baseline ? { none: keep(b) } : {}), old: keep(o), new: keep(n) },
      lineOne: { old: yn(o), new: yn(n) },
      // Criteria passed of CRITERIA.length, per arm.
      judge: j,
      sort: useJudge ? (j.new ?? 0) - (j.old ?? 0) : -(pct ?? 0),
    });
  }
}
promptRows.sort((a, b) => b.sort - a.sort);

// Regressions are structured here and worded in report.mjs. A test the new rules fail on
// a prompt where the other column passes carries the judge's quotes and reasons, so the
// regression can be read; `split` marks a fail in one grading of two, still a fail.
const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ").trim();
const failsThat = (rival) => {
  const out = [];
  for (const p of prompts) {
    for (let rep = 1; rep <= reps; rep++) {
      const n = grades.new[p.id]?.[rep - 1];
      const o = grades[rival][p.id]?.[rep - 1];
      if (!n?.every(Boolean) || !o?.every(Boolean)) continue;
      for (const c of CRITERIA) {
        if (!answeredBy(n, c) || !answeredBy(o, c)) continue;
        if (n.every((g) => g[c].pass) || !o.every((g) => g[c].pass)) continue;
        const failing = n.filter((g) => !g[c].pass);
        // Two gradings often quote the same line and give the same reason; each is kept once.
        out.push({ kind: "test", prompt: label(p.id, rep), criterion: c, quotes: [...new Set(failing.flatMap((g) => g[c].quotes).map(oneLine))].slice(0, 2), reasons: [...new Set(failing.map((g) => oneLine(g[c].why)))], split: failing.length < n.length });
      }
    }
  }
  return out;
};
// A must-have the keyword count found missing and a Complete fail the judge quoted on
// the same prompt are one fact seen twice: the judge's entry folds into the count's,
// its reason kept.
const sameFact = (a, b) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
};
const foldFacts = (tests, facts) =>
  tests.filter((t) => {
    if (t.criterion !== "complete") return true;
    const f = facts.find((f) => f.prompt === t.prompt && t.quotes.some((q) => sameFact(q, f.fact)));
    if (!f) return true;
    f.reasons = [...new Set([...f.reasons, ...t.reasons])];
    return false;
  });
const factRegressions = factsLost.map((f) => ({ kind: "fact", prompt: splitFact(f).id, fact: splitFact(f).fact, reasons: [] }));
const countRegression = (r, rival) => ({ kind: "count", what: r.what, target: r.target, from: r[rival], to: r.new });
const noiseRegressions = noiseGained.map((f) => ({ kind: "noise", prompt: splitFact(f).id, line: splitFact(f).fact, reasons: [] }));
const regressions = {
  old: [...worseCounts.map((r) => countRegression(r, "old")), ...factRegressions, ...noiseRegressions, ...(useJudge ? foldFacts(failsThat("old"), factRegressions) : [])],
  none: baseline ? [...worseThanNone.map((r) => countRegression(r, "none")), ...(useJudge ? failsThat("none") : [])] : null,
};

const stateOf = (arm, f, id) => (missed[arm].has(f) ? "missed" : noReply[arm].has(id) ? "failed" : "kept");
// Rows come from the two rule arms only: this table is where the next rule change comes
// from, and a fact only the bare model missed says nothing about the rules. The no-plugin
// column then shows whether the rules fixed a miss or kept one.
const evidenceFacts = [...new Set([...missed.old, ...missed.new])].map((f) => {
  const { id, fact } = splitFact(f);
  return { id, fact, ...(baseline ? { none: stateOf("none", f, id) } : {}), old: stateOf("old", f, id), new: stateOf("new", f, id) };
});
// Noise lines a rule arm kept, and which arms kept each.
const keptState = (arm, f, id) => (keptBy[arm].has(f) ? "kept" : noReply[arm].has(id) ? "failed" : "cut");
const evidenceNoise = [...new Set([...keptBy.old, ...keptBy.new])].map((f) => {
  const { id, fact: line } = splitFact(f);
  return { id, line, ...(baseline ? { none: keptState("none", f, id) } : {}), old: keptState("old", f, id), new: keptState("new", f, id) };
});
// The lines fails were quoted on, for the two rule arms. The bare model's fails are
// numbers in the judge table; its lines would fill the section and say nothing about
// the rules.
// Two rounds often quote the same line for the same check, so a quote is kept once per
// reply, check and opening words.
const failQuotes = (arm) => {
  const seen = new Set();
  return judgments
    .filter((j) => j.arm === arm && !j.pass)
    .flatMap((j) => j.quotes.map((q) => ({ id: label(j.id, j.rep), criterion: j.criterion, line: q })))
    .filter((q) => {
      const key = `${q.id}|${q.criterion}|${q.line.toLowerCase().replace(/\s+/g, " ").slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const rerunFlags = `${level}${judgeModel !== model ? ` --judge-model ${judgeModel}` : ""}${has("--no-baseline") ? " --no-baseline" : ""}`;
const result = {
  level,
  reps,
  // eval/RESULT.md is committed, so it has to say how old it is. Local date, not UTC:
  // a run after 5pm here would otherwise be stamped with tomorrow's or yesterday's date.
  ranAt: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })(),
  old: oldInfo,
  // ref is the release commit the new rules came from, null when they are the working tree.
  new: newInfo,
  // The no-plugin arm, or null when the run had none. Every field below that belongs
  // to it (none columns, judgeNone, headline.none) is absent or null in the same case.
  none: baseline ? { label: "no plugin" } : null,
  models: { writer: [...seen.writer], judge: [...seen.judge], background: [...seen.background], effort },
  // What the run used, in tokens per role, never dollars.
  usage,
  // The folder name, never its path. RESULT.md is committed and a result object gets
  // shared, and an absolute temp path carries the username of whoever ran it.
  replies: basename(work),
  failed,
  judgeFailed,
  sample: { prompts: prompts.length, replies: ARMS.reduce((a, arm) => a + total(arm), 0), judgments: ARMS.reduce((a, arm) => a + checks(arm).of, 0) },
  headline: {
    // Tests passed per column (criteria times graded replies). null when --no-judge.
    checks: useJudge ? Object.fromEntries(ARMS.map((arm) => [arm, checks(arm)])) : null,
    // Tests where the rounds gave different answers, over every column.
    disagreed: useJudge ? { count: ARMS.reduce((a, arm) => a + checks(arm).of - checks(arm).agreed, 0), of: ARMS.reduce((a, arm) => a + checks(arm).of, 0) } : null,
    words: Object.fromEntries(ARMS.map((arm) => [arm, median(arm)])),
    wordPct,
  },
  // One row per criterion: passes per arm out of the replies graded. null when
  // --no-judge, which is what the report reads to drop every judge-fed section.
  judge: useJudge ? judgeRows : null,
  judgeRounds: useJudge ? ROUNDS : null,
  counts: countRows.filter((r) => r.shown).sort((a, b) => b.old - b.new - (a.old - a.new)).concat(countRows.filter((r) => !r.shown)),
  lineOne: { ...(baseline ? { none: lineOneOf("none") } : {}), old: lineOneOf("old"), new: lineOneOf("new") },
  prompts: promptRows.map(({ sort, ...p }) => p),
  regressions,
  evidence: { facts: evidenceFacts, noise: evidenceNoise, fails: { old: failQuotes("old"), new: failQuotes("new") } },
  // Every grade with the judge's reason and quotes, flat, every arm.
  judgments: useJudge ? judgments : null,
  commands: {
    rerun: `node eval/run.mjs ${rerunFlags}`,
    rescore: `node eval/run.mjs ${level} --replies <the replies folder>`,
    rerender: `node eval/report.mjs <the replies folder>/result.json`,
  },
};

// A --no-judge rescore is free and a judged run is not, so an unjudged result never
// overwrites a judged one for the same replies. It lands beside it instead.
const resultPath = join(work, "result.json");
let target = resultPath;
if (!result.judge && existsSync(resultPath)) {
  try {
    if (JSON.parse(readFileSync(resultPath, "utf8")).judge) target = join(work, "result-counts.json");
  } catch {}
}
writeFileSync(target, JSON.stringify(result, null, 2) + "\n");
if (target !== resultPath) console.log(`kept the judged result.json, wrote this one to ${target}`);

// eval/RESULT.md is the committed record of the latest run, so only a whole judged
// level with every arm may replace it. A subset, an unjudged rescore, a run without the
// no-plugin arm or a run with a failed session would otherwise overwrite the headline
// numbers with something narrower, and nothing in the file would say so.
const resultMd = join(repo, "eval", "RESULT.md");
const partial = [!useJudge && "--no-judge", only && "--only", !baseline && (has("--no-baseline") ? "--no-baseline" : "no no-plugin arm in the replies"), failed && `${failed} failed ${failed === 1 ? "session" : "sessions"}`, judgeFailed && `${judgeFailed} failed judge ${judgeFailed === 1 ? "session" : "sessions"}`].filter(Boolean);
const forFile = showPaths ? { dir: work } : {};
if (partial.length) console.log(`left ${resultMd} alone: this run was partial (${partial.join(", ")})`);
else {
  writeFileSync(resultMd, render(result, forFile) + "\n");
  if (showPaths) console.log(`WARNING: --paths put your absolute temp path into ${resultMd}. That file is committed. Re-run without --paths before you commit it.`);
}

// The terminal is yours and it is gone when you close it, so it always gets the real
// paths. A file might be committed or sent on, so it only gets them on --paths.
console.log();
console.log(asJson ? JSON.stringify(result, null, 2) : render(result, { dir: work }));
console.log();
console.log(`replies and result.json: ${work}`);
if (outFile) writeFileSync(outFile, (asJson ? JSON.stringify(result, null, 2) : render(result, forFile)) + "\n");
