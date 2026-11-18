import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteImagePrefix } from "../lib/image-retention.ts";
import { authorizeRetentionMaintenance } from "../lib/maintenance-auth.ts";
import { compactMcpSummary } from "../lib/mcp-performance.ts";
test("R3 image removal exhausts more than one R2 page without touching another prefix", async () => {
  const own = Array.from({ length: 451 }, (_, i) => "screens/owner/device/" + i),
    keys = new Set([...own, "screens/other/device/keep"]);
  let reads = 0;
  const bucket = {
    list: async ({ prefix, limit }: { prefix: string; limit: number }) => {
      reads++;
      return {
        objects: [...keys]
          .filter((key) => key.startsWith(prefix))
          .slice(0, limit)
          .map((key) => ({ key })),
      };
    },
    delete: async (values: string[]) => {
      for (const key of values) keys.delete(key);
    },
  };
  await deleteImagePrefix(bucket as any, "screens/owner/device/");
  assert.equal(reads, 4);
  assert.deepEqual([...keys], ["screens/other/device/keep"]);
});
test("R3 maintenance requires its own configured credential and never reports the secret", () => {
  const key = "cd".repeat(32);
  assert.doesNotThrow(() => authorizeRetentionMaintenance(key, key));
  for (const input of [null, "Bearer " + key, "ab".repeat(32)])
    assert.throws(() => authorizeRetentionMaintenance(key, input), /UNAUTHENTICATED/);
  assert.throws(
    () => authorizeRetentionMaintenance(undefined, "Bearer " + key),
    /MAINTENANCE_NOT_CONFIGURED/,
  );
});
test("T3 informational fields and signing health survive compact host text", () => {
  const fields = {
    source_age_ms: 90000,
    screen_changed_since_source: true,
    source_observed_at_server_utc_ms: 100000,
    signing_available: false,
  };
  const result = JSON.parse(compactMcpSummary(fields));
  for (const [key, value] of Object.entries(fields)) assert.equal(result[key], value);
});
