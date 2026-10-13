import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
export async function bundle(path) {
  const b = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(b.outputFiles[0].text).toString("base64")
  );
}
export const worker = (await bundle("worker/index.ts")).default;
export function fixture(
  mode = "formal",
  schema = readFileSync("schema/v2.sql", "utf8"),
) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  let calls = 0;
  function stmt(sql, args = []) {
    return {
      sql,
      args,
      bind(...a) {
        return stmt(sql, a);
      },
      async first() {
        calls++;
        return db.prepare(sql).get(...args) || null;
      },
      async all() {
        calls++;
        return { results: db.prepare(sql).all(...args) };
      },
      async run() {
        return exec(sql, args);
      },
    };
  }
  function exec(sql, args) {
    calls++;
    const q = db.prepare(sql);
    if (q.columns().length)
      return { results: q.all(...args), meta: { changes: 0 } };
    return { results: [], meta: { changes: Number(q.run(...args).changes) } };
  }
  const env = {
    DB: {
      prepare: stmt,
      async batch(ss) {
        db.exec("BEGIN");
        try {
          const rows = ss.map((s) => exec(s.sql, s.args));
          db.exec("COMMIT");
          return rows;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    CANONICAL_ORIGIN: "https://mentor.example.test",
    APP_MODE: mode,
    DATA_SPACE: "synthetic-" + mode,
    APP_SECRET: "synthetic-key-only",
    ADMIN_PASSWORD: "synthetic-password-only",
    ASSETS: { fetch: async () => new Response("synthetic") },
  };
  const now = Math.floor(Date.now() / 1000);
  db.exec(
    "INSERT INTO rounds(id,title,sort_order) VALUES('test','合成轮次',1)",
  );
  db.prepare(
    "INSERT INTO sessions(id,round_id,template_key,title,subjects,agenda,venue,start_at,end_at,deadline_at,capacity,state) VALUES('future','test','test','合成活动','[]','[]','合成地点',?,?,?,1000,'published')",
  ).run(now + 86400, now + 90000, now + 80000);
  return {
    db,
    env,
    metrics: () => ({
      calls,
      changes: db.prepare("SELECT total_changes() n").get().n,
    }),
  };
}
export const payload = (n = "10000001", extra = {}) => ({
  sessionId: "future",
  name: "合成老师",
  department: "合成部门",
  employeeId: n,
  email: n + "@example.invalid",
  receipt:
    "mr_" + randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
  requestId: randomUUID(),
  contentRevision: 1,
  consent: true,
  ...extra,
});
export async function req(f, path, data, opts = {}) {
  const response = await (opts.worker || worker).fetch(
    new Request((opts.base || "https://mentor.example.test") + "/api" + path, {
      method: opts.method || (data ? "POST" : "GET"),
      headers: {
        "CF-Connecting-IP": opts.ip || "192.0.2.22",
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...opts.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    f.env,
  );
  return {
    status: response.status,
    j: await response.json(),
    headers: response.headers,
  };
}
