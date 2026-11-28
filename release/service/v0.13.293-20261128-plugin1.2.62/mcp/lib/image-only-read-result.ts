type Fields = Record<string, unknown>;

/** Presentation only. The caller still serializes and rechecks release authority
 * and image age through liveResult. Warning/no-image results retain full facts. */
export function imageOnlyReadResult(
  value: Fields,
  images: Fields[],
  isError: boolean,
) {
  if (isError || images.length !== 1 || images[0].type !== "image" ||
      typeof images[0].data !== "string" || !images[0].data ||
      value.state !== "available" || value.warning || value.error) return;
  const metadata = value.metadata as Fields | undefined;
  const frame = metadata?.frame_id;
  const age = metadata?.age_ms;
  if (typeof frame !== "string" || typeof age !== "number" ||
      !Number.isFinite(age) || age < 0) return;
  const handoff = value.image_handoff;
  // click_at/drag_at need exact identity and original geometry. click_at can
  // resolve the optional same-frame proof server-side, so do not duplicate it.
  const targeting = handoff ? { image_handoff: handoff } : undefined;
  return {
    content: [{
      type: "text",
      text: typeof value.device_name === "string" && value.device_name.length > 0
        ? `Screenshot below from ${value.device_name}. 下图是 ${value.device_name} 的屏幕截图。`
        : "Screenshot below. 下图是屏幕截图。",
    }, images[0]],
    ...(targeting ? { structuredContent: targeting } : {}),
    isError: false,
  };
}
