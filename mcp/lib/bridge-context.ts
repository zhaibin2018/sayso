import { AsyncLocalStorage } from "node:async_hooks";
type WorkerPlacementObservation = { ingress_colo?: string; reported_placement?: string };
type BridgeContext = { waitUntil: (job: Promise<unknown>) => void; workerFetchStartedUTC?: number; workerPlacement?: () => WorkerPlacementObservation | undefined };
const context = new AsyncLocalStorage<BridgeContext>();
export const runWithBridgeContext = <T>(value: BridgeContext, operation: () => T) => context.run(value, operation);
export function workerFetchStartedUTC() { return context.getStore()?.workerFetchStartedUTC; }
export function workerPlacementObservation() { return context.getStore()?.workerPlacement?.(); }
export function observeWorkerPlacement(request: Request): WorkerPlacementObservation | undefined {
  const ingress = request.cf?.colo, placement = request.headers.get("cf-placement");
  const ingress_colo = typeof ingress === "string" && /^[A-Z]{3}$/.test(ingress) ? ingress : undefined;
  // This is a reported routing header, not access or placement authority.
  const reported_placement = placement !== null && /^(local|remote)-[A-Z]{3}$/.test(placement) ? placement : undefined;
  if (ingress_colo === undefined && reported_placement === undefined) return undefined;
  return { ...(ingress_colo ? { ingress_colo } : {}), ...(reported_placement ? { reported_placement } : {}) };
}
export function background(job: Promise<unknown>) { context.getStore()?.waitUntil(job.catch(() => undefined)); }

export function deferBridgeDiagnostic(emit:()=>void) {
  const current=context.getStore();
  if(!current){emit();return;}
  try { current.waitUntil(new Promise<void>(resolve=>setTimeout(resolve,0)).then(emit).catch(()=>undefined)); }
  catch { /* Diagnostic delivery cannot change the response. */ }
}
