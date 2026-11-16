import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("all direct workflow actions are pinned to immutable commit IDs", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/pages.yml", import.meta.url),
    "utf8",
  );
  const refs = [...workflow.matchAll(/uses:\s+([^@\s]+)@([^\s#]+)/g)];
  assert.equal(refs.length, 4);
  for (const [, action, ref] of refs)
    assert.match(ref, /^[a-f0-9]{40}$/, `${action} must be pinned`);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /inputs\.deploy/);
});
