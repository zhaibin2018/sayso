import {
  BridgeError,
  hash,
  record,
  text,
  uuid,
  type BridgeEngine,
  type User,
} from "./bridge-engine.ts";
import { createHash } from "node:crypto";
import {
  MouseControl,
  SYSTEM_SEARCH_KIND,
  type ClickAfterReleaseRecovery,
} from "./mouse-control.ts";
import { authorizedFieldText, focusedTextKind } from "./spotlight-command.ts";
import { rejectSensitiveInput } from "./sensitive-input.ts";
import { mouseAdmissionAuthority, mouseAdmissionJoin } from "./mouse-admission-policy.ts";
import { databaseNowSQL as clock } from "./screen-snapshot-query.ts";
import { actionAfterImageAgeLimitMS } from "./read-policy.ts";
import type { AppSearchFence } from "./app-search-fence.ts";

const object = (v: unknown) =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
type Options = {
  signal?: AbortSignal;
  registerRelease?: (recovery: ClickAfterReleaseRecovery) => void;
};
type Parent = {
  id: string;
  digest: string;
  reason: string;
  finished_at: number | null;
  native_review_state: string;
};
export function searchReady(value: Record<string, unknown>) {
  const after = object(value.after_screen),
    m = object(after.metadata),
    order = object(after.after_command),
    receipt = object(value.receipt_observation),
    effect = object(object(value.board_receipt).effect);
  return (
    value.kind === SYSTEM_SEARCH_KIND &&
    value.state === "board_acked" &&
    value.error == null &&
    value.input_not_submitted !== true &&
    effect.system_search_stable === true &&
    effect.all_released === true &&
    receipt.valid_for_capture_order === true &&
    typeof value.image === "string" &&
    value.image.length > 0 &&
    after.state === "available" &&
    order.command_id === value.command_id &&
    order.command_state === "board_acked" &&
    order.relation === "capture_after_phone_board_ack" &&
    order.scope_matches_at_snapshot === true &&
    m.capture_clock_verified === true &&
    typeof m.age_ms === "number" &&
    m.age_ms >= 0 &&
    m.age_ms < actionAfterImageAgeLimitMS &&
    m.device_id === value.device_id &&
    m.bridge_session_id === value.bridge_session_id &&
    m.control_epoch_at_read === value.control_epoch &&
    m.worker_id === object(receipt.scope).worker_id &&
    m.lease_epoch === object(receipt.scope).lease_epoch
  );
}
const stopped = (v: Record<string, unknown>) =>
  v.state === "cancelled" ||
  String(v.error ?? "").includes("CANCEL") ||
  String(v.error ?? "").includes("STOP");
const asUUID = (seed: string) =>
  seed.slice(0, 8) +
  "-" +
  seed.slice(8, 12) +
  "-4" +
  seed.slice(13, 16) +
  "-a" +
  seed.slice(17, 20) +
  "-" +
  seed.slice(20, 32);

