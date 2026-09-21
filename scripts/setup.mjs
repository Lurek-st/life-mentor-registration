import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
await mkdir("work", { recursive: true });
try {
  await writeFile(
    ".dev.vars",
    `ADMIN_PASSWORD="${randomBytes(24).toString("base64url")}"\nAPP_SECRET="${randomBytes(32).toString("hex")}"\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created local-only .dev.vars. Read ADMIN_PASSWORD there to sign in at /#staff. Do not share or commit this file.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .dev.vars preserved.");
}
await import("./seed-demo.mjs");
