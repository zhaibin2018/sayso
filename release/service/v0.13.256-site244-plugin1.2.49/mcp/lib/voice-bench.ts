import { BridgeError, finite, uuid, type BridgeEngine, type User } from "./bridge-engine.ts";
export const voiceScenarios = ["current_screen", "screen_change", "icon_location"];
export async function voiceBenchmark(service: BridgeEngine, user: User, body: Record<string, unknown>) {
  if (body.action === "start") {
    if (!voiceScenarios.includes(String(body.scenario))) throw new BridgeError("INVALID_SCENARIO", 422);
    let deviceID: string;
    if (body.device_id) deviceID = (await service.owned(user, uuid(body.device_id))).id;
    else {
      const rows = await service.stmt("SELECT id FROM sb_devices WHERE owner_id=? AND revoked=0 ORDER BY created_at DESC LIMIT 2", user.id).all<{ id: string }>();
      if (rows.results.length !== 1) throw new BridgeError("SELECT_DEVICE", 409);
      deviceID = rows.results[0].id;
    }
    const id = uuid(body.run_id), now = service.now();
    await service.stmt("DELETE FROM sb_voice_bench WHERE owner_id=? AND created_at<?", user.id, now - 86400000).run();
    await service.stmt("INSERT INTO sb_voice_bench(id,owner_id,device_id,scenario,created_at) VALUES(?,?,?,?,?)", id, user.id, deviceID, body.scenario, now).run();
    return { run_id: id, ready: true };
  }
  if (body.action !== "finish") throw new BridgeError("INVALID_ACTION", 422);
  const total = finite(body.total_ms, 1, 600000), first = body.first_response_ms == null ? null : finite(body.first_response_ms, 0, total);
  const result = await service.stmt("UPDATE sb_voice_bench SET completed_at=?,first_response_ms=?,total_ms=? WHERE id=? AND owner_id=? AND total_ms IS NULL AND created_at>?", service.now(), first, total, uuid(body.run_id), user.id, service.now() - 600000).run();
  if (!result.meta.changes) throw new BridgeError("RUN_NOT_FOUND_OR_FINISHED", 404);
  return { saved: true, first_response_ms: first, total_ms: total, source: "manual_voice_stopwatch", includes_human_marking_error: true };
}
export async function voiceRuns(service: BridgeEngine, user: User, deviceID: string) {
  await service.owned(user, deviceID);
  const rows = await service.stmt("SELECT id,scenario,created_at,completed_at,first_response_ms,total_ms FROM sb_voice_bench WHERE owner_id=? AND device_id=? AND created_at>? AND total_ms IS NOT NULL ORDER BY created_at DESC LIMIT 10", user.id, deviceID, service.now() - 86400000).all();
  return { source: "manual_voice_stopwatch", includes_human_marking_error: true, runs: rows.results };
}
