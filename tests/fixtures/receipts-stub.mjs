// A transport fixture, not an implementation of receipts or its fingerprint rules.
import { readFileSync } from "node:fs";

const scenario = JSON.parse(readFileSync("receipts-stub.json", "utf8"));
let input = "";
for await (const chunk of process.stdin) input += chunk;
if (
  JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["check", "--json", "-"]) ||
  input !== scenario.input
)
  throw new Error("Unexpected receipts argv/stdin");
process.stdout.write(
  typeof scenario.output === "string" ? scenario.output : JSON.stringify(scenario.output),
);
process.stderr.write(scenario.stderr ?? "");
process.exitCode = scenario.exitCode ?? 0;
