import { clockProbeRequest } from "./clock-probe-request.ts";
import { withFrameErrors, frameStage, logFrameFailure } from "./frame-error-classification.ts";
import { heartbeatRequest } from "./heartbeat-request.ts";
import { withAtomicDevice, setAtomicBody, atomicState } from "./hot-path-context.ts";
import { otherSharingPhones, renamePhone, replacementHeartbeat } from "./phone-sharing.ts";
import { saveCancellationReceipt } from "./cancel-receipt.ts";
import {
  decodeEventBody,
  encodeEventBody,
  publicEventResult,
  rememberWireBody,
  type EventClock,
} from "./event-clock.ts";
import { requireEventClock } from "./event-clock-scope.ts";
import { opportunisticRetention } from "./opportunistic-retention.ts";
import { requireDeviceSigning } from "./signing-policy.ts";
import {
  BridgeError,
  integer,
  record,
  text,
  uuid,
  type BridgeEngine,
  type Device,
} from "./bridge-engine.ts";
import { boundedBody } from "./bounded-body.ts";
import { LEDControl } from "./led-control.ts";
import { MouseControl, livePointClaimHints, livePointReceiptHints } from "./mouse-control.ts";
import { logAuthorizedPairedGrant } from "./paired-grant-timing.ts";
import {
  matchDeviceRoute,
  retiredDevicePath,
  currentClaimSchema,
  type DeviceOperation,
} from "./device-contract.ts";
import { matchesContract } from "./contract-validation.ts";
import { DeviceControlRepository } from "./device-control-repository.ts";
import { readFrameHeaders } from "./device-frame-headers.ts";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
const optional = (value: unknown) => (value ? json(value) : new Response(null, { status: 204 }));
type Context = {
  request: Request;
  service: BridgeEngine;
  device?: Device;
  parameters: Record<string, string>;
  frame: () => Record<string, unknown>;
  started: number;
  body: (timeoutMS?: number) => Promise<Record<string, unknown>>;
  wait: () => number;
};
const authorized = (c: Context) => {
  if (!c.device) throw new BridgeError("UNAUTHENTICATED", 401);
  return c.device;
};
const mouse = (c: Context) =>
  new MouseControl(c.service, {
    claimHints: livePointClaimHints,
    receiptHints: livePointReceiptHints,
  });
const leds = (c: Context) => new LEDControl(c.service);
const storage = (c: Context) => new DeviceControlRepository(c.service);

const handlers: Record<DeviceOperation, (c: Context) => Promise<Response>> = {
  pair: async (c) =>
    json(
      await c.service.redeem(
        await c.body(),
        c.request.headers.get("cf-connecting-ip") ?? "site-service",
      ),
    ),
  frame: async (c) =>
    json(
      await c.service.acceptFrameRequest(
        c.request,
        () => c.frame(),
        (limit) => boundedBody(c.request, limit ?? 1024 * 1024),
      ),
    ),
  observation: async (c) =>
    json(await c.service.acceptObservationRequest(c.request, () => c.body(1500))),
  mouseClaim: async (c) => {
    const command = await mouse(c).claimRequest(c.request, async () => {
      const body = await c.body(1500);
      if (!matchesContract(body, currentClaimSchema))
        throw new BridgeError("CURRENT_ACTION_PROTOCOL_REQUIRED", 422);
      return { body, waitMS: c.wait() };
    });
    logAuthorizedPairedGrant(command, c.started, Date.now());
    return optional(command);
  },
  mouseResult: async (c) =>
    json(
      await mouse(c).resultRequest(c.request, c.parameters.command_id, async () => {
        const body = await c.body();
        c.wait();
        return body;
      }),
    ),
  status: async (c) => {
    const status = await c.service.status(authorized(c));
    const fresh = c.request.headers
      .get("Cache-Control")
      ?.split(",")
      .some((directive) => directive.trim().toLowerCase() === "no-store");
    return json(fresh ? { ...status, server_time_ms: Math.trunc(c.service.now()) } : status);
  },
  sharingPreflight: async (c) => json(await otherSharingPhones(c.service, authorized(c))),
  phoneRename: async (c) => json(await renamePhone(c.service, authorized(c), await c.body())),
  requests: async (c) => json(await storage(c).manualRequests(authorized(c))),
  mouseGrant: async (c) => json(await mouse(c).grant(authorized(c), await c.body())),
  mouseStart: async (c) =>
    json(await mouse(c).start(authorized(c), c.parameters.command_id, await c.body())),
  hardwareBind: async (c) => json(await leds(c).bind(authorized(c), await c.body())),
  sessionCreate: async (c) => {
    const body = await c.body(),
      device = authorized(c);
    return json(
      body.mode === "foreground_diagnostic"
        ? await leds(c).createSession(device, body)
        : await c.service.createSession(device, body),
    );
  },
  workerClaim: async (c) => json(await c.service.claimWorker(authorized(c), await c.body())),
  cancelReceipt: async (c) =>
    json(await saveCancellationReceipt(c.service, authorized(c), await c.body())),
  heartbeat: async (c) => {
    const body = await c.body();
    if (atomicState() && body.broadcast_id != null && body.capture_state !== "stopped") {
      try {
        return json(await heartbeatRequest(c.service, body));
      } catch (error) {
        if (!(error instanceof BridgeError) || error.code !== "STALE_SESSION") throw error;
      }
    }
    const device = c.device ?? (c.device = await c.service.authenticate(c.request));
    let session: Awaited<ReturnType<BridgeEngine["session"]>>;
    try {
      session = await c.service.session(device, body);
    } catch (error) {
      if (body.broadcast_id != null) {
        const replacement = await replacementHeartbeat(c.service, device, body);
        if (replacement) return json(replacement);
      }
      throw error;
    }
    return json(
      session.mode === "foreground_diagnostic"
        ? await leds(c).heartbeat(device, body)
        : await c.service.heartbeat(device, body),
    );
  },
  clockProbe: async (c) =>
    atomicState()
      ? json(await clockProbeRequest(c.service, await c.body()))
      : json(
          await c.service.clockProbe(
            authorized(c),
            (await c.body()).frame_permit_scope,
            (await c.body()).event_clock as EventClock | undefined,
          ),
        ),
  sessionStop: async (c) => {
    const body = await c.body();
    return json(
      await c.service.stop(
        authorized(c),
        uuid(c.parameters.session_id),
        body.reason === "USER_STOPPED",
        body.reason == null ? "phone_stop" : text(body.reason, 300),
      ),
    );
  },
  captureState: async (c) => json(await storage(c).captureState(authorized(c), await c.body())),
  unpair: async (c) => {
    const device = authorized(c);
    return json(await c.service.revoke({ id: device.owner_id, label: "" }, device.id));
  },
  pushToken: async () => json({ notification_status: "not_configured" }),
  requestAck: async (c) =>
    json(
      await storage(c).acknowledgeRequest(authorized(c), c.parameters.request_id, await c.body()),
    ),
  ledClaim: async (c) => optional(await leds(c).claim(authorized(c), await c.body(), c.wait())),
  ledStart: async (c) =>
    json(await leds(c).start(authorized(c), c.parameters.command_id, await c.body())),
  ledResult: async (c) =>
    json(await leds(c).result(authorized(c), c.parameters.command_id, await c.body())),
};

