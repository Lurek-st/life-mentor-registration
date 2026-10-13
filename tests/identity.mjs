import assert from "node:assert/strict";
import { build } from "esbuild";
import { fixture, req, payload } from "./security-fixture.mjs";
async function configured(entry, rules) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    plugins: [
      {
        name: "synthetic-identity-config",
        setup(b) {
          b.onLoad({ filter: /[\\/]shared[\\/]config\.ts$/ }, () => ({
            contents: "export const identityRules=" + JSON.stringify(rules),
            loader: "ts",
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
const defaults = await configured("shared/formInputs.ts", {
  employeeDigits: null,
  emailDomain: "",
});
for (const id of ["00000123", "A-19", "90001234", "1234567"])
  assert.equal(defaults.validEmployeeNumber(id), true);
assert.equal(defaults.validEmployeeNumber("bad id"), false);
assert.equal(defaults.validSchoolEmail("person@example.net"), true);
assert.equal(defaults.schoolEmailFromInput("person"), "person");
const rules = { employeeDigits: 8, emailDomain: "example.org" };
const strict = await configured("shared/formInputs.ts", rules);
assert.equal(strict.validEmployeeNumber("00000123"), true);
for (const id of ["1234567", "123456789", "ABC12345"])
  assert.equal(strict.validEmployeeNumber(id), false);
assert.equal(strict.schoolEmailFromInput("a.b+label"), "a.b+label@example.org");
assert.equal(strict.schoolEmailInput("a.b@example.org"), "a.b");
assert.equal(strict.schoolEmailFromInput("a.b@other.org"), "a.b@other.org");
assert.equal(strict.validSchoolEmail("a.b@other.org"), false);
const worker = (await configured("worker/index.ts", rules)).default;
const f = fixture();
for (const data of [
  payload("1234567", { email: "a@example.org" }),
  payload("12345678", { email: "a@other.org" }),
])
  assert.equal((await req(f, "/register", data, { worker })).status, 400);
assert.equal(
  (
    await req(
      f,
      "/register",
      payload("00000123", { email: "person@example.org" }),
      { worker },
    )
  ).status,
  201,
);
f.db.close();
const gate = fixture();
delete gate.env.CANONICAL_ORIGIN;
const before = gate.metrics();
assert.equal((await req(gate, "/health")).status, 503);
assert.deepEqual(gate.metrics(), before);
for (const value of [
  "http://mentor.example.test",
  "https://mentor.example.test/extra",
  "https://user@mentor.example.test",
  "https://mentor.example.test/#staff",
]) {
  gate.env.CANONICAL_ORIGIN = value;
  assert.equal((await req(gate, "/health")).status, 503);
}
assert.deepEqual(gate.metrics(), before);
gate.db.close();
console.log(
  "PASS generic IDs/full emails; optional eight digits and domain enforced by real worker; foreign pasted domain preserved; missing/invalid canonical configuration fails closed",
);
