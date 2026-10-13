import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const git = (args) => execFileSync("git", args, { maxBuffer: 20_000_000 });
const files = git(["ls-files", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
if (!files.length) throw Error("Stage the intended public files first");
const problems = [];
const privateHost = ["life-mentor", "preview.pages.dev"].join("-");
const privateEmailDomain = ["cityu", "dg.edu.cn"].join("-");
for (const file of files) {
  if (
    /(^|\/)(work|node_modules|dist|\.wrangler|\.memory|private[^/]*)(\/|$)|(^|\/)\.dev\.vars|(^|\/)\.env|\.(sqlite[^/]*|db|xlsx|csv|zip|mentor-backup)$|(^|\/)wrangler\.jsonc$/.test(
      file,
    )
  )
    problems.push(file + ": excluded private or generated artifact");
  const bytes = git(["show", ":" + file]);
  const working = readFileSync(file);
  if (
    !bytes.equals(working) &&
    bytes.toString("utf8").replaceAll("\r\n", "\n") !==
      working.toString("utf8").replaceAll("\r\n", "\n")
  )
    problems.push(
      file +
        ": unstaged differences; stage and inspect the actual public snapshot",
    );
  if (/\.png$/.test(file)) continue; // Images also require visual review.
  if (bytes.includes(0)) {
    problems.push(file + ": unexpected binary artifact");
    continue;
  }
  const text = bytes.toString("utf8");
  if (/[A-Z]:[\\/]Users[\\/]|[A-Z]:[\\/]CodexProjects[\\/]/.test(text))
    problems.push(file + ": personal absolute path");
  if (text.includes(privateHost) || text.includes(privateEmailDomain))
    problems.push(file + ": institution-specific deployment or email domain");
  if (
    /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|otpauth:\/\//.test(
      text,
    )
  )
    problems.push(
      file + ": possible credential (value intentionally withheld)",
    );
  if (/\.jsonc(?:\.example)?$/.test(file)) {
    const ids =
      text.match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi) || [];
    if (ids.some((id) => id !== "00000000-0000-0000-0000-000000000000"))
      problems.push(file + ": real cloud binding");
  }
}
if (problems.length) throw Error(problems.join("\n"));
console.log(
  `PASS: ${files.length} staged files checked for excluded artifacts, common secrets and deployment bindings. Images/history need separate review; this is not a complete security audit.`,
);
