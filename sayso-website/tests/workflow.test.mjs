import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("all direct workflow actions are pinned to immutable commit IDs", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/pages.yml", import.meta.url),
    "utf8",
  );
  const template = await readFile(new URL("../integration/pages.yml", import.meta.url), "utf8");
  const betaStep = value => value.replaceAll("\r\n","\n").match(/      - name: Verify beta invitation[^]*?(?=      - uses: actions\/upload-pages-artifact)/)?.[0];
  assert.ok(betaStep(template));
  assert.equal(betaStep(template), betaStep(workflow));
  const refs = [...workflow.matchAll(/uses:\s+([^@\s]+)@([^\s#]+)/g)];
  assert.equal(refs.length, 4);
  for (const [, action, ref] of refs)
    assert.match(ref, /^[a-f0-9]{40}$/, `${action} must be pinned`);
  const gate = workflow.indexOf("check-release.mjs --integrated --channel=beta");
  assert.ok(gate > 0 && gate < workflow.indexOf("uses: actions/upload-pages-artifact@"));
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /inputs\.deploy/);
});
