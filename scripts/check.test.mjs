// Tests for the size, encoding and reference gate. Each case copies the shipped
// plugin files into a temp dir, breaks one thing, and runs check.mjs against it.
// Run: node --test scripts/

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = [".claude-plugin", "hooks", "rules.md", "reminder.md"];

function fixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "nsb-check-"));
  for (const p of SHIPPED) cpSync(join(repo, p), join(dir, p), { recursive: true });
  mutate?.(dir);
  return dir;
}

function check(dir) {
  const r = spawnSync(process.execPath, [join(repo, "scripts", "check.mjs"), dir], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
}

test("passes on the shipped files", () => {
  const r = check(fixture());
  assert.equal(r.code, 0, r.out);
});

test("passes on a rules.md of exactly 8,000 bytes", () => {
  const r = check(fixture((d) => writeFileSync(join(d, "rules.md"), "a".repeat(8000))));
  assert.equal(r.code, 0, r.out);
});

test("fails on a rules.md of 8,001 bytes", () => {
  const r = check(fixture((d) => writeFileSync(join(d, "rules.md"), "a".repeat(8001))));
  assert.equal(r.code, 1);
  assert.match(r.out, /rules\.md.*8001/);
});

test("fails on a reminder.md of 501 bytes", () => {
  const r = check(fixture((d) => writeFileSync(join(d, "reminder.md"), "a".repeat(501))));
  assert.equal(r.code, 1);
  assert.match(r.out, /reminder\.md.*501/);
});

test("fails on a non-ASCII byte and names the line", () => {
  const r = check(fixture((d) => writeFileSync(join(d, "rules.md"), "ok\nan em dash " + String.fromCharCode(0x2014) + " here\n")));
  assert.equal(r.code, 1);
  assert.match(r.out, /rules\.md.*non-ASCII.*line 2/);
});

test("fails when a file the hooks reference is missing", () => {
  const r = check(fixture((d) => rmSync(join(d, "reminder.md"))));
  assert.equal(r.code, 1);
  assert.match(r.out, /reminder\.md.*(missing|does not exist)/);
});

test("fails when hooks.json does not parse", () => {
  const r = check(fixture((d) => writeFileSync(join(d, "hooks", "hooks.json"), "{ not json")));
  assert.equal(r.code, 1);
  assert.match(r.out, /hooks\.json/);
});