/** Persistent admission claim: a replay is read-only, including a crash between child steps. */
export async function openAppSearch(
  e: BridgeEngine,
  user: User,
  args: Record<string, unknown>,
  requestID: string,
  options: Options = {},
): Promise<Record<string, unknown>> {
  const deadline = performance.now() + 12000;
  const expired = () => performance.now() >= deadline;
  const device = uuid(args.device_id),
    name = text(args.app_name, 150),
    rawKey = text(args.idempotency_key, 120);
  rejectSensitiveInput(name);
  authorizedFieldText({ text: name });
  const seed = await hash("open_app_search:" + user.id + ":" + device + ":" + rawKey);
  const operation = asUUID(seed),
    planned = {
      search: asUUID(await hash(seed + ":search")),
      type: asUUID(await hash(seed + ":text")),
    };
  const digest = await e.textRequestDigest(user.id, device, rawKey, "open_app_search:" + name);
  const mouse = new MouseControl(e),
    keys = {
      shortcut: `app-search-query:${operation}:shortcut`,
      text: `app-search-query:${operation}:text`,
    };
  let q: D1Result<Parent>[];
  try {
    q = await e.batch<Parent>([
      e.stmt(
        `INSERT INTO sb_app_search_queries(id,owner_id,device_id,digest,created_at,reason,native_review_state)
      SELECT ?,d.owner_id,d.id,?,${clock},'OPEN_APP_SEARCH_ACTIVE',json_object('session',s.id,'broadcast',s.broadcast_id,'worker',d.worker_id,
        'lease',d.lease_epoch,'control',s.control_epoch,'hardware',h.hardware_id,'boot',h.board_boot_id,'search_id',?,'type_id',?)
      ${mouseAdmissionJoin} WHERE d.id=? AND d.owner_id=? AND ${mouseAdmissionAuthority(clock)}
      ON CONFLICT(owner_id,id) DO NOTHING`,
        operation,
        digest,
        planned.search,
        planned.type,
        device,
        user.id,
      ),
      e.stmt(
        "SELECT * FROM sb_app_search_queries WHERE id=? AND owner_id=? AND device_id=?",
        operation,
        user.id,
        device,
      ),
    ]);
  } catch {
    return {
      operation_id: operation,
      state: "outcome_unknown",
      step: "open_search",
      code: expired() ? "APP_SEARCH_BUDGET_EXHAUSTED" : "OPERATION_UNCONFIRMED",
      ...(expired() ? {completed_step:"none",budget_ms:12000} : {}),
      command_id: null,
      search_command_id: null,
      type_command_id: null,
      enter_sent: false,
    };
  }
  const parent = q[1].results[0];
  if (!parent)
    return {
      operation_id: operation,
      state: "failed",
      step: "open_search",
      code: expired() ? "APP_SEARCH_BUDGET_EXHAUSTED" : "SEARCH_NOT_OPEN",
      ...(expired() ? {completed_step:"none",budget_ms:12000} : {}),
      step_error: "APP_SEARCH_CONTROL_CHANGED",
      command_id: null,
      search_command_id: null,
      type_command_id: null,
      input_not_submitted: true,
      enter_sent: false,
    };
  if (parent.digest !== digest) throw new BridgeError("IDEMPOTENCY_CONFLICT", 409);
  let latest: Record<string, unknown> = {},
    searchID: string | null = null,
    typeID: string | null = null,
    step = "open_search";
  let completedStep = "none";
  const finish = async (code: string) => {
    if (expired() && code !== "STOPPED") code = "APP_SEARCH_BUDGET_EXHAUSTED";
    let saved = true;
    try {
      const [result] = await e.batch<{ reason: string }>([
        e.stmt(
          "UPDATE sb_app_search_queries SET finished_at=COALESCE(finished_at,?),reason=CASE WHEN finished_at IS NULL THEN ? ELSE reason END WHERE id=? AND owner_id=? RETURNING reason",
          e.now(),
          code,
          operation,
          user.id,
        ),
      ]);
      if (result.results[0]?.reason === "STOPPED") code = "STOPPED";
    } catch {
      saved = false;
    }
    if (expired() && code !== "STOPPED") code = "APP_SEARCH_BUDGET_EXHAUSTED";
    return {
      ...latest,
      ...(code === "APP_SEARCH_BUDGET_EXHAUSTED" ? {image: undefined, image_usable_for_input: false,
        completed_step: completedStep, budget_ms: 12000, step_error: code} : {}),
      operation_id: operation,
      search_command_id: searchID,
      type_command_id: typeID,
      step_command_id: step === "open_search" ? searchID : typeID,
      step,
      code,
      enter_sent: false,
      parent_state_persisted: saved,
    };
  };
  if (q[0].meta.changes !== 1) {
    try {
      const children = await e
        .stmt(
          "SELECT id,kind FROM sb_mouse_commands WHERE owner_id=? AND device_id=? AND idempotency_key IN (?,?)",
          user.id,
          device,
          keys.shortcut,
          keys.text,
        )
        .all<{ id: string; kind: string }>();
      searchID = children.results.find((c) => c.kind === SYSTEM_SEARCH_KIND)?.id ?? null;
      typeID = children.results.find((c) => c.kind !== SYSTEM_SEARCH_KIND)?.id ?? null;
      const original = typeID ?? searchID;
      if (original) latest = await mouse.getSpotlightObserved(user, original, requestID, {...options, operationDeadline: deadline});
      return {
        ...latest,
        operation_id: operation,
        search_command_id: searchID,
        type_command_id: typeID,
        step: typeID ? "type_name" : "open_search",
        code: parent.finished_at === null ? "OPERATION_ALREADY_STARTED" : parent.reason,
        ...(expired() ? {code:"APP_SEARCH_BUDGET_EXHAUSTED",completed_step:"original_command_observation",
          budget_ms:12000,image:undefined,image_usable_for_input:false} : {}),
        enter_sent: false,
      };
    } catch {
      return {
        operation_id: operation,
        state: "outcome_unknown",
        step: "observe_original",
        code: "OPERATION_UNCONFIRMED",
        search_command_id: planned.search,
        type_command_id: planned.type,
        command_ids_preallocated: true,
        enter_sent: false,
      };
    }
  }
  try {
    if (options.signal?.aborted) return finish("STOPPED");
    if (expired()) return finish("APP_SEARCH_BUDGET_EXHAUSTED");
    const fence: AppSearchFence = { operation };
    searchID = planned.search;
    latest = await mouse.enqueueObserved(
      user,
      SYSTEM_SEARCH_KIND,
      { device_id: device, idempotency_key: keys.shortcut, settle_ms: 300 },
      requestID,
      { signal: options.signal, serverSearch: fence, commandID: searchID, operationDeadline: deadline },
    );
    searchID = typeof latest.command_id === "string" ? latest.command_id : null;
    if (options.signal?.aborted || stopped(latest)) return finish("STOPPED");
    if (latest.state === "board_acked") completedStep = "search_command_acked";
    if (expired()) return finish("APP_SEARCH_BUDGET_EXHAUSTED");
    while (true) {
      if (options.signal?.aborted || stopped(latest)) return finish("STOPPED");
      if (latest.state === "board_acked" && completedStep === "none") completedStep = "search_command_acked";
      if (expired()) return finish("APP_SEARCH_BUDGET_EXHAUSTED");
      if (!searchReady(latest)) {
        if (
          !["queued", "claimed", "executing", "board_acked"].includes(String(latest.state)) ||
          latest.error != null
        )
          return finish("SEARCH_NOT_OPEN");
      } else {
        completedStep = "search_after_image";
        const m = object(object(latest.after_screen).metadata);
        // Admission still checks current scope, original ACK, pixels and Stop atomically.
        step = "type_name";
        typeID = planned.type;
        let typed: Record<string, unknown> | null = null;
        try {
          typed = await mouse.enqueueAuthorizedFieldObserved(
            user,
            { device_id: device, idempotency_key: keys.text, text: name, clear_before_input: true },
            requestID,
            {
              ...options,
              operationDeadline: deadline,
              commandID: typeID,
              serverSearch: {
                ...fence,
                shortcut: searchID!,
                frame: String(m.frame_id),
                sha256: createHash("sha256")
                  .update(Buffer.from(String(latest.image), "base64"))
                  .digest("hex"),
                orientation: Number(m.orientation_epoch),
              },
            },
          );
        } catch (error) {
          // This error is raised only after the transaction reads back no command.
          // A newer capture may have replaced the qualified image. Reobserve the
          // original search; never retry an inserted or uncertain input command.
          if (!(error instanceof BridgeError) || error.code !== "FIELD_CONTROL_CHANGED_OR_BUSY")
            throw error;
          const parent = await e.stmt("SELECT reason FROM sb_app_search_queries WHERE id=? AND owner_id=?", operation, user.id).first<{reason: string}>();
          if (parent?.reason !== "OPEN_APP_SEARCH_ACTIVE") throw error;
          typeID = null;
        }
        if (typeID !== null) {
          if (!typed) return finish("TEXT_UNCONFIRMED");
          latest = typed;
          typeID = String(typed.command_id);
          break;
        }
      }
      step = "open_search";
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, Math.min(150, deadline - performance.now()))),
      );
      if (options.signal?.aborted) return finish("STOPPED");
      if (expired()) return finish("APP_SEARCH_BUDGET_EXHAUSTED");
      latest = await mouse.getSpotlightObserved(user, searchID!, requestID, {
        ...options,
        operationDeadline: deadline,
      });
    }
    if (latest.state === "board_acked") completedStep = object(latest.after_screen).state === "available" ? "type_after_image" : "type_command_acked";
    if (options.signal?.aborted || stopped(latest)) return finish("STOPPED");
    return finish(
      latest.state === "board_acked" &&
        object(latest.after_screen).state === "available" &&
        typeof latest.image === "string"
        ? "NEEDS_TARGET_REVIEW"
        : "TEXT_UNCONFIRMED",
    );
  } catch (error) {
    const original = typeID ?? searchID;
    if (expired()) return finish(options.signal?.aborted ? "STOPPED" : "APP_SEARCH_BUDGET_EXHAUSTED");
    if (original) {
      latest = {
        image: latest.image,
        after_screen: latest.after_screen,
        bridge_session_id: latest.bridge_session_id,
        command_id: original,
        state: "outcome_unknown",
        device_id: device,
        kind: step === "type_name" ? focusedTextKind : SYSTEM_SEARCH_KIND,
        verification: "not_confirmed",
        app_effect_observed: false,
        image_observation: "before_unconfirmed_step",
        image_usable_for_input: false,
      };
      try {
        latest = await mouse.getSpotlightObserved(user, original, requestID, {...options, operationDeadline: deadline});
      } catch {}
    }
    let reason: string | null = null;
    try {
      reason =
        (
          await e
            .stmt(
              "SELECT reason FROM sb_app_search_queries WHERE id=? AND owner_id=?",
              operation,
              user.id,
            )
            .first<{ reason: string }>()
        )?.reason ?? null;
    } catch {}
    const code = error instanceof BridgeError ? error.code : "INTERNAL_ERROR";
    latest = { ...latest, step_error: code };
    return finish(
      reason === "STOPPED" || options.signal?.aborted || code.includes("CANCEL")
        ? "STOPPED"
        : step === "open_search"
          ? "SEARCH_NOT_OPEN"
          : "TEXT_UNCONFIRMED",
    );
  }
}
