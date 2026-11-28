/** Grace starts after the worker lease expires. Accepted frames require a live
 * lease, so pruning a 30-second frame cannot shorten the grace period. */
export const offlineSharingGraceMS = 60_000;

export function expireOfflineSharing(db: D1Database, now: number, requester?: {owner_id: string; id: string}) {
  const cutoff = now - offlineSharingGraceMS;
  const ids = `SELECT s.id FROM sb_devices d
    JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    LEFT JOIN sb_frames f ON f.device_id=d.id AND f.session_id=s.id AND f.owner_id=s.owner_id
    WHERE d.revoked=0 AND s.mode='broadcast' AND s.state='active'
      AND max(s.created_at,d.worker_expires,d.last_seen,coalesce(f.received_at,0),coalesce(f.repeat_received_at,0))<=?
      ${requester ? 'AND d.owner_id=? AND d.id<>?' : ''}
    ORDER BY s.created_at,s.id ${requester ? '' : 'LIMIT 20'}`;
  const scope = requester ? [cutoff, requester.owner_id, requester.id] : [cutoff];
  // A renewal or a new current_session committed before this transaction
  // excludes the old session. Only explicit stops and takeovers block a broadcast.
  return db.batch([
    db.prepare(`UPDATE sb_hardware SET usb_connected=0 WHERE device_id IN
      (SELECT device_id FROM sb_sessions WHERE id IN (${ids}))`).bind(...scope),
    db.prepare(`UPDATE sb_sessions SET state='stopped',capture_state='stopped',stop_reason='offline_timeout',
      stopped_at=?,mouse_enabled=0,input_end=0,control_epoch=control_epoch+1 WHERE id IN (${ids})`).bind(now,...scope),
    db.prepare(`UPDATE sb_devices SET current_session=NULL,worker_id=NULL,worker_expires=0,lease_epoch=lease_epoch+1
      WHERE EXISTS (SELECT 1 FROM sb_sessions s WHERE s.id=sb_devices.current_session AND s.device_id=sb_devices.id
        AND s.owner_id=sb_devices.owner_id AND s.state='stopped' AND s.stop_reason='offline_timeout')
      ${requester ? 'AND owner_id=? AND id<>?' : ''}`).bind(...(requester ? [requester.owner_id,requester.id] : [])),
  ]);
}
