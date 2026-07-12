import assert from "node:assert/strict";
import { inspectFiles } from "./check-repository-hygiene.mjs";

const fixture = "scripts/fixtures/repository-hygiene/ansi-terminal-dump.txt";
const violations = await inspectFiles([fixture]);

assert.equal(violations.length, 1);
assert.match(violations[0], /terminal ANSI escape sequence/);
console.log("Repository hygiene regression passed: ANSI terminal dump was rejected.");