export async function handleDeviceRequest(
  request: Request,
  dependencies: { engine: () => BridgeEngine; strictSigning?: boolean },
) {
  return withFrameErrors(request, async () => {
    const started = Date.now();
    try {
      const url = new URL(request.url),
        path = url.pathname.replace(/^\/v1\/device\//, "");
      if (retiredDevicePath(path)) throw new BridgeError("RETIRED_DEVICE_ENDPOINT", 410);
      const matched = matchDeviceRoute(request.method, path);
      if (!matched) throw new BridgeError("NOT_FOUND", 404);
      const service = dependencies.engine();
      const atomic =
        matched.route.authority === "atomic_device" ||
        ["clockProbe", "heartbeat"].includes(matched.route.key);
      const dispatch = async () => {
        const device =
          !atomic && matched.route.authority !== "pairing_code"
            ? await service.authenticate(request)
            : undefined;
        let parsed: Promise<Record<string, unknown>> | undefined;
        let clock: EventClock | null = null;
        const decode = async (raw: Record<string, unknown>) => {
          if (atomic) clock = setAtomicBody(raw);
          else if (device && matched.route.key !== "sessionCreate")
            clock = await requireEventClock(service, device, raw);
          if (!clock) return raw;
          try {
            return decodeEventBody(raw, clock);
          } catch {
            throw new BridgeError("EVENT_CLOCK_INVALID_BODY", 422);
          }
        };
        let frame: Record<string, unknown> | undefined;
        if (matched.route.key === "frame") frame = await decode(readFrameHeaders(request));
        const context: Context = {
          request,
          service,
          device,
          parameters: matched.parameters,
          frame: () => frame!,
          started,
          body: (timeoutMS) =>
            (parsed ??= boundedBody(request, 16_384, timeoutMS).then(async (bytes) => {
              const body = await decode(
                record(JSON.parse(new TextDecoder().decode(bytes) || "{}")),
              );
              if (clock) rememberWireBody(body, bytes);
              return body;
            })),
          wait: () => integer(Number(url.searchParams.get("wait_ms") ?? 0), 0, 10_000),
        };
        if (device && request.method === "POST" && matched.route.key !== "frame") {
          await context.body();
          context.wait();
        }
        if (dependencies.strictSigning)
          requireDeviceSigning(
            matched.route.key,
            service.releasedFieldViewProofAvailable,
            matched.route.key === "mouseGrant" ? await context.body() : undefined,
          );
        const result = await handlers[matched.route.key](context);
        frameStage("RETURN");
        if (
          (device || (atomic && matched.route.key === "heartbeat")) &&
          ["heartbeat", "mouseGrant", "sessionStop"].includes(matched.route.key)
        )
          await opportunisticRetention(service);
        if (result.status === 204) return result;
        const reply = await result.json();
        return json(
          clock ? encodeEventBody(reply, clock) : publicEventResult(reply),
          result.status,
        );
      };
      return atomic ? await withAtomicDevice(request, dispatch, service) : await dispatch();
    } catch (error) {
      logFrameFailure(error);
      return error instanceof BridgeError
        ? json({ error: { code: error.code, message: error.code } }, error.status)
        : json({ error: { code: "INTERNAL_ERROR", message: "请求未完成" } }, 500);
    }
  });
}
