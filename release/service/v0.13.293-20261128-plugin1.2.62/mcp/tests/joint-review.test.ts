import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { BridgeError } from "../lib/bridge-engine.ts";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { publicToolRisk } from "../lib/tool-risk-policy.ts";
import { benchmarkCaseIDs } from "../lib/benchmark-metadata.ts";
import { phoneWorkflowInstructions } from "../lib/interaction-guidance.ts";

test("tool annotations reflect effects; stop is repeat-safe, deletion and text replacement stay disclosed", () => {
  for (const tool of mcpToolsForAudience()) {
    assert.ok(publicToolRisk(tool.name));
    assert.deepEqual(tool.annotations, publicToolRisk(tool.name));
    assert.match(tool.title, /[A-Za-z]/);
    assert.match(tool.title, /[\u4e00-\u9fff]/);
  }
  const get = (name: string) => mcpToolsForAudience("development").find((t) => t.name === name)!;
  for (const name of ["cancel_current_operation", "stop_mouse", "stop_session"])
    assert.equal(get(name).annotations.idempotentHint, true);
  assert.equal(get("stop_mouse").annotations.destructiveHint, false);
  for (const name of ["click_at", "drag_at", "type_text_in_field"])
    assert.equal(get(name).annotations.destructiveHint, true);
  assert.match(phoneWorkflowInstructions, /voice screen reads use wait_for_new_ms=5000/);
});
test("MCP authenticates before reading even a malformed envelope", async () => {
  const request = new Request("https://fixture.invalid/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "SECRET_INVALID_JSON",
  });
  let reads = 0,
    engines = 0;
  Object.defineProperty(request, "body", {
    get() {
      reads++;
      throw Error("stream accessed before identity");
    },
  });
  request.arrayBuffer = async () => {
    reads++;
    throw Error("body read before identity");
  };
  const response = await handleMcp(request, {
    caller: () => {
      throw new BridgeError("UNAUTHENTICATED", 401);
    },
    engine: () => {
      engines++;
      throw Error("engine");
    },
    origin: "https://fixture.invalid",
    performance: { log: () => {} },
  });
  assert.equal(response.status, 401);
  assert.equal(reads, 0);
  assert.equal(engines, 0);
  assert.doesNotMatch(await response.text(), /SECRET/);
});
test("invalid argument errors list names, not values, without calling the device engine", async () => {
  for (const modern of [false, true]) {
    const logs: unknown[] = [];
    let engines = 0;
    const response = await handleMcp(
      new Request("https://fixture.invalid/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(modern ? { "mcp-protocol-version": "2026-07-28" } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "type_text_in_field",
            arguments: { text: "SECRET_TEXT", unexpected: "SECRET_VALUE" },
          },
        }),
      }),
      {
        caller: () => ({ id: "owner", label: "owner" }),
        engine: () => {
          engines++;
          throw Error("engine");
        },
        origin: "https://fixture.invalid",
        performance: { log: (value) => logs.push(value) },
      },
    );
    const reply = (await response.json()) as any;
    assert.equal(reply.result.isError, true);
    assert.equal(engines, 0);
    const expected = { unknown: ["unexpected"], missing: ["device_id", "idempotency_key"] };
    assert.deepEqual(reply.result.structuredContent.invalid_arguments, expected);
    assert.deepEqual(JSON.parse(reply.result.content[0].text).invalid_arguments, expected);
    assert.doesNotMatch(JSON.stringify([reply, logs]), /SECRET_TEXT|SECRET_VALUE/);
  }
});
test("production MCP static dependency graph excludes diagnostic pixels and HTML", () => {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (
        (ts.isExportDeclaration(node) && node.isTypeOnly) ||
        (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
      )
        continue;
      const spec = node.moduleSpecifier;
      if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith(".")) continue;
      const base = resolve(dirname(file), spec.text);
      const next = [base, base + ".ts", base + ".mjs", base + ".js"].find((p) => existsSync(p));
      if (next && /\.(ts|mjs|js)$/.test(next)) walk(next);
    }
  };
  walk(resolve("lib/mcp-protocol.ts"));
  for (const file of seen)
    assert.doesNotMatch(
      file,
      /benchmark-(images|jpegs|previews|widget|renderer-probe|frame|resources)/,
    );
  const protocol = readFileSync("lib/mcp-protocol.ts", "utf8");
  assert.doesNotMatch(
    protocol,
    /layoutProbeDevice|layoutProbeText|browseRegion|browseScene|browseStep|browseNames|combinedSearchTools|planImageTools|preparationImageTools|INVALID_APP_SEARCH_CONTINUATION/,
  );
});
test("lightweight diagnostic case identifiers stay aligned with the actual fixtures", async () => {
  const runtime = await import("../lib/benchmark-frame.ts");
  assert.deepEqual(benchmarkCaseIDs, runtime.benchmarkCaseIDs);
});
