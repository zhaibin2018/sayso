import { recordToolActivity } from "../../../lib/tool-activity";
import { handleMcp } from "../../../lib/mcp-protocol";
import {
  engine,
  caller,
  publicOrigin,
  createImageReleaseClockSampler,
} from "../../../lib/bridge-runtime";

export const dynamic = "force-dynamic";
export const POST = (request: Request) =>
  handleMcp(request, {
    strictSigning: true,
    recordToolCall: (user) => recordToolActivity(engine(), user),
    engine,
    caller,
    origin: publicOrigin,
    createImageReleaseClockSampler,
    toolAudience: "development",
  });
export const GET = POST;
