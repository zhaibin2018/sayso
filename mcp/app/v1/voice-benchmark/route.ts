import { bounded, caller, engine, failure, json } from "../../../lib/bridge-runtime";
import { record } from "../../../lib/bridge-engine";
import { voiceBenchmark } from "../../../lib/voice-bench";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const user = caller(request);
    const body = record(JSON.parse(new TextDecoder().decode(await bounded(request, 2048))));
    return json(await voiceBenchmark(engine(), user, body));
  } catch (error) { return failure(error); }
}
