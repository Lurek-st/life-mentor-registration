import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
if (!files.length)
  throw Error(
    "No tracked files to inspect. Stage the intended public files first.",
  );
const problems = [];
for (const file of files) {
  if (
    /(^|\/)(work|node_modules|dist|\.wrangler)(\/|$)|(^|\/)\.dev\.vars|(^|\/)\.env|\.(sqlite|db|xlsx|csv|zip)$|(^|\/)wrangler\.jsonc$/.test(
      file,
    )
  )
    problems.push(file + ": private/generated file");
  if (/\.png$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  if (/[A-Z]:[\\/]Users[\\/]|[A-Z]:[\\/]CodexProjects[\\/]/.test(text))
    problems.push(file + ": personal absolute path");
  if (
    /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(
      text,
    )
  )
    problems.push(file + ": possible credential");
  if (/\.jsonc(?:\.example)?$/.test(file)) {
    const ids =
      text.match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi) || [];
    if (ids.some((id) => id !== "00000000-0000-0000-0000-000000000000"))
      problems.push(file + ": real cloud binding");
  }
}
if (problems.length) throw Error(problems.join("\n"));
console.log(
  `PASS: ${files.length} tracked files checked for excluded artifacts, obvious credentials, paths and deployment bindings. This is a limited check, not a security audit.`,
);
