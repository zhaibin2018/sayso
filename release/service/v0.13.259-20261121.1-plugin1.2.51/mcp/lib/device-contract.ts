export const contractVersion = "current-actions.v1";
export const uuidSchema = { type: "string", format: "uuid" };
const scopeProperties = {
  bridge_session_id: uuidSchema,
  broadcast_id: uuidSchema,
  worker_id: uuidSchema,
  lease_epoch: { type: "integer", minimum: 1 },
};
const jsonBody = { type: "object", additionalProperties: true };
export const currentClaimSchema = {
  type: "object",
  properties: {
    ...scopeProperties,
    event_clock: { type: "object", additionalProperties: true },
    control_epoch: { type: "integer", minimum: 1 },
    raw_dispatch_protocol: { const: "raw_mouse_claim_start.v1" },
    point_protocol: { enum: ["paired_mouse_point.v1", null] },
    spotlight_dispatch_protocol: { const: "spotlight_claim_start.v1" },
    raw_dispatch_ttl_profiles: {
      type: "array",
      maxItems: 1,
      uniqueItems: true,
      items: { const: "scope_only_system_search.v1" },
    },
  },
  required: [...Object.keys(scopeProperties), "control_epoch", "raw_dispatch_protocol"],
  additionalProperties: false,
};
// Dispatch and generated documentation share this registry. Domain services
// retain semantic authority, lease, signature and receipt validation.
export const deviceRoutes = [
  {
    key: "pair",
    method: "POST",
    path: "pair",
    authority: "pairing_code",
    body: jsonBody,
  },
  {
    key: "frame",
    method: "POST",
    path: "frame",
    authority: "atomic_device",
    body: { type: "string", format: "binary" },
  },
  {
    key: "observation",
    method: "POST",
    path: "frame-observation",
    authority: "atomic_device",
    body: jsonBody,
  },
  {
    key: "mouseClaim",
    method: "POST",
    path: "mouse/commands/claim",
    authority: "atomic_device",
    body: currentClaimSchema,
  },
  {
    key: "mouseResult",
    method: "POST",
    path: "mouse/commands/{command_id}/result",
    authority: "atomic_device",
    body: jsonBody,
  },
  { key: "status", method: "GET", path: "status", authority: "device" },
  { key: "sharingPreflight", method: "GET", path: "sharing/preflight", authority: "device" },
  { key: "phoneRename", method: "POST", path: "name", authority: "device", body: jsonBody },
  { key: "requests", method: "GET", path: "requests", authority: "device" },
  {
    key: "mouseGrant",
    method: "POST",
    path: "mouse/grant",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "mouseStart",
    method: "POST",
    path: "mouse/commands/{command_id}/start",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "hardwareBind",
    method: "POST",
    path: "hardware/bind",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "sessionCreate",
    method: "POST",
    path: "sessions",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "workerClaim",
    method: "POST",
    path: "worker/claim",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "cancelReceipt",
    method: "POST",
    path: "mouse/cancel-receipt",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "heartbeat",
    method: "POST",
    path: "worker/heartbeat",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "clockProbe",
    method: "POST",
    path: "clock-probes",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "sessionStop",
    method: "POST",
    path: "sessions/{session_id}/stop",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "captureState",
    method: "POST",
    path: "state",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "unpair",
    method: "POST",
    path: "unpair",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "pushToken",
    method: "POST",
    path: "push-token",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "requestAck",
    method: "POST",
    path: "requests/{request_id}/ack",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "ledClaim",
    method: "POST",
    path: "commands/claim",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "ledStart",
    method: "POST",
    path: "commands/{command_id}/start",
    authority: "device",
    body: jsonBody,
  },
  {
    key: "ledResult",
    method: "POST",
    path: "commands/{command_id}/result",
    authority: "device",
    body: jsonBody,
  },
] as const;
export type DeviceRoute = (typeof deviceRoutes)[number];
export type DeviceOperation = DeviceRoute["key"];
export const retiredDevicePath = (path: string) =>
  path === "screen-text" ||
  /^(?:app-search-preparations|pointer-actions|browse|capture-requests)(?:\/|$)/.test(path);
const compiled = deviceRoutes.map((route) => ({
  route,
  parameters: [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
  pattern: new RegExp("^" + route.path.replace(/\{\w+\}/g, "([0-9a-f-]+)") + "$", "i"),
}));
export function matchDeviceRoute(method: string, path: string) {
  for (const { route, parameters, pattern } of compiled) {
    if (method !== route.method) continue;
    const match = pattern.exec(path);
    if (match)
      return {
        route,
        parameters: Object.fromEntries(parameters.map((key, index) => [key, match[index + 1]])),
      };
  }
  return null;
}
