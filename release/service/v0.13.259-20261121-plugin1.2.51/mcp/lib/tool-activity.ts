import type { BridgeEngine, User } from "./bridge-engine.ts";
/** Only authenticated MCP tools reset inactivity; publisher traffic never does. */
export async function recordToolActivity(e: BridgeEngine, user: User) {
  await e
    .stmt(
      "UPDATE sb_sessions SET last_tool_at=max(last_tool_at,?) WHERE owner_id=? AND state='active'",
      e.now(),
      user.id,
    )
    .run();
}
export async function idleDirective(
  e: BridgeEngine,
  device: string,
  session: string,
  setting: unknown,
) {
  const seconds = setting === 0 || setting === 1800 || setting === 3600 ? setting : 900;
  const row = await e
    .stmt(
      "SELECT max(created_at,last_tool_at) AS last_tool_at FROM sb_sessions WHERE id=? AND device_id=? AND state='active'",
      session,
      device,
    )
    .first<{ last_tool_at: number }>();
  return {
    idle_timeout_seconds: seconds,
    last_tool_at: row?.last_tool_at ?? null,
    idle_timeout: !!row && seconds > 0 && e.now() - row.last_tool_at >= seconds * 1000,
  };
}
