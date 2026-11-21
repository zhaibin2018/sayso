import type { BridgeEngine, User } from "./bridge-engine.ts";
import { homeStatus } from "./home-status.ts";

/** Run only after the final image-release check reports no image. */
export async function missingScreenStatus(
  response: Response,
  engine: BridgeEngine,
  user: User,
  selected: unknown,
) {
  const body = (await response.clone().json()) as {
    result: { structuredContent: Record<string, unknown>; content: Record<string, unknown>[] };
  };
  const result = body.result,
    fields = result.structuredContent;
  let devices: Awaited<ReturnType<BridgeEngine["listDevices"]>>;
  try {
    devices = await engine.listDevices(user, typeof selected === "string" ? selected : undefined);
  } catch {
    // A supplementary status lookup must not replace the original no-image result.
    result.structuredContent = {
      ...fields,
      home_status: null,
      home_status_error: "STATUS_UNAVAILABLE",
    };
    result.content = [
      ...result.content,
      {
        type: "text",
        text: JSON.stringify({ home_status: null, home_status_error: "STATUS_UNAVAILABLE" }),
      },
    ];
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(JSON.stringify(body), { status: response.status, headers });
  }
  // Do not substitute another owned phone for an unavailable explicit selector.
  if (selected != null && devices.length === 0) return response;
  const additions: Record<string, unknown> =
    devices.length <= 1
      ? {
          home_status:
            devices[0]?.home_status ??
            homeStatus({
              online: false,
              accessoryBound: false,
              usbConnected: false,
              session: null,
            }),
        }
      : {
          home_status: null,
          home_status_devices: devices.map(({ device_id, name, home_status }) => ({
            device_id,
            name,
            home_status,
          })),
        };
  if (Array.isArray(fields.devices))
    additions.devices = fields.devices.map((device) => {
      const row = device as Record<string, unknown>;
      return {
        ...row,
        home_status:
          devices.find((candidate) => candidate.device_id === row.device_id)?.home_status ?? null,
      };
    });
  result.structuredContent = { ...fields, ...additions };
  result.content = [...result.content, { type: "text", text: JSON.stringify(additions) }];
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}
