import {currentActionCapabilities} from "./current-action-capabilities.ts";
import { BridgeEngine, need, uuid, integer, record, text, uid, hash, iso, type Device, type User } from "./bridge-engine.ts";
import { MouseControl,REVIEWED_POINT_CAPABILITY,REVIEWED_POINT_CROP_CAPABILITY,REVIEWED_POINT_COMPOUND_CAPABILITY,SYSTEM_SEARCH_BOARD_CAPABILITY,SYSTEM_SEARCH_CAPABILITY,SYSTEM_SEARCH_SCOPE_ONLY_CAPABILITY } from "./mouse-control.ts";
import { extendedModelReviewedFieldCapability, focusedTextCapability, focusedTextClearCapabilities, focusedTextLinkedAfterEnterCapability, focusedTextSubmitEnterCapability, modelReviewedFieldCapability, noVisualFieldCapability, spotlightCapability, spotlightProbeCapability, spotlightStableCapability, stableASCIICapability, stableASCIIEnterCapability } from "./spotlight-command.ts";
import {APP_SEARCH_CAPABILITY} from "./app-search-contract.ts";
import {DRAG_APP_CAPABILITY,DRAG_CAPABILITY,DRAG_RELATIVE_APP_CAPABILITY,DRAG_RELATIVE_CAPABILITY,DRAG_CLOUD_SOURCE_CAPABILITY,DRAG_DIRECT_CAPABILITY} from "./absolute-drag.ts";
import {DRAG_STATUS_MASK_CAPABILITY,DRAG_EXTENDED_REFERENCE_CAPABILITY,DRAG_MODEL_DECISION_CAPABILITY} from "./source-view-proof.ts";
import {scopeBoundFieldCapability,scopeBoundLinkedPointCapability,scopeBoundSystemSearchFieldCapability,visualReadPointCapability} from "./compound-query-view-proof.ts";
import {reviewedPointTTLCapability,scopedSearchTTLCapability} from "./raw-claim-ttl.ts";
import {reviewedPressCapability} from "./reviewed-press.ts";

