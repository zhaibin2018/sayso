import { BridgeError, uuid, type BridgeEngine, type Device } from "./bridge-engine.ts";
/** Owner-scoped lifecycle storage; HTTP routes contain no SQL. */
export class DeviceControlRepository {
  private readonly service: BridgeEngine;
  constructor(service: BridgeEngine) {
    this.service = service;
  }
  async manualRequests(device: Device) {
    const rows = await this.service
      .stmt(
        "SELECT id AS request_id,message,state FROM sb_manual_requests WHERE device_id=? AND owner_id=? AND expires_at>?",
        device.id,
        device.owner_id,
        this.service.now(),
      )
      .all();
    return rows.results;
  }
  async acknowledgeRequest(device: Device, requestID: string, body: Record<string, unknown>) {
    if (!["seen", "ready", "declined"].includes(String(body.state)))
      throw new BridgeError("INVALID_STATE", 422);
    await this.service
      .stmt(
        "UPDATE sb_manual_requests SET state=? WHERE id=? AND device_id=? AND owner_id=?",
        body.state,
        uuid(requestID),
        device.id,
        device.owner_id,
      )
      .run();
    return { accepted: true };
  }
  async captureState(device: Device, body: Record<string, unknown>) {
    const session = await this.service.session(device, body, false);
    if (body.capture_state === "stopped") return this.service.stop(device, session.id, true);
    if (body.capture_state !== "active" && body.capture_state !== "paused")
      throw new BridgeError("INVALID_CAPTURE_STATE", 422);
    await this.service
      .stmt(
        "UPDATE sb_sessions SET capture_state=? WHERE id=? AND owner_id=? AND device_id=? AND state='active'",
        body.capture_state,
        session.id,
        device.owner_id,
        device.id,
      )
      .run();
    return { accepted: true, control_enabled: false };
  }
}
