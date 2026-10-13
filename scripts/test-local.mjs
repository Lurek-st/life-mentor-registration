import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readFile, copyFile } from "node:fs/promises";
import ts from "typescript";
const id = randomUUID(),
  space = "test-" + id;
const formal = process.argv.includes("--formal");
const port = Number(process.env.TEST_PORT || 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid TEST_PORT");
const config = "work/wrangler.test.jsonc",
  state = "work/test-state-" + id;
const url = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  TEST_URL: url,
  TEST_DATA_SPACE: space,
  WRANGLER_SEND_METRICS: "false",
};
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const run = (script, args = []) =>
  new Promise((yes, no) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: "inherit",
      env,
    });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? yes() : no(Error(`${script} failed (${code})`)),
    );
  });
await run("scripts/setup.mjs");
mkdirSync("work", { recursive: true });
// Absolute paths and secrets stay in ignored work/. Each run gets a separate database.
// Wrangler accepts comments and trailing commas, so strict JSON.parse is unsuitable.
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.local.jsonc",
  await readFile("wrangler.local.jsonc", "utf8"),
);
if (parsed.error)
  throw Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
const local = parsed.config;
writeFileSync(
  config,
  JSON.stringify(
    {
      ...local,
      name: "mentor-local-tests",
      main: resolve("worker/index.ts"),
      assets: { ...local.assets, directory: resolve("dist") },
      vars: { APP_MODE: formal ? "formal" : "preview", DATA_SPACE: space },
    },
    null,
    2,
  ),
);
// Wrangler resolves .dev.vars next to its configuration file.
await copyFile(".dev.vars", "work/.dev.vars");
await run(wrangler, [
  "d1",
  "execute",
  "mentor-demo",
  "--config",
  config,
  "--local",
  "--persist-to",
  state,
  "--file",
  "work/seed-demo.sql",
]);
const log = createWriteStream("work/test-server.log");
const server = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--config",
    config,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--persist-to",
    state,
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.pipe(log);
server.stderr.pipe(log);
let exit;
server.on("exit", (code) => {
  exit = code ?? -1;
});
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (exit !== undefined)
      throw Error("Local test server exited; see ignored work/test-server.log");
    try {
      const response = await fetch(url + "/api/sessions", {
        signal: AbortSignal.timeout(1500),
      });
      const snapshot = await response.json();
      if (response.ok && snapshot.dataSpace === space) {
        ready = true;
        break;
      }
      if (response.ok) throw Error("Port belongs to a different application");
    } catch (error) {
      if (error.message === "Port belongs to a different application")
        throw error;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw Error(
      "Local test server did not become ready; see ignored work/test-server.log",
    );
  for (const file of process.argv.includes("--v3-only")
    ? ["test-v3-ui.mjs"]
    : formal
      ? ["test-formal-local.mjs"]
      : [
          "test-ui-v2.mjs",
          "test-api-v2.mjs",
          "test-edge-v2.mjs",
          "test-v3-ui.mjs",
        ])
    await run("scripts/" + file);
  console.log(
    "PASS: " +
      (formal ? "Formal registration flow" : "UI, API and edge suites") +
      " on isolated local data.",
  );
} finally {
  if (process.platform === "win32" && server.pid && exit === undefined) {
    await new Promise((r) => {
      const killer = spawn(
        "taskkill",
        ["/PID", String(server.pid), "/T", "/F"],
        { stdio: "ignore" },
      );
      killer.on("exit", r);
      killer.on("error", r);
    });
  } else server.kill("SIGTERM");
  log.end();
}
