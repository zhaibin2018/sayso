import {gateRevisionGuard} from "../lib/pairing-gate-revision";
import {pairingRoute} from "../lib/service-pairing-http";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { observeWorkerPlacement, runWithBridgeContext } from "../lib/bridge-context";

const checkGateRevision=gateRevisionGuard();
const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const workerFetchStartedUTC = Date.now();
    const workerFetchStartedMono = performance.now();
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithBridgeContext({ waitUntil: job => ctx.waitUntil(job), workerFetchStartedUTC,workerFetchStartedMono,
      workerPlacement: () => observeWorkerPlacement(request) }, () => runWithConnectorBinding(binding, async () => {
        try {await checkGateRevision(env);}catch {return Response.json({error:"PAIR_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});}
        return (await pairingRoute(request, env)) ?? handler.fetch(request, env, ctx);
      }));
  },
};

export default worker;
