// Turns one eval result object into the benchmark report, and nothing else. It reads
// no files, spawns nothing and measures nothing: same object in, same markdown out.
// That is the point. Every number is produced by run.mjs and is never recomputed here,
// so a change to the wording of the report can never move a result.
//
// The report is read by people who did not run it, so it uses their words: a test is
// one reply graded on one question, a column is one of no plugin, the old rules and
// the new rules, and every line carries one fact. Everything a person would want to
// reword lives in the wording block below and in the wording helpers of render. The
// rest is assembly, and it only walks the object run.mjs hands it (see its `result`
// builder for the shape).
//
//   import { render } from "./report.mjs";  ->  render(result) returns markdown
//   node eval/report.mjs <result.json>      ->  re-renders a saved run, free

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------- wording

// The question each criterion was judged on, printed under its name so a row reads
// without a legend. Changing these changes the report only: run.mjs asks the judge
// its own question, which lives there.
export const CRITERION_TEXT = {
  complete: ["Complete", "Is every fact needed to act on it there?"],
  noise: ["Noise", "Is every line worth reading?"],
  skimmable: ["Skimmable", "Can you find the point without reading it all?"],
  readable: ["Readable", "Does each sentence read once?"],
  lineOne: ["Line one", "Does the first line answer?"],
  extras: ["Extras", "Does each extra name the change and stop?"],
  offers: ["Offers", "Is the reply free of offers?"],
};

export const TITLE = "no-fluff-fr benchmark";

export const SECTIONS = {
  summary: "Summary",
  judge: "Judge",
  counts: "Counts",
  prompts: "Per prompt",
  regressions: "Regressions",
  evidence: "Evidence",
  caveats: "Caveats",
};

// Quoted lines printed per column. The rest stay in the result object for anyone who wants them.
export const EVIDENCE_CAP = 5;

// ---------------------------------------------------------------------------- cells

const NEWLINES = new RegExp("[\\r\\n]+", "g");

