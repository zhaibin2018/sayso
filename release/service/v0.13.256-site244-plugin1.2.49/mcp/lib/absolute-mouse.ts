import { finite, integer } from "./bridge-engine.ts";

/** Pixel coordinates refer to the complete upright source image, not UIKit pixels. */
export function absoluteMouseRequest(args: Record<string, unknown>) {
  const width = integer(args.image_width, 2, 8192), height = integer(args.image_height, 2, 8192);
  const x = finite(args.x, 0, width - 1), y = finite(args.y, 0, height - 1);
  const epoch = integer(args.orientation_epoch, 0);
  return {
    payload: { x: Math.round(x / (width - 1) * 32767), y: Math.round(y / (height - 1) * 32767) },
    intent: { source_x: x, source_y: y, source_width: width, source_height: height, orientation_epoch: epoch },
  };
}
