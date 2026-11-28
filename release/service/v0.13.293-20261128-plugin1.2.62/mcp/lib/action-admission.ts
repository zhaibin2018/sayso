import { BridgeError, uid, uuid, type BridgeEngine, type User } from "./bridge-engine.ts";
import {
  releasedStaticInput,
  staticInputCurrent,
  staticInputSQL,
  screenChangedSinceImage,
} from "./static-input-freshness.ts";

/** source_json is written only after local signature verification, in the same
 * transaction/version as its proof. Legacy rows take the original verifier path.
 * Neither the context nor a signature can replace current admission authority. */
export async function staticAdmission<T>(
  e: BridgeEngine,
  user: User,
  device: string,
  frame: string | undefined,
  work: (context: {
    cte: string;
    values: unknown[];
    condition: (base: string) => string;
    gate: (clock: string) => string;
    proof: string;
  }) => Promise<T>,
): Promise<T> {
  const signer = await e.visualInputSigner();
  const execute = (legacy?: string) => {
    const proof = "(SELECT proof FROM action_static)",
      raw = "(SELECT source_json FROM action_released)";
    const cte =
      legacy !== undefined
        ? "action_static AS (SELECT ? AS proof)"
        : `action_released AS MATERIALIZED (SELECT CASE WHEN expires_at<=max(?,${databaseClock}) THEN 'null' WHEN json_extract(source_json,'$.context_signer')=? THEN source_json ELSE NULL END AS source_json FROM sb_released_system_search_field_proofs
        WHERE owner_id=? AND device_id=? AND command_id='visual_read' ${frame ? "AND frame_id=?" : ""}
        ORDER BY expires_at DESC,rowid DESC LIMIT 1),
       action_static AS MATERIALIZED (SELECT CASE WHEN EXISTS(SELECT 1 FROM action_released) AND ${raw} IS NULL
         THEN json_extract('[]','$[SAYSO_STATIC_CONTEXT_REQUIRED')
         WHEN json_extract(${raw},'$.staticScreen')=1 THEN ${raw} ELSE NULL END AS proof)`;
    return work({
      cte,
      values:
        legacy !== undefined
          ? [legacy === "null" ? null : legacy]
          : [e.now(), signer, user.id, device, ...(frame ? [frame] : [])],
      proof,
      condition: (base) =>
        `NULLIF(json_patch(COALESCE(${base},'{}'),json_object('static_input',json(${proof}))),'{}')`,
      gate: (clock) => `(${proof} IS NULL OR ${staticInputSQL(clock, proof)})`,
    });
  };
  try {
    return await execute(e.releasedFieldViewProofAvailable ? undefined : "null");
  } catch (error) {
    if (!String(error).includes("SAYSO_STATIC_CONTEXT_REQUIRED")) throw error;
    const proof = await releasedStaticInput(e, user, device, frame);
    return execute(JSON.stringify(proof));
  }
}
export async function checkStaticAdmission(
  e: BridgeEngine,
  user: User,
  device: string,
  frame?: string,
) {
  const proof = await releasedStaticInput(e, user, device, frame);
  if (proof && !(await staticInputCurrent(e, user, proof)))
    throw new BridgeError(screenChangedSinceImage);
}

/** Direct wheel and system-search admission does not need a JS readiness
 * snapshot. Scope/capabilities are selected and fenced inside the INSERT. */
export async function admitPrimitive<T>(
  e: BridgeEngine,
  user: User,
  kind: string,
  device: string,
  payload: string,
  key: string,
  digest: string,
  gap: number | undefined,
  policy: {
    join: string;
    authority: (clock: string) => string;
    available: string;
    expiration: () => D1PreparedStatement;
    readback: () => D1PreparedStatement;
    commandID?:string;
  },
) {
  const search = kind === "keyboard.open_search",
    id = policy.commandID===undefined?uid():uuid(policy.commandID),
    clock = "action_clock.now",
    now = e.now();
  const capabilities = search
    ? ["hid.keyboard.system_search", "sayso.system_search", "sayso.system_search.scope_only.v1"]
    : ["hid.mouse.scroll"];
  const condition = JSON.stringify(
    search
      ? { system_search_mode: "scope_only.v1", capture_min_gap_ms: gap }
      : gap === undefined
        ? null
        : { capture_min_gap_ms: gap },
  );
  return staticAdmission(e, user, uuid(device), undefined, async (ctx) => {
    const result = await e.batch<T>([
      policy.expiration(),
      e.stmt(
        `WITH ${ctx.cte},action_clock AS (SELECT max(?,${databaseClock}) AS now)
      INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at,worker_id,lease_epoch)
      SELECT ?,d.owner_id,d.id,s.id,h.hardware_id,h.board_boot_id,?,?,?,?,${search ? "?" : ctx.condition("?")},'queued',s.control_epoch,${clock},${clock}+5000,d.worker_id,d.lease_epoch
      ${policy.join} CROSS JOIN action_clock WHERE d.id=? AND d.owner_id=? AND ${policy.authority(clock)}
      AND ${capabilities.map((c) => `json_type(h.metadata,'$.capabilities."${c}"')='true'`).join(" AND ")}
      ${policy.available} ${search ? "" : "AND " + ctx.gate(clock)}
      ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING`,
        ...ctx.values,
        now,
        id,
        kind,
        payload,
        digest,
        key,
        condition,
        device,
        user.id,
      ),
      policy.readback(),
    ]);
    return result[2].results[0] ?? null;
  });
}
const databaseClock = "CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
