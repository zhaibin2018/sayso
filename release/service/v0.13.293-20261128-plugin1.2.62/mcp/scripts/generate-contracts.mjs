import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { deviceRoutes, contractVersion, uuidSchema } from "../lib/device-contract.ts";
import {
  currentCapabilityContract,
  currentActionCapabilities,
} from "../lib/current-action-capabilities.ts";
import { runtimeName, runtimeVersion } from "../lib/runtime-identity.ts";

const root = resolve(import.meta.dirname, ".."),
  check = process.argv.includes("--check");
const iosIndex = process.argv.indexOf("--ios"),
  ios = iosIndex < 0 ? null : resolve(process.argv[iosIndex + 1]);
const publicTools = mcpToolsForAudience(),
  developmentTools = mcpToolsForAudience("development");
const declared = Object.fromEntries(
  [...currentCapabilityContract.hardware, ...currentCapabilityContract.app].map((key) => [
    key,
    true,
  ]),
);
const appCapabilities = Object.keys(currentActionCapabilities(declared, "usb_ncm"))
  .filter((key) => key.startsWith("sayso."))
  .sort();
if (JSON.stringify(appCapabilities) !== JSON.stringify([...currentCapabilityContract.app].sort()))
  throw Error("Capability declaration and binding disagree");
const contract = {
  schema: contractVersion,
  runtime: { name: runtimeName, version: runtimeVersion },
  production_mcp_path: "/mcp",
  development_mcp_path: "/mcp/development",
  public_tools: publicTools,
  development_tools: developmentTools.filter(
    (tool) => !publicTools.some((publicTool) => publicTool.name === tool.name),
  ),
  device_routes: deviceRoutes,
  hardware_capabilities: currentCapabilityContract.hardware,
  app_capabilities: appCapabilities,
  action_rules: {
    decision_boundary: "between_tool_calls",
    source_use_time_limit_ms: null,
    changed_screen_policy: "informational_only",
    click_diagnostics: [
      "source_age_ms",
      "screen_changed_since_source",
      "source_observed_at_server_utc_ms",
    ],
    default_after_image_wait_ms: 5000,
    maximum_released_image_age_exclusive_ms: 2000,
    unknown_input: "read_original_id_or_key_only",
    counted_text_recovery: {
      candidate_max_text_len: 150,
      legacy_append_max_text_len: 64,
      legacy_clear_max_text_len: 60,
      input_lease_ms: 3000,
      renewal_interval_ms: 1000,
      evidence: "exact_count_terminal_release_and_newer_released_image",
      continuation: "new_id_and_key_exact_unsent_suffix_original_remains_locked",
      server_splitting: false,
    },
    source_reference_is_authority: false,
  },
};
const responses = {
  200: { description: "Domain result or JSON-RPC result/error" },
  204: { description: "No queued command" },
  400: { description: "Malformed request" },
  401: { description: "Authentication required" },
  403: { description: "Scope or permission rejected" },
  409: { description: "Current authority, command or image conflict" },
  422: { description: "Invalid current contract" },
};
const paths = {};
for (const route of deviceRoutes) {
  const path = "/v1/device/" + route.path;
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: uuidSchema,
  }));
  paths[path] ??= {};
  paths[path][route.method.toLowerCase()] = {
    operationId: route.key,
    parameters,
    security: route.authority === "pairing_code" ? [] : [{ DeviceBearer: [] }],
    "x-sayso-authority": route.authority,
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: {
              [route.key === "frame" ? "image/jpeg" : "application/json"]: {
                schema: route.body,
              },
            },
          },
        }
      : {}),
    responses,
  };
}
for (const [path, tools] of [
  ["/mcp", publicTools],
  ["/mcp/development", developmentTools],
])
  paths[path] = {
    post: {
      operationId: path === "/mcp" ? "productionMcp" : "developmentMcp",
      ...(path === "/mcp/development" ? { "x-build-condition": "SAYSO_BUILD_DIAGNOSTICS=1" } : {}),
      description:
        "MCP JSON-RPC. Authenticated identity is supplied by the Sites gateway; device actions retain owner and current-grant checks.",
      "x-sites-authentication": true,
      "x-mcp-tools": tools,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                jsonrpc: { const: "2.0" },
                id: { type: ["string", "number"] },
                method: { type: "string" },
                params: { type: "object" },
              },
              required: ["jsonrpc", "method"],
            },
          },
        },
      },
      responses,
    },
  };
paths["/internal/retention"] = {
  post: {
    operationId: "retentionMaintenance",
    "x-sites-private-access-required": true,
    security: [{ RetentionMaintenance: [] }],
    description:
      "Scheduled maintenance only. Requires private Site service access and a separate X-SaySo-Retention-Key. No device operation or user content is returned.",
    responses,
  },
};
const openapi = {
  openapi: "3.1.0",
  info: {
    title: "SaySo current Worker API",
    version: runtimeVersion,
    description:
      "Generated from the runtime route registry and MCP catalogue. Device schemas specify envelopes; lease, ownership, original receipt and image-order semantics remain enforced by domain services and regression tests.",
  },
  paths,
  components: {
    securitySchemes: {
      DeviceBearer: { type: "http", scheme: "bearer" },
      RetentionMaintenance: { type: "apiKey", in: "header", name: "X-SaySo-Retention-Key" },
    },
  },
};
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const outputs = [
  [join(root, "contracts/current-actions.json"), json(contract)],
  [join(root, "contracts/openapi.json"), json(openapi)],
];
if (ios) outputs.push([join(ios, "NetworkTests/Contracts/current-actions.json"), json(contract)]);
for (const [file, content] of outputs) {
  if (check) {
    if (readFileSync(file, "utf8") !== content) throw Error("Generated contract is stale: " + file);
  } else {
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
}
console.log(
  JSON.stringify({
    checked: check,
    public_tools: publicTools.length,
    development_tools: contract.development_tools.length,
    device_routes: deviceRoutes.length,
    contract_sha256: createHash("sha256").update(json(contract)).digest("hex"),
  }),
);
