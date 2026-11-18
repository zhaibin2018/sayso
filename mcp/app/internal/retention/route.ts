import { env } from "cloudflare:workers";
import { authorizeRetentionMaintenance } from "../../../lib/maintenance-auth";
import { engine, json, failure } from "../../../lib/bridge-runtime";

export const dynamic = "force-dynamic";
/** A separately authorized maintenance writer, with no device/input operation. */
export async function POST(request: Request) {
  try {
    authorizeRetentionMaintenance(
      env.SAYSO_RETENTION_MAINTENANCE_KEY_HEX,
      request.headers.get("X-SaySo-Retention-Key"),
    );
    await engine().pruneMetadata("maintenance");
    return json({ completed: true });
  } catch (error) {
    return failure(error);
  }
}
