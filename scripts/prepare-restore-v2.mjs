import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { restoreSql } from "./restore-model.mjs";

const args = process.argv.slice(2);
const passwordStdin = args.includes("--password-stdin");
const [input, output, ...extra] = args.filter((a) => a !== "--password-stdin");
if (!input || !output || extra.length || resolve(input) === resolve(output))
  throw Error("Supply distinct input backup and new output SQL paths");
let backup = JSON.parse(readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
if (backup.format === "mentor-encrypted-backup-v1") {
  if (!passwordStdin || process.stdin.isTTY)
    throw Error(
      "Encrypted backup: pipe the password through stdin and add --password-stdin. Never put passwords in command arguments.",
    );
  let password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  const code = await build({
    entryPoints: ["shared/backupCrypto.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const { decryptBackup } = await import(
    "data:text/javascript;base64," +
      Buffer.from(code.outputFiles[0].text).toString("base64")
  );
  backup = await decryptBackup(backup, password);
  password = "";
} else if (passwordStdin)
  throw Error("Password input is only for encrypted backups");
const { sql, db } = restoreSql(backup);
db.close();
writeFileSync(output, sql, { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log(
  "Validated restore SQL for an empty database; output contains personal data. No cloud data changed.",
);
console.log(
  "Before exposing the restored service: keep the original APP_SECRET, configure a NEW unique ADMIN_PASSWORD, and verify the previous initial/shared passwords cannot log in. Backups intentionally omit the staff password digest; reusing the old environment password would reactivate it. See docs/UPGRADE-v3.md.",
);
