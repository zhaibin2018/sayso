import { handleMcp } from "../../lib/mcp-protocol";
import { engine, caller, publicOrigin, createImageReleaseClockSampler } from "../../lib/bridge-runtime";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleMcp(request, {
  engine, caller, origin: publicOrigin, createImageReleaseClockSampler, hostSearchReview:true,
});
export const GET = POST;
