import { engine } from "../../../../lib/bridge-runtime";
import { handleDeviceRequest } from "../../../../lib/device-api";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleDeviceRequest(request, { engine, strictSigning: true });
export const POST = GET;
