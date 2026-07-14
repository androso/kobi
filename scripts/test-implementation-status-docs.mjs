import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [productSpec, contracts, hygieneGuide, store, checkpoint] = await Promise.all([
  readFile("docs/product-spec.md", "utf8"),
  readFile("docs/contracts.md", "utf8"),
  readFile("docs/repository-hygiene.md", "utf8"),
  readFile("apps/web/src/lib/store.ts", "utf8"),
  readFile("apps/worker/src/checkpoint/evaluateCheckpoint.ts", "utf8"),
]);

assert.match(store, /const defaultClasses: ClassItem\[\] =/);
assert.match(productSpec, /web store still bundles invented `defaultClasses` in `apps\/web\/src\/lib\/store\.ts`/);
assert.match(productSpec, /remains demo-only data in production web code until removed or placed behind an explicit demo\/test path/);

assert.match(checkpoint, /export const checkpointDecisionSchema =/);
assert.match(contracts, /checkpoint decision shape is currently worker-local to `apps\/worker\/src\/checkpoint\/evaluateCheckpoint\.ts`/);
assert.doesNotMatch(contracts, /The `lesson_state`, checkpoint,/);

assert.match(hygieneGuide, /only that intentional ANSI fixture is excluded from the normal repository scan/);
assert.match(hygieneGuide, /other files added to the directory remain subject to credential and size checks/);

console.log("Implementation-status documentation regression passed: web seed, worker-local checkpoint, and fixture boundaries are documented.");
