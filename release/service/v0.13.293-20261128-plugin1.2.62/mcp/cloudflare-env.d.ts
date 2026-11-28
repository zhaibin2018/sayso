declare namespace Cloudflare {
  interface Env {
    SAYSO_INSTALL_OWNER_ID?: string;
    DB?: D1Database;
    SAYSO_SITE_GATE_TOKEN?: string;
    BUCKET?: R2Bucket;
    SAYSO_BROWSE_ENABLED?: string;
    SAYSO_DIAGNOSTIC_PARALLEL_SHARING?: string;
    SAYSO_FRAME_PERMIT_HMAC_KEY_HEX?: string;
    SAYSO_TIMING_JOURNAL_READ_KEY_HEX?: string;
    SAYSO_RETENTION_MAINTENANCE_KEY_HEX?: string;
    SAYSO_FRAME_UPLOAD_TRACE_DEVICE?: string;
  }
}
