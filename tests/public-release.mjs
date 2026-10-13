import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
const scanner = resolve("scripts/check-public.mjs");
const root = resolve("work/public-guard-" + randomUUID());
mkdirSync(root, { recursive: true });
const fixture = (name) => {
  const dir = root + "/" + name;
  mkdirSync(dir);
  const git = (args) =>
    execFileSync("git", args, { cwd: dir, stdio: "pipe", encoding: "utf8" });
  git(["init", "--initial-branch=main"]);
  git(["config", "user.name", "Synthetic Test"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(dir + "/README.md", "Synthetic fixture only\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "clean"]);
  return { dir, git };
};
const check = (dir) =>
  spawnSync(process.execPath, [scanner], { cwd: dir, encoding: "utf8" });
const bad = fixture("deleted-history");
assert.equal(check(bad.dir).status, 0);
// Assemble a synthetic token-shaped string; no real credential is used.
const tokenShape = ["gh", "p_", "x".repeat(36)].join("");
writeFileSync(bad.dir + "/note.txt", tokenShape);
bad.git(["add", "note.txt"]);
assert.notEqual(check(bad.dir).status, 0);
bad.git(["commit", "-m", "synthetic fixture"]);
bad.git(["tag", "historical-fixture"]);
unlinkSync(bad.dir + "/note.txt");
bad.git(["add", "-u"]);
bad.git(["commit", "-m", "remove from current snapshot"]);
const historical = check(bad.dir);
assert.notEqual(historical.status, 0);
assert.match(historical.stderr, /history/);
assert.ok(!historical.stderr.includes(tokenShape));
const dirtyCommit = bad.git(["rev-parse", "historical-fixture"]).trim();
const cleanCommit = bad.git(["rev-parse", "HEAD"]).trim();
bad.git(["replace", dirtyCommit, cleanCommit]);
assert.notEqual(check(bad.dir).status, 0);
bad.git(["replace", "-d", dirtyCommit]);
// Keep the bad object reachable only via a tag; current main is clean.
bad.git(["checkout", "--orphan", "clean-main"]);
bad.git(["add", "README.md"]);
bad.git(["commit", "-m", "clean orphan"]);
bad.git(["branch", "-D", "main"]);
assert.notEqual(check(bad.dir).status, 0);
const clean = fixture("clean-history");
writeFileSync(clean.dir + "/benign.txt", "Normal public text.");
clean.git(["add", "."]);
clean.git(["commit", "-m", "control"]);
assert.equal(check(clean.dir).status, 0);
writeFileSync(clean.dir + "/benign.txt", "Unstaged public change.");
assert.match(check(clean.dir).stderr, /unstaged differences/);
const shallow = root + "/shallow";
execFileSync(
  "git",
  ["clone", "--depth=1", pathToFileURL(clean.dir).href, shallow],
  { stdio: "pipe" },
);
assert.match(check(shallow).stderr, /Full Git history is required/);
console.log(
  "PASS release gate rejects staged secrets, deleted-history secrets, Git replacements, tag-only secrets, unstaged differences and shallow history; clean history passes and matched values stay private.",
);
