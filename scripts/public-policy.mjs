// Shared by index and reachable-history scans. Never print a matching value.
export function inspectPublicFile(file, bytes) {
  const problems = [];
  const privateHost = ["life-mentor", "preview.pages.dev"].join("-");
  const privateEmailDomain = ["cityu", "dg.edu.cn"].join("-");
  if (
    /(^|\/)(work|node_modules|dist|\.wrangler|\.memory|private[^/]*)(\/|$)|(^|\/)\.dev\.vars|(^|\/)\.env|\.(sqlite[^/]*|db|xlsx|csv|zip|mentor-backup)$|(^|\/)wrangler\.jsonc$/.test(
      file,
    )
  )
    problems.push("excluded private or generated artifact");
  if (/\.png$/i.test(file)) return problems; // Retain manual visual review.
  if (bytes.includes(0)) return [...problems, "unexpected binary artifact"];
  const text = bytes.toString("utf8");
  if (/[A-Z]:[\\/]Users[\\/]|[A-Z]:[\\/]CodexProjects[\\/]/.test(text))
    problems.push("personal absolute path");
  if (text.includes(privateHost) || text.includes(privateEmailDomain))
    problems.push("institution-specific deployment or email domain");
  if (
    /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|otpauth:\/\//.test(
      text,
    )
  )
    problems.push("possible credential (value intentionally withheld)");
  if (/\.jsonc(?:\.example)?$/.test(file)) {
    const ids =
      text.match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi) || [];
    if (ids.some((id) => id !== "00000000-0000-0000-0000-000000000000"))
      problems.push("real cloud binding");
  }
  return problems;
}