type Hardware = { device_id: string; owner_id: string; hardware_id: string; board_boot_id: string; metadata: string; usb_connected: number };
type Command = { id: string; owner_id: string; device_id: string; session_id: string; hardware_id: string; board_boot_id: string; requested_on: number; idempotency_key: string; state: string; worker_id: string | null; lease_epoch: number | null; control_epoch: number; created_at: number; expires_at: number; receipt: string | null; result_digest: string | null; error: string | null };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Deliberately LED-only. Existing iOS worker and board authentication stay in use;
// this module never accepts HID, arbitrary USB payloads, or developer app actions.
export class LEDControl {
  service: BridgeEngine;
  constructor(service: BridgeEngine) { this.service = service; }
  async hardware(device: Device) {
    const value = await this.service.stmt("SELECT * FROM sb_hardware WHERE device_id=? AND owner_id=?", device.id, device.owner_id).first<Hardware>();
    need(value, "BOARD_NOT_BOUND"); return value;
  }
  async bind(device: Device, body: Record<string, unknown>) {
    const hardware = uuid(body.hardware_id), boot = uuid(body.board_boot_id), capabilities = record(body.capabilities);
    need(body.protocol_version === "1.0" && ["usb_midi", "usb_ncm"].includes(String(body.transport)), "UNSUPPORTED_BOARD", 422);
    need(!Object.hasOwn(capabilities, "led.set") || typeof capabilities["led.set"] === "boolean", "INVALID_CAPABILITIES", 422);
    const led = record(body.led_config ?? {}), descriptor = text(body.descriptor_version, 120), floor = integer(body.lease_epoch_floor ?? 0, 0, 2_000_000_000);
    need(JSON.stringify(led).length <= 1024, "INVALID_LED_CONFIG", 422);
    const prior = await this.service.stmt("SELECT * FROM sb_hardware WHERE device_id=?", device.id).first<Hardware>();
    const scoped=body.worker_id!=null ? await this.service.session(device,body) : null;
    if (prior && (prior.hardware_id !== hardware || prior.board_boot_id !== boot) && (scoped || device.current_session)) {
      if(scoped?.mode==="broadcast")await new MouseControl(this.service).grant(device,{control_enabled:false,bridge_session_id:scoped.id,expected_control_epoch:scoped.control_epoch});
      else await this.service.stop(device, scoped?.id??device.current_session!);
    }
    const retained=currentActionCapabilities(capabilities,body.transport);
    const metadata = JSON.stringify({ capabilities: retained, led_config: led, descriptor_version: descriptor, transport: body.transport });
    if(scoped){
      const changed=await this.service.db.batch([
        this.service.stmt("INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) SELECT ?,?,?,?,?,0 FROM sb_devices d WHERE d.id=? AND d.owner_id=? AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND d.revoked=0 ON CONFLICT(device_id) DO UPDATE SET hardware_id=excluded.hardware_id,board_boot_id=excluded.board_boot_id,metadata=excluded.metadata,usb_connected=CASE WHEN sb_hardware.hardware_id=excluded.hardware_id AND sb_hardware.board_boot_id=excluded.board_boot_id THEN sb_hardware.usb_connected ELSE 0 END",device.id,device.owner_id,hardware,boot,metadata,device.id,device.owner_id,scoped.id,body.worker_id,body.lease_epoch,this.service.now()),
        this.service.stmt("UPDATE sb_devices SET lease_epoch=MAX(lease_epoch,?+1) WHERE id=? AND owner_id=? AND current_session=? AND worker_id=? AND lease_epoch=? AND revoked=0",floor,device.id,device.owner_id,scoped.id,body.worker_id,body.lease_epoch),
      ]);
      need(changed[0].meta.changes===1&&changed[1].meta.changes===1,"STALE_LEASE");
      const current=await this.service.stmt("SELECT lease_epoch FROM sb_devices WHERE id=? AND owner_id=? AND current_session=? AND worker_id=? AND revoked=0",device.id,device.owner_id,scoped.id,body.worker_id).first<{lease_epoch:number}>();need(current,"STALE_SESSION");
      return {hardware_id:hardware,board_boot_id:boot,control_scope:retained["led.set"] ? ["led.set"] : [],bound:true,lease_epoch:current.lease_epoch};
    }
    await this.service.db.batch([
      this.service.stmt("INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,0) ON CONFLICT(device_id) DO UPDATE SET hardware_id=excluded.hardware_id,board_boot_id=excluded.board_boot_id,metadata=excluded.metadata,usb_connected=CASE WHEN sb_hardware.hardware_id=excluded.hardware_id AND sb_hardware.board_boot_id=excluded.board_boot_id THEN sb_hardware.usb_connected ELSE 0 END", device.id, device.owner_id, hardware, boot, metadata),
      this.service.stmt("UPDATE sb_devices SET lease_epoch=MAX(lease_epoch,?) WHERE id=? AND owner_id=?", floor, device.id, device.owner_id),
    ]);
    return { hardware_id: hardware, board_boot_id: boot, control_scope: retained["led.set"] ? ["led.set"] : [], bound: true };
  }
  async createSession(device: Device, body: Record<string, unknown>) {
    need(body.mode === "foreground_diagnostic" && body.control_enabled === true && body.broadcast_id == null, "DIAGNOSTIC_REQUIRED", 403);
    const board = await this.hardware(device);
    need(JSON.parse(board.metadata).capabilities["led.set"] === true, "LED_NOT_CONFIGURED");
    const request = uuid(body.request_id), digest = await hash("foreground-led:" + board.hardware_id + ":" + board.board_boot_id), now = this.service.now(), id = uid();
    const old = await this.service.stmt("SELECT id,body_hash,state FROM sb_sessions WHERE device_id=? AND request_id=?", device.id, request).first<{ id: string; body_hash: string; state: string }>();
    if (old) { need(old.body_hash === digest, "IDEMPOTENCY_CONFLICT"); return { bridge_session_id: old.id, state: old.state, mode: "foreground_diagnostic", control_enabled: old.state === "active", control_scope: ["led.set"] }; }
    const previous = await this.service.stmt("SELECT session_id,image_key FROM sb_frames WHERE device_id=?", device.id).first<{ session_id: string; image_key: string }>();
    await this.service.db.batch([
      this.service.stmt("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,mode,diagnostic_enabled,control_epoch) SELECT ?,?,?,?,?,?,'active','stopped',?,'foreground_diagnostic',1,1 FROM sb_hardware h JOIN sb_devices d ON d.id=h.device_id WHERE d.id=? AND d.revoked=0 AND h.hardware_id=? AND h.board_boot_id=? AND json_extract(h.metadata,'$.capabilities.\"led.set\"')=1 ON CONFLICT(device_id,request_id) DO NOTHING", id, device.owner_id, device.id, id, request, digest, now, device.id, board.hardware_id, board.board_boot_id),
      this.service.stmt("UPDATE sb_devices SET current_session=?,lease_epoch=lease_epoch+1,worker_id=NULL,worker_expires=0 WHERE id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", id, device.id, id),
      this.service.stmt("UPDATE sb_sessions SET state='stopped',capture_state='stopped',diagnostic_enabled=0 WHERE device_id=? AND id<>? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id, id),
      this.service.stmt("UPDATE sb_led_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'cancelled' END WHERE device_id=? AND session_id<>? AND state IN ('queued','claimed','executing') AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id, id),
      this.service.stmt("UPDATE sb_hardware SET usb_connected=0 WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id),
      this.service.stmt("DELETE FROM sb_frames WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id),
      this.service.stmt("DELETE FROM sb_refreshes WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id),
    ]);
    const created = await this.service.stmt("SELECT id,body_hash FROM sb_sessions WHERE device_id=? AND request_id=?", device.id, request).first<{ id: string; body_hash: string }>();
    need(created && created.body_hash === digest, "BOARD_CHANGED");
    if (created.id === id && previous) await this.service.bucket.delete(previous.image_key);
    return { bridge_session_id: created.id, broadcast_id: null, mode: "foreground_diagnostic", control_enabled: true, control_scope: ["led.set"] };
  }
  async heartbeat(device: Device, body: Record<string, unknown>) {
    const session = await this.service.session(device, body), board = await this.hardware(device), now = this.service.now();
    need(session.mode === "foreground_diagnostic" && session.diagnostic_enabled === 1, "DIAGNOSTIC_REQUIRED", 403);
    need(JSON.parse(board.metadata).capabilities["led.set"] === true, "LED_NOT_CONFIGURED");
    need(body.capture_state === "stopped" && body.usb_connected === true && body.board_boot_id === board.board_boot_id, "BOARD_DISCONNECTED");
    const updated = await this.service.stmt("UPDATE sb_devices SET worker_expires=?,last_seen=? WHERE id=? AND current_session=? AND worker_id=? AND lease_epoch=? AND revoked=0", now + 10_000, now, device.id, session.id, uuid(body.worker_id), integer(body.lease_epoch, 1)).run();
    need(updated.meta.changes === 1, "STALE_LEASE");
    await this.service.stmt("UPDATE sb_hardware SET usb_connected=1 WHERE device_id=? AND board_boot_id=?", device.id, board.board_boot_id).run();
    return { directive: "continue", expires_in_ms: 10_000, grant_remaining_ms: 10_000, control_epoch: session.control_epoch, local_lease_max_ms: 3000, control_scope: ["led.set"], server_time: iso(now) };
  }
  async expire(deviceID: string) {
    await this.service.stmt("UPDATE sb_led_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'expired' END,error='COMMAND_EXPIRED' WHERE device_id=? AND state IN ('queued','claimed','executing') AND expires_at<=?", deviceID, this.service.now()).run();
  }
  output(command: Command) {
    return { command_id: command.id, device_id: command.device_id, bridge_session_id: command.session_id, hardware_id: command.hardware_id, board_boot_id: command.board_boot_id,
      kind: "led.set", payload: { on: command.requested_on === 1 }, control_epoch: command.control_epoch, state: command.state,
      ttl_remaining_ms: Math.max(0, command.expires_at - this.service.now()), expires_at: iso(command.expires_at),
      board_receipt: command.receipt ? JSON.parse(command.receipt) : null, error: command.error,
      verification: command.state === "board_acked" ? "phone_verified_board_ack" : "not_confirmed", physical_light_observed: false };
  }
  async set(user: User, args: Record<string, unknown>) {
    need(typeof args.on === "boolean", "INVALID_ARGUMENTS", 422);
    const key = args.idempotency_key == null ? uid() : text(args.idempotency_key, 120);
    const device = args.device_id ? await this.service.owned(user, uuid(args.device_id)) : await this.singleReady(user);
    const board = await this.service.stmt("SELECT * FROM sb_hardware WHERE device_id=? AND owner_id=?", device.id, device.owner_id).first<Hardware>();
    if (board) need(JSON.parse(board.metadata).capabilities["led.set"] === true, "LED_NOT_CONFIGURED");
    const old = await this.service.stmt("SELECT * FROM sb_led_commands WHERE owner_id=? AND device_id=? AND idempotency_key=?", user.id, device.id, key).first<Command>();
    if (old) { need(old.requested_on === (args.on ? 1 : 0), "IDEMPOTENCY_CONFLICT"); await this.expire(device.id); return this.get(user, old.id); }
    const ready = await this.service.status(device);
    need(ready.online && ready.usb_connected && ready.session?.mode === "foreground_diagnostic" && ready.session.control_enabled, "START_FOREGROUND_LED_DIAGNOSTICS");
    need(board, "BOARD_NOT_BOUND");
    await this.expire(device.id);
    const now = this.service.now(), id = uid();
    const saved = await this.service.stmt("INSERT INTO sb_led_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,requested_on,idempotency_key,state,control_epoch,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,'queued',s.control_epoch,?,? FROM sb_sessions s JOIN sb_devices d ON d.current_session=s.id JOIN sb_hardware h ON h.device_id=d.id WHERE d.id=? AND d.owner_id=? AND d.revoked=0 AND d.worker_expires>? AND s.id=? AND s.state='active' AND s.mode='foreground_diagnostic' AND s.diagnostic_enabled=1 AND h.hardware_id=? AND h.board_boot_id=? AND h.usb_connected=1 AND json_extract(h.metadata,'$.capabilities.\"led.set\"')=1 AND NOT EXISTS(SELECT 1 FROM sb_led_commands c WHERE c.device_id=d.id AND c.state IN ('queued','claimed','executing')) ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING", id, user.id, device.id, ready.session.bridge_session_id, board.hardware_id, board.board_boot_id, args.on ? 1 : 0, key, now, now + 10_000, device.id, user.id, now, ready.session.bridge_session_id, board.hardware_id, board.board_boot_id).run();
    need(saved.meta.changes === 1, "COMMAND_BUSY_OR_CONNECTION_CHANGED");
    const wait = integer(args.wait_ms ?? 5000, 0, 5000), deadline = Date.now() + wait;
    let result = await this.get(user, id);
    while (["queued", "claimed", "executing"].includes(result.state) && Date.now() < deadline) { await delay(250); result = await this.get(user, id); }
    return result;
  }
  async singleReady(user: User) {
    const rows = await this.service.stmt("SELECT d.* FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id WHERE d.owner_id=? AND d.revoked=0 AND d.worker_expires>? AND s.mode='foreground_diagnostic' AND s.state='active' AND s.diagnostic_enabled=1 AND h.usb_connected=1 LIMIT 2", user.id, this.service.now()).all<Device>();
    if (!rows.results.length) {
      const bound = await this.service.stmt("SELECT d.* FROM sb_devices d JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE d.owner_id=? AND d.revoked=0 LIMIT 2", user.id).all<Device>();
      if (bound.results.length === 1) need(JSON.parse((await this.hardware(bound.results[0])).metadata).capabilities["led.set"] === true, "LED_NOT_CONFIGURED");
    }
    need(rows.results.length === 1, rows.results.length ? "CHOOSE_DEVICE" : "START_FOREGROUND_LED_DIAGNOSTICS"); return rows.results[0];
  }
  async get(user: User, commandID: string) {
    const command = await this.service.stmt("SELECT * FROM sb_led_commands WHERE id=? AND owner_id=?", uuid(commandID), user.id).first<Command>(); need(command, "NOT_FOUND", 404);
    await this.service.owned(user, command.device_id); await this.expire(command.device_id);
    const current = await this.service.stmt("SELECT * FROM sb_led_commands WHERE id=?", command.id).first<Command>(); need(current, "NOT_FOUND", 404); return this.output(current);
  }
  async claim(device: Device, body: Record<string, unknown>, waitMS: number) {
    const session = await this.service.session(device, body); need(session.mode === "foreground_diagnostic" && session.diagnostic_enabled === 1, "DIAGNOSTIC_REQUIRED", 403);
    const deadline = Date.now() + waitMS;
    do {
      await this.expire(device.id);
      const now = this.service.now();
      const won = await this.service.stmt("UPDATE sb_led_commands SET state='claimed',worker_id=?,lease_epoch=? WHERE id=(SELECT c.id FROM sb_led_commands c JOIN sb_devices d ON d.id=c.device_id JOIN sb_sessions s ON s.id=c.session_id JOIN sb_hardware h ON h.device_id=d.id WHERE c.device_id=? AND c.session_id=? AND c.state='queued' AND c.expires_at>? AND d.current_session=s.id AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND d.revoked=0 AND s.state='active' AND s.mode='foreground_diagnostic' AND s.diagnostic_enabled=1 AND c.control_epoch=s.control_epoch AND h.hardware_id=c.hardware_id AND h.board_boot_id=c.board_boot_id AND h.usb_connected=1 AND json_extract(h.metadata,'$.capabilities.\"led.set\"')=1 AND NOT EXISTS(SELECT 1 FROM sb_led_commands other WHERE other.device_id=d.id AND other.state IN ('claimed','executing')) ORDER BY c.created_at LIMIT 1) AND state='queued' RETURNING *", uuid(body.worker_id), integer(body.lease_epoch, 1), device.id, session.id, now, body.worker_id, body.lease_epoch, now).first<Command>();
      if (won) return this.output(won);
      if (Date.now() >= deadline) return null; await delay(500);
    } while (true);
  }
  async start(device: Device, id: string, body: Record<string, unknown>) {
    const session = await this.service.session(device, body), now = this.service.now();
    need(session.mode === "foreground_diagnostic" && session.diagnostic_enabled === 1 && session.control_epoch === integer(body.control_epoch, 1), "STALE_CONTROL");
    const row = await this.service.stmt("UPDATE sb_led_commands SET state='executing' WHERE id=? AND device_id=? AND session_id=? AND state='claimed' AND worker_id=? AND lease_epoch=? AND control_epoch=? AND expires_at>? AND EXISTS(SELECT 1 FROM sb_hardware h JOIN sb_devices d ON d.id=h.device_id JOIN sb_sessions s ON s.id=d.current_session WHERE h.device_id=sb_led_commands.device_id AND h.hardware_id=sb_led_commands.hardware_id AND h.board_boot_id=sb_led_commands.board_boot_id AND h.usb_connected=1 AND json_extract(h.metadata,'$.capabilities.\"led.set\"')=1 AND d.worker_expires>? AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND s.id=sb_led_commands.session_id AND s.state='active' AND s.diagnostic_enabled=1) RETURNING *", uuid(id), device.id, session.id, uuid(body.worker_id), integer(body.lease_epoch, 1), session.control_epoch, now, now, body.worker_id, body.lease_epoch).first<Command>();
    need(row, "COMMAND_EXPIRED_OR_CONNECTION_CHANGED");
    return { ...this.output(row), ttl_remaining_ms: Math.min(2500, row.expires_at - now) };
  }
  async result(device: Device, id: string, body: Record<string, unknown>) {
    await this.service.session(device, body);
    const row = await this.service.stmt("SELECT * FROM sb_led_commands WHERE id=? AND device_id=? AND owner_id=?", uuid(id), device.id, device.owner_id).first<Command>(); need(row, "NOT_FOUND", 404);
    need(row.session_id === body.bridge_session_id && row.worker_id === body.worker_id && row.lease_epoch === body.lease_epoch, "STALE_LEASE");
    need(["board_acked", "failed", "outcome_unknown"].includes(String(body.state)), "INVALID_RESULT", 422);
    const receipt = record(body.board_receipt), digest = await hash(JSON.stringify(body));
    if (row.result_digest) { need(row.result_digest === digest, "RESULT_CONFLICT"); return this.output(row); }
    if (body.state === "board_acked") {
      need(receipt.command_id === row.id && receipt.board_boot_id === row.board_boot_id && receipt.state === "executed" && record(receipt.effect).led_requested_on === (row.requested_on === 1) && typeof body.finished_client_mono_ms === "number" && Number.isFinite(body.finished_client_mono_ms), "INVALID_BOARD_RECEIPT", 422);
    }
    const saved = await this.service.stmt("UPDATE sb_led_commands SET state=?,receipt=?,result_digest=?,error=? WHERE id=? AND state='executing' AND expires_at>? AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id WHERE d.id=sb_led_commands.device_id AND d.revoked=0 AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND s.id=sb_led_commands.session_id AND s.state='active' AND s.diagnostic_enabled=1 AND h.board_boot_id=sb_led_commands.board_boot_id AND h.hardware_id=sb_led_commands.hardware_id)", body.state, JSON.stringify(receipt), digest, body.error == null ? null : text(body.error, 120), row.id, this.service.now(), body.worker_id, body.lease_epoch, this.service.now()).run();
    need(saved.meta.changes === 1, "STALE_RECEIPT");
    return this.get({ id: device.owner_id, label: "" }, id);
  }
}
