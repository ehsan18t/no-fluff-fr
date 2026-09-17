// Turns one eval result object into the benchmark report, and nothing else. It reads
// no files, spawns nothing and measures nothing: same object in, same markdown out.
// That is the point. Every number is produced by run.mjs and is never recomputed here,
// so a change to the wording of the report can never move a result.
//
// Everything a person would want to reword lives in the wording block below. The rest
// is assembly, and it only walks the object run.mjs hands it (see its `result` builder
// for the shape).
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
};

export const TITLE = "no-fluff-fr rules benchmark";

export const SECTIONS = {
  judge: "Quality: what a blind judge picked",
  counts: "Form: what a script counted",
  prompts: "Prompt by prompt",
  regressions: "Regressions",
  evidence: "Evidence",
  caveats: "Before you act on this",
};

// Noise quotes printed per arm. The rest stay in the result object for anyone who wants them.
export const EVIDENCE_CAP = 5;

export const NO_REGRESSIONS = "None. No count got worse, no fact the old rules stated went missing, and no prompt favoured the old rules.";

// ---------------------------------------------------------------------------- cells

const NEWLINES = new RegExp("[\\r\\n]+", "g");

// A pipe inside a model-written quote would split the row into extra columns, so it
// becomes the entity that renders as a pipe.
const cell = (s) => String(s).replace(NEWLINES, " ").split("|").join("&#124;").trim();
const code = (s) => "`" + s + "`";
const delta = (o, n, higherBetter = false) => {
  if (n === o) return code("same");
  const d = n - o;
  return code(`${d > 0 ? "+" : ""}${d}${(higherBetter ? d > 0 : d < 0) ? "" : " worse"}`);
};
// Lower is better for every percentage printed here, so a rise is always a regression.
const pct = (p) => (p === 0 ? code("same") : code(p > 0 ? `+${p}% worse` : `${p}%`));
const plural = (n, one, many) => (n === 1 ? one : many);

// ---------------------------------------------------------------------------- render

