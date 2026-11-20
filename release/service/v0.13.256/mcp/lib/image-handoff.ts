type ObjectValue = Record<string, unknown>;
const object = (v:unknown):ObjectValue => v && typeof v==="object" && !Array.isArray(v) ? v as ObjectValue : {};
const positive = (v:unknown) => typeof v==="number" && Number.isSafeInteger(v) && v>0;

/** A model-visible reference to the pixels in this response, not proof that the
 * host/model saw them. Never renew capture time or infer a successful action. */
export function imageHandoff(value:ObjectValue, images:ObjectValue[]):ObjectValue|undefined {
  if(images.length!==1 || images[0].type!=="image" || typeof images[0].data!=="string" || !images[0].data)return;
  const after=object(value.after_screen), isAfter=Object.keys(after).length>0;
  const observation=isAfter?after:value, m=object(observation.metadata);
  if(observation.state!=="available" || typeof m.device_id!=="string" || typeof m.frame_id!=="string" ||
     !positive(m.width) || !positive(m.height) || typeof m.orientation_epoch!=="number" ||
     !Number.isSafeInteger(m.orientation_epoch) || m.orientation_epoch<0 ||
     m.capture_clock_verified!==true || m.is_repeated===true)return;
  if(typeof value.device_id==="string" && value.device_id!==m.device_id)return;
  if(typeof value.bridge_session_id==="string" && value.bridge_session_id!==m.bridge_session_id)return;
  const order=object(after.after_command);
  if(isAfter && (value.state!=="board_acked" || typeof value.command_id!=="string" ||
     order.command_id!==value.command_id || order.command_state!=="board_acked" ||
     order.relation!=="capture_after_phone_board_ack" || order.scope_matches_at_snapshot!==true ||
     typeof order.lower_gap_ms!=="number" || !Number.isFinite(order.lower_gap_ms) || order.lower_gap_ms<=0))return;
  const preview=object(value.focus_image);
  const width=positive(preview.width)?preview.width:m.width, height=positive(preview.height)?preview.height:m.height;
  return {
    source_frame_id:m.frame_id, device_id:m.device_id,
    image_width:m.width, image_height:m.height, orientation_epoch:m.orientation_epoch,
    ...(width!==m.width||height!==m.height?{displayed_width:width,displayed_height:height}:{}),
    ...(isAfter?{source_after_command_id:value.command_id}:{}),
    // Scope, capture clocks and opaque proofs stay in this same result's
    // existing metadata. Avoid repeating them and workflow prose every step.
  };
}
