import { useEffect, useState } from "react";
export function useWakeLock(active) {
  const [state, setState] = useState("off");
  useEffect(() => {
    if (!active) {
      setState("off");
      return;
    }
    let lock,
      disposed = false,
      pending = false;
    const acquire = async () => {
      if (
        disposed ||
        pending ||
        (lock && !lock.released) ||
        document.visibilityState !== "visible"
      )
        return;
      pending = true;
      try {
        if (!navigator.wakeLock) throw new Error();
        const next = await navigator.wakeLock.request("screen");
        if (disposed) {
          await next.release();
          return;
        }
        lock = next;
        setState("active");
        next.addEventListener("release", () => {
          if (!disposed) setState("released");
        });
      } catch {
        if (!disposed) setState("unavailable");
      } finally {
        pending = false;
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);
  return state;
}
