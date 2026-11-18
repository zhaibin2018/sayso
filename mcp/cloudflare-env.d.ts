declare namespace Cloudflare {
  interface Env {
    SAYSO_PUBLIC_ORIGIN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SAYSO_BROWSE_ENABLED?: string;
    SAYSO_FRAME_PERMIT_HMAC_KEY_HEX?: string;
    SAYSO_RETENTION_MAINTENANCE_KEY_HEX?: string;
    SAYSO_FRAME_UPLOAD_TRACE_DEVICE?: string;
  }
}
