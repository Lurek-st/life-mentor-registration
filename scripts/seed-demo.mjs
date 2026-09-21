import { readFile, writeFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["shared/model.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { templates, previousEvening } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const today = new Date(Date.now() + 8 * 3600000);
today.setUTCHours(0, 0, 0, 0);
// First sample event is a Thursday at 11:30 Beijing time, at least one week away.
const days = 7 + ((4 - today.getUTCDay() + 7) % 7);
const first = today.getTime() / 1000 + days * 86400 + 3.5 * 3600;
let sql = await readFile("schema/v2.sql", "utf8");
sql +=
  "\nINSERT INTO edit_guards(scope,expected,actual) SELECT 'seed_empty','0',CAST((SELECT count(*) FROM rounds)+(SELECT count(*) FROM sessions)+(SELECT count(*) FROM registrations) AS TEXT);\nDELETE FROM edit_guards WHERE scope='seed_empty';\n";
for (let i = 0; i < 3; i++)
  sql += `INSERT INTO rounds(id,title,sort_order) VALUES (${quote("round-" + (i + 1))},${quote("第" + ["一", "二", "三"][i] + "轮")},${i + 1});\n`;
for (let i = 0; i < 12; i++) {
  const template = templates[i % 4],
    start = first + i * 7 * 86400;
  const row = {
    id: "session-demo-" + String(i + 1).padStart(2, "0"),
    round_id: "round-" + (1 + Math.floor(i / 4)),
    sort_order: i % 4,
    template_key: template.key,
    title: template.title,
    title_en: template.title_en,
    subjects: JSON.stringify(template.subjects),
    agenda: JSON.stringify(template.agenda),
    venue: "示例活动室",
    start_at: start,
    end_at: start + 3600,
    deadline_at: previousEvening(start),
    capacity: 36,
    state: "published",
  };
  sql += `INSERT INTO sessions(${Object.keys(row).join(",")}) VALUES (${Object.values(
    row,
  )
    .map((x) => (typeof x === "number" ? x : quote(x)))
    .join(",")});\n`;
}
await mkdir("work", { recursive: true });
await writeFile("work/seed-demo.sql", sql);
console.log(
  "Generated 12 fictional future sessions. Apply only to an empty local/demo database; this does not change any database.",
);