// A pipe inside a model-written quote would split the row into extra columns, so it
// becomes the entity that renders as a pipe.
const cell = (s) => String(s).replace(NEWLINES, " ").split("|").join("&#124;").trim();
// Outside a table a pipe is harmless, but a newline would end the bullet.
const flat = (s) => String(s).replace(NEWLINES, " ").trim();
const code = (s) => "`" + s + "`";
const plural = (n, one, many) => (n === 1 ? one : many);
// 41k, 1.2M: a token count a reader can hold, not a number they have to parse.
const tokens = (n) => (n >= 999500 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const criterion = (key) => (CRITERION_TEXT[key] ?? [key])[0];

// ---------------------------------------------------------------------------- render

// The result object always carries the folder name and a `<the replies folder>`
// placeholder, never a path, so anything rendered from it is safe to publish by
// default. Pass { dir } to put the real absolute path back in, which run.mjs does for
// the terminal always and for a file only on --paths.
const PLACEHOLDER = "<the replies folder>";

export function render(r, { dir } = {}) {
  const withDir = (cmd) => (dir ? cmd.split(PLACEHOLDER).join(dir) : cmd);
  const out = [];
  const say = (s = "") => out.push(s);
  let n = 0;
  const section = (title) => { say(); say(`## ${++n}. ${title}`); say(); };
  // The no-plugin column is optional (--no-baseline, or a rescore of a run without it),
  // so every column and line that belongs to it appears only when the result carries it.
  const none = Boolean(r.none);
  const cols = none ? ["none", "old", "new"] : ["old", "new"];
  // Column names come from the run: "rules 0.2.1" when the old label names a release,
  // "rules 0.3.0" or "rules 4f7ac11" from the new label (a version, or the HEAD hash of
  // rules not released yet), "old rules" and "new rules" otherwise.
  // A result from before run.mjs recorded old.version names its release in the label only.
  const oldVersion = r.old.version ?? /^\S+ chore\(plugin\): release (\S+)$/.exec(String(r.old.label ?? ""))?.[1];
  const newVersion = r.new.label && r.new.label !== "working tree" ? r.new.label : null;
  const name = { none: "no plugin", old: oldVersion ? `rules ${oldVersion}` : "old rules", new: newVersion ? `rules ${newVersion}` : "new rules" };
  const Name = (k) => name[k][0].toUpperCase() + name[k].slice(1);
  // Where a column's rules came from, said only when its name does not: a release is
  // named by its version, so a hash is printed only for an old commit that is no release.
  const source = { old: oldVersion ? "" : ` (commit ${String(r.old.label).split(" ")[0]})`, new: r.new.ref ? "" : " (working tree)" };
  // A result judged in pairs, before 2026-09-19, has no grades: its judge sections are
  // left out and one line says so.
  const pairwise = r.headline?.newWins !== undefined;
  const judged = Boolean(r.judge) && !pairwise;
  const rounds = r.judgeRounds ?? 1;
  const h = r.headline;
  const reg = r.regressions;

  say(`# ${TITLE}`);
  say();
  if (r.ranAt) say(`- **Date:** ${r.ranAt}`);
  say(`- **Compared:** ${none ? "no plugin, " : ""}${name.old}${source.old}, ${name.new}${source.new}`);
  say(`- **Prompts:** ${r.sample.prompts}, ${r.reps === 1 ? "one reply" : `${r.reps} replies`} each, ${r.sample.replies} replies${r.failed ? `, ${r.failed} failed` : ""}`);
  say(`- **Writer:** ${r.models.writer.join(", ") || "unknown"} at effort ${r.models.effort}, for every reply${r.models.writer.length > 1 ? ". VARIED across sessions, so this comparison is not valid; pin it with --model" : ""}`);
  say(`- **Judge:** ${r.judge ? `${r.models.judge.join(", ") || "unknown"}, ${pairwise ? "compared replies in pairs" : `${rounds} ${plural(rounds, "judge", "judges")} per test`}${r.judgeFailed ? `, ${r.judgeFailed} ${plural(r.judgeFailed, "session", "sessions")} failed` : ""}` : "off"}`);
  // Tokens, not dollars: prices change and a subscription has no dollar figure, while
  // both kinds of reader can weigh tokens. Output apart from input, because output
  // carries the thinking and input is mostly cache reads of the system prompt. An
  // older result has no usage and gets no line.
  if (r.usage) {
    const roles = ["writer", "judge"].filter((k) => r.usage[k]?.sessions);
    if (!roles.length) say("- **Usage:** none, no session finished");
    for (const k of roles) {
      const u = r.usage[k];
      say(`- **Usage, ${k}:** ${u.sessions} sessions, ${tokens(u.output)} tokens out, ${tokens(u.input + u.cacheRead + u.cacheCreate)} in, ${tokens(u.cacheRead)} of them cached`);
    }
  }
  say(`- **Replies:** ${dir ?? r.replies}`);

  section(SECTIONS.summary);
  if (judged) {
    const c = h.checks;
    // A column's denominator is printed only when it differs from the new rules', which
    // happens when a session failed there.
    say(`- Tests passed, of ${c.new.of} per column: ${cols.map((k) => `${name[k]} ${c[k].pass}${c[k].of === c.new.of ? "" : ` of ${c[k].of}`}`).join(", ")}.`);
  }
  if (h.words) say(`- Median reply: ${cols.map((k, i) => `${h.words[k]}${i === 0 ? " words" : ""} with ${name[k]}`).join(", ")}.`);
  if (reg && !Array.isArray(reg)) {
    say(`- Regressions against ${name.old}: ${reg.old.length || "none"}.`);
    if (reg.none) say(`- Regressions against no plugin: ${reg.none.length || "none"}.`);
  } else if (Array.isArray(reg)) say(`- Regressions: ${reg.length || "none"}.`);
  if (judged && h.disagreed && rounds > 1) say(h.disagreed.count ? `- ${rounds === 2 ? "Both" : "All"} judges agreed on ${h.disagreed.of - h.disagreed.count} of ${h.disagreed.of} tests.` : `- ${rounds === 2 ? "Both" : "All"} judges agreed on every test.`);

  if (judged) {
    section(SECTIONS.judge);
    // One cell per column, `X [Y]`: X tests passed in every grading, Y tests where every
    // grading gave the same answer. A cell carries its own denominator only when a
    // failed session shrank it.
    const passCell = (row, k) => `${row.passes[k]}${row.graded[k] === row.of ? "" : ` of ${row.graded[k]}`}${rounds > 1 ? ` [${row.agreed[k]}]` : ""}`;
    say(`| Question |${cols.map((k) => ` ${Name(k)} |`).join("")}`);
    say(`|---|${cols.map(() => "---|").join("")}`);
    for (const row of r.judge) {
      const [label, question] = CRITERION_TEXT[row.key] ?? [row.key, ""];
      say(`| **${label}**<br>${question} |${cols.map((k) => ` ${passCell(row, k)} |`).join("")}`);
    }
    const first = r.judge[0];
    if (first) {
      say();
      say(`- Tests per question: ${first.of}`);
      if (rounds > 1) say(`- Judges per test: ${rounds}`);
      if (rounds > 1) say(`- ${code("X [Y]")}: X tests passed, Y where all judges agreed`);
      else say("- A cell is how many tests passed");
    }
  } else if (pairwise) {
    section(SECTIONS.judge);
    say(`This run was judged in pairs, before 2026-09-19, so it has no grades. Grade its replies again: ${code(withDir(r.commands.rescore))}.`);
  }

  section(SECTIONS.counts);
  say(`| Counted by a script | Target |${cols.map((k) => ` ${Name(k)} |`).join("")}`);
  say(`|---|---|${cols.map(() => "---|").join("")}`);
  const l = r.lineOne;
  say(`| Replies whose line one is one sentence | ${l.new.of} of ${l.new.of} |${cols.map((k) => ` ${l[k] ? l[k].hit : "n/a"} |`).join("")}`);
  for (const c of r.counts.filter((c) => c.shown)) say(`| ${c.what} | ${c.target} |${cols.map((k) => ` ${c[k] ?? "n/a"} |`).join("")}`);
  const atTarget = r.counts.filter((c) => !c.shown);
  if (atTarget.length) {
    say();
    say(`Already 0 everywhere: ${atTarget.map((c) => c.what.toLowerCase()).join(", ")}.`);
  }

  section(SECTIONS.prompts);
  // A result from before the prompts carried noise lists has no kept field and no column.
  const withKept = r.prompts.some((p) => p.kept);
  say(`| Prompt | Words | Facts missed |${withKept ? " Noise kept |" : ""}${judged ? ` Tests passed, of ${r.judge.length} |` : ""}`);
  say(`|---|---|---|${withKept ? "---|" : ""}${judged ? "---|" : ""}`);
  for (const p of r.prompts) {
    const words = cols.map((k) => p.words[k] ?? "failed").join(" / ");
    // undefined is a column the row never had (an older result), null a failed reply.
    const missedVals = cols.map((k) => (p.missed[k] === undefined ? "n/a" : p.missed[k] ?? "failed"));
    const missed = missedVals.every((v) => v === "n/a") ? "none required" : missedVals.join(" / ");
    const keptVals = cols.map((k) => (p.kept?.[k] === undefined ? "n/a" : p.kept[k] ?? "failed"));
    const kept = keptVals.every((v) => v === "n/a") ? "none listed" : keptVals.join(" / ");
    say(`| ${code(p.id)} | ${words} | ${missed} |${withKept ? ` ${kept} |` : ""}${judged ?` ${cols.map((k) => p.judge?.[k] ?? "failed").join(" / ")} |` : ""}`);
  }
  say();
  say(`- Each cell: ${cols.map((k) => name[k]).join(" / ")}.`);

  section(SECTIONS.regressions);
  // One line per regression, in the reader's words, then the judge's reason under it.
  // The two rounds quote the same line or fact in slightly different words, so quotes
  // collapse on their opening words and only the first reason is printed.
  const distinct = (list) => {
    const seen = new Set();
    return list.filter((s) => {
      const key = String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const wordRegression = (e, rival) => {
    if (e.kind === "count") return `${e.what}: ${e.from} with ${name[rival]}, ${e.to} with ${name.new}. Target is ${e.target}.`;
    if (e.kind === "fact") return `${code(e.prompt)}: ${name.new} dropped "${flat(e.fact)}". ${Name(rival)} states it.`;
    if (e.kind === "noise") return `${code(e.prompt)}: ${name.new} kept "${flat(e.line)}". ${Name(rival)} cuts it.`;
    const list = distinct(e.quotes);
    const quotes = list.map((s) => `"${flat(s)}"`).join(", ");
    const split = e.split ? ", by one judge of two" : "";
    if (e.criterion === "complete") return `${code(e.prompt)}: ${name.new} dropped ${quotes}${split}. ${Name(rival)} states ${list.length > 1 ? "both" : "it"}.`;
    if (e.criterion === "noise") return `${code(e.prompt)}: ${name.new} kept a line not worth reading${split}: ${quotes}. ${Name(rival)} has none.`;
    return `${code(e.prompt)}: ${name.new} fails ${criterion(e.criterion)} on ${quotes}${split}. ${Name(rival)} passes.`;
  };
  const sayGroup = (list, rival) => {
    say(`Against ${name[rival]}:`);
    say();
    if (!list.length) say("- None.");
    for (const e of list) {
      say(`- ${wordRegression(e, rival)}`);
      const reason = (e.reasons ?? [])[0];
      if (reason) say(`  - Judge: "${flat(reason)}"`);
    }
  };
  if (Array.isArray(reg)) {
    // An older result holds its regressions as lines already worded.
    if (!reg.length) say("None.");
    for (const line of reg) {
      const { text, why } = typeof line === "string" ? { text: line } : line;
      say(`- ${text}`);
      for (const w of why ?? []) say(`  - ${criterion(w.criterion)}: ${w.reasons.map((s) => `"${flat(s)}"`).join(" / ")}`);
    }
  } else {
    sayGroup(reg.old, "old");
    if (reg.none) {
      say();
      sayGroup(reg.none, "none");
    }
  }

  section(SECTIONS.evidence);
  if (r.evidence.facts.length) {
    say("Must-have facts and who stated them.");
    say();
    const state = (s) => (s === "missed" ? "**missed**" : s === "kept" ? "stated" : s ?? "n/a");
    say(`| Prompt | Fact |${cols.map((k) => ` ${Name(k)} |`).join("")}`);
    say(`|---|---|${cols.map(() => "---|").join("")}`);
    for (const f of r.evidence.facts) say(`| ${code(f.id)} | ${cell(f.fact)} |${cols.map((k) => ` ${state(f[k])} |`).join("")}`);
  }
  if (r.evidence.noise?.length) {
    if (r.evidence.facts.length) say();
    say("Noise lines and who kept them.");
    say();
    const state = (s) => (s === "kept" ? "**kept**" : s ?? "n/a");
    say(`| Prompt | Line |${cols.map((k) => ` ${Name(k)} |`).join("")}`);
    say(`|---|---|${cols.map(() => "---|").join("")}`);
    for (const f of r.evidence.noise) say(`| ${code(f.id)} | ${cell(f.line)} |${cols.map((k) => ` ${state(f[k])} |`).join("")}`);
  }
  if (judged && r.evidence.fails) {
    for (const k of ["old", "new"]) {
      const list = r.evidence.fails[k];
      if (!list.length) continue;
      say();
      say(`Lines the judge failed, ${name[k]}${list.length > EVIDENCE_CAP ? ` (${EVIDENCE_CAP} of ${list.length})` : ` (${list.length})`}.`);
      say();
      say("| Prompt | Question | Line |");
      say("|---|---|---|");
      for (const q of list.slice(0, EVIDENCE_CAP)) say(`| ${code(q.id)} | ${criterion(q.criterion)} | ${cell(q.line)} |`);
    }
  }

  section(SECTIONS.caveats);
  say(`- ${r.sample.prompts} ${plural(r.sample.prompts, "prompt", "prompts")}, ${r.reps === 1 ? "one reply" : `${r.reps} replies`} each: one result either way is chance, a gap across most rows is a result.`);
  say("- Same writer model, same prompts, same empty sandbox for every reply. Only the rules differ.");
  if (none) say("- No plugin is the bare model in that sandbox, not your own setup.");
  if (r.judge) {
    const same = r.models.judge.length === 1 && r.models.writer.length === 1 && r.models.judge[0] === r.models.writer[0];
    say(same ? "- The judge is the writer model, so it shares the writer's blind spots. Pass --judge-model to change that." : "- The judge is a different model from the writer, so it does not share the writer's blind spots.");
  }
  say(`- Re-run: ${code(r.commands.rerun)}`);
  say(`- Grade these same replies again: ${code(withDir(r.commands.rescore))}`);
  say(`- Re-render from the saved result: ${code(withDir(r.commands.rerender))}`);

  return out.join("\n");
}

// ---------------------------------------------------------------------------- cli

// Re-render any saved run: node eval/report.mjs <result.json>
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("eval/report.mjs");
if (invokedDirectly) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node eval/report.mjs <result.json>");
    process.exit(2);
  }
  console.log(render(JSON.parse(readFileSync(file, "utf8"))));
}
