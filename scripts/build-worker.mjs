import { build } from "esbuild";
import { writeFile, readFile } from "node:fs/promises";
await build({
  entryPoints: ["worker/index.ts"],
  outfile: "dist/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
// Static files bypass Functions and do not consume the daily request allowance.
await writeFile(
  "dist/_routes.json",
  JSON.stringify({ version: 1, include: ["/api/*"], exclude: [] }),
);
await writeFile(
  "dist/_headers",
  `/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n`,
);
console.log("Pages application packaged; dynamic routes limited to /api/*.");
const notices = await Promise.all(
  ["react", "react-dom", "scheduler", "lucide-react", "fflate"].map(
    async (name) =>
      `${name}\n${"=".repeat(60)}\n${await readFile(`docs/licenses/${name}.txt`, "utf8")}`,
  ),
);
await writeFile("dist/THIRD_PARTY_LICENSES.txt", notices.join("\n\n"));
