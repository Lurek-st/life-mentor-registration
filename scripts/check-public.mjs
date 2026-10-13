import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inspectPublicFile } from "./public-policy.mjs";
// Local replacement objects do not rewrite the originals a normal push publishes.
const git = (args) =>
  execFileSync("git", ["--no-replace-objects", ...args], {
    maxBuffer: 40_000_000,
  });
if (git(["rev-parse", "--is-shallow-repository"]).toString().trim() !== "false")
  throw Error(
    "Full Git history is required. Fetch all intended branches and tags without a depth limit.",
  );
const problems = [],
  inspected = new Set(),
  blobs = new Map();
const readBlob = (id) => {
  if (!blobs.has(id)) blobs.set(id, git(["cat-file", "blob", id]));
  return blobs.get(id);
};
const inspect = (file, id, mode, context) => {
  if (mode !== "100644" && mode !== "100755") {
    problems.push(`${context}: ${file}: unsupported link or submodule`);
    return;
  }
  const key = file + "\0" + id;
  if (inspected.has(key)) return;
  inspected.add(key);
  for (const problem of inspectPublicFile(file, readBlob(id)))
    problems.push(`${context}: ${file}: ${problem}`);
};
const staged = git(["ls-files", "--stage", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
if (!staged.length) throw Error("Stage the intended public files first");
for (const entry of staged) {
  const tab = entry.indexOf("\t"),
    file = entry.slice(tab + 1);
  const [mode, id, stage] = entry.slice(0, tab).split(" ");
  if (stage !== "0") throw Error("Resolve Git conflicts before publication");
  inspect(file, id, mode, "index");
  if (mode !== "100644" && mode !== "100755") continue;
  const bytes = readBlob(id),
    working = readFileSync(file);
  if (
    !bytes.equals(working) &&
    bytes.toString("utf8").replaceAll("\r\n", "\n") !==
      working.toString("utf8").replaceAll("\r\n", "\n")
  )
    problems.push(
      file +
        ": unstaged differences; stage and inspect the actual public snapshot",
    );
}
const commits = git(["rev-list", "--all"])
  .toString("utf8")
  .trim()
  .split("\n")
  .filter(Boolean);
for (const commit of commits) {
  for (const entry of git(["ls-tree", "-r", "-z", commit])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)) {
    const tab = entry.indexOf("\t"),
      file = entry.slice(tab + 1);
    const [mode, , id] = entry.slice(0, tab).split(" ");
    inspect(file, id, mode, "history " + commit.slice(0, 12));
  }
}
if (problems.length) throw Error(problems.join("\n"));
console.log(
  `PASS: ${staged.length} staged files and ${commits.length} reachable commits (${blobs.size} blobs) checked. Fetch all intended refs before publishing. Images require visual review; patterns do not prove absence of all secrets or personal data.`,
);
