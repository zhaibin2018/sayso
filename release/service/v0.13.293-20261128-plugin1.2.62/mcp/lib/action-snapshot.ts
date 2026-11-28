import type { BridgeEngine } from "./bridge-engine.ts";
export type ActionSnapshot = Awaited<ReturnType<BridgeEngine["readPairedResultSnapshot"]>>["read"];
export const actionSnapshots = new WeakMap<object, ActionSnapshot>();