export function render(r) {
  const out = [];
  const say = (s = "") => out.push(s);
  let n = 0;
  const section = (title) => { say(); say(`## ${++n}. ${title}`); say(); };
  const fence = "```";

  say(`# ${TITLE}`);
  say();
  say(fence);
  say(`  OLD   ${r.old.label}`);
  say(`  NEW   ${r.new.label}`);
  say("");
  say(`  sample   ${r.sample.prompts} ${plural(r.sample.prompts, "prompt", "prompts")} x ${r.reps} per arm  =  ${r.sample.replies} replies${r.judge ? `, ${r.sample.judgments} blind judgments` : ""}${r.failed ? `, ${r.failed} failed` : ""}`);
  say(`  writer   ${r.models.writer.join(", ") || "unknown"}, effort ${r.models.effort}   ${r.models.writer.length > 1 ? "(VARIED, see the warning below)" : "(both arms, same model)"}`);
  say(`  judge    ${r.judge ? `${r.models.judge.join(", ") || "unknown"}, blind, both label orders${r.judgeFailed ? `, ${r.judgeFailed} ${plural(r.judgeFailed, "pair", "pairs")} failed` : ""}` : "off"}`);
  say(`  cost     $${r.cost.toFixed(2)}        replies   ${r.repliesDir}`);
  say(fence);
  if (r.models.writer.length > 1) {
    say();
    say(`**WARNING:** the writer model varied across sessions (${r.models.writer.join(", ")}). A comparison is valid only on one writer model. Pin it with --model.`);
  }

  const h = r.headline;
  const head = [];
  if (r.judge) head.push(`New wins ${h.newWins} blind judgments, loses ${h.oldWins}, ties ${h.ties}.`);
  head.push(h.wordPct === 0 ? "Replies are the same length." : `Replies are ${Math.abs(h.wordPct)}% ${h.wordPct < 0 ? "shorter" : "longer"}.`);
  head.push(h.factsLost.length ? `${h.factsLost.length} ${plural(h.factsLost.length, "fact", "facts")} the old rules stated went missing.` : "No fact the old rules stated went missing.");
  head.push(h.worseCounts.length ? `${h.worseCounts.length} ${plural(h.worseCounts.length, "count", "counts")} got worse: ${h.worseCounts.join(", ")}.` : "No count got worse.");
  say();
  say(`**${head.join(" ")}**`);

  if (r.judge) {
    section(SECTIONS.judge);
    say("| The judge's question | Old won | New won | Both judges agreed |");
    say("|---|---|---|---|");
    for (const c of r.judge) {
      const [name, question] = CRITERION_TEXT[c.key] ?? [c.key, ""];
      say(`| **${name}**<br>${question} | ${c.old} of ${c.of} | ${c.new} of ${c.of} | ${c.agreed == null ? "n/a" : `${c.agreed} of ${c.of}`} |`);
    }
  }

  section(SECTIONS.counts);
  say("| What is counted | Target | Old | New | |");
  say("|---|---|---|---|---|");
  const l = r.lineOne;
  // Denominators diverge only when a reply failed, and two hit counts over different
  // denominators do not compare, so the cell says so rather than inventing a delta.
  say(`| Line one is a single sentence | ${l.new.of} of ${l.new.of} | ${l.old.hit} of ${l.old.of} | ${l.new.hit} of ${l.new.of} | ${l.old.of === l.new.of ? delta(l.old.hit, l.new.hit, true) : code("n/a")} |`);
  for (const c of r.counts.filter((c) => c.shown)) say(`| ${c.what} | ${c.target} | ${c.old} | ${c.new} | ${c.pct ? pct(h.wordPct) : delta(c.old, c.new)} |`);
  const atTarget = r.counts.filter((c) => !c.shown);
  if (atTarget.length) {
    say();
    say(`Already 0 in both arms, unchanged: ${atTarget.map((c) => c.what.toLowerCase()).join("; ")}.`);
  }

  section(SECTIONS.prompts);
  say(`| Prompt | Words | Facts missed | Line one |${r.judge ? " Judge, old / new |" : ""}`);
  say(`|---|---|---|---|${r.judge ? "---|" : ""}`);
  for (const p of r.prompts) {
    say(`| ${code(p.id)} | ${p.words.old ?? "failed"} -> ${p.words.new ?? "failed"}${p.words.pct == null ? "" : ` ${pct(p.words.pct)}`} | ${p.missed.old ?? "failed"} -> ${p.missed.new ?? "failed"} | ${p.lineOne.old} -> ${p.lineOne.new} |${r.judge ? ` ${p.judge ? `${p.judge.old} / ${p.judge.new}` : "failed"} |` : ""}`);
  }

  section(SECTIONS.regressions);
  if (!r.regressions.length) say(NO_REGRESSIONS);
  else for (const line of r.regressions) say(`- ${line}`);

  section(SECTIONS.evidence);
  if (r.evidence.facts.length) {
    say("Facts a reply should have stated.");
    say();
    say("| Prompt | Fact | Old | New |");
    say("|---|---|---|---|");
    for (const f of r.evidence.facts) say(`| ${code(f.id)} | ${cell(f.fact)} | ${f.old === "missed" ? "**missed**" : f.old} | ${f.new === "missed" ? "**missed**" : f.new} |`);
  }
  if (r.judge) {
    for (const arm of ["old", "new"]) {
      const list = r.evidence.noise[arm];
      if (!list.length) continue;
      say();
      say(`Noise the ${arm} rules left in${list.length > EVIDENCE_CAP ? ` (${EVIDENCE_CAP} of ${list.length})` : ` (${list.length})`}.`);
      say();
      say("| Prompt | Line |");
      say("|---|---|");
      for (const q of list.slice(0, EVIDENCE_CAP)) say(`| ${code(q.id)} | ${cell(q.line)} |`);
    }
  }

  section(SECTIONS.caveats);
  say(`- ${r.sample.prompts} ${plural(r.sample.prompts, "prompt", "prompts")} at ${r.reps} ${plural(r.reps, "reply", "replies")} each. A margin of 1 is a coin flip. A margin of 2 or more in the same direction is a result.`);
  say("- Both arms ran the same writer model, the same prompts and the same isolation. Only the rules differ.");
  if (r.judge) {
    const same = r.models.judge.length === 1 && r.models.writer.length === 1 && r.models.judge[0] === r.models.writer[0];
    say(`- ${r.models.judge.join(", ")} judged, ${r.models.writer.join(", ")} wrote. ${same ? "Same model on both sides, so a shared blind spot is not caught. Pass --judge-model to change that." : "Different models, so a shared blind spot is not scoring itself."}`);
  }
  say(`- Re-run it: ${code(r.commands.rerun)}. Rescore these same replies without paying to regenerate: ${code(r.commands.rescore)}.`);
  say(`- Re-render this report from the saved result, free: ${code(r.commands.rerender)}.`);

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
