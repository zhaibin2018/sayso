import { recordToolActivity } from "../../lib/tool-activity";
import { handleMcp } from "../../lib/mcp-protocol";
import {
  engine,
  maintenanceOwnerID,
  caller,
  publicOrigin,
  createImageReleaseClockSampler,
} from "../../lib/bridge-runtime";
export const dynamic = "force-dynamic";
export const POST = (request: Request) =>
  handleMcp(request, {
    strictSigning: true,
    recordToolCall: (user) => recordToolActivity(engine(), user),
    maintenanceOwnerID,
    engine,
    caller,
    origin: publicOrigin,
    createImageReleaseClockSampler,
  });
export const GET = POST;
