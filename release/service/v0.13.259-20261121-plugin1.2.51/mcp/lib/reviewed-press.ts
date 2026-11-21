import {createHash} from "node:crypto";

export const reviewedPressProtocol="reviewed_press_after_move.v1";
export const reviewedPressCapability="sayso."+reviewedPressProtocol;
export const reviewedPressKeyPrefix="parked-press:";
export const reviewedPressLandingTolerancePX=8;
export const reviewedPressOriginalLifetimeMS=20000;
export const parkedPressSelectorLedgerKey="parked_move_selector";

// The reserved version and variant make this selector distinct from the
// phone's capture UUIDs. An unknown selector cannot reach ordinary click.
export function parkedPressSelector(proof:string) {
  const hex=createHash("sha256").update("sayso.parked-move-selector.v1:").update(proof).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export const isParkedPressSelector=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);

/** The original paired move and child have one immutable result digest. */
export function failedReviewedPairSQL(move:string,child:string) {
  return `${move}.kind='pointer.move_absolute' AND ${move}.state='board_acked' AND ${move}.input_attempted=1
    AND ${move}.error IS NULL AND ${move}.result_digest IS NOT NULL AND ${move}.phone_ack_mono_ms>=0
    AND ${child}.kind='pointer.click' AND ${child}.state='failed' AND ${child}.input_attempted=0
    AND ${child}.error='MOUSE_PRECONDITION_FAILED' AND ${child}.receipt='{}' AND ${child}.phone_ack_mono_ms IS NULL
    AND ${child}.predecessor_id=${move}.id AND ${child}.result_digest=${move}.result_digest
    AND ${child}.owner_id=${move}.owner_id AND ${child}.device_id=${move}.device_id AND ${child}.session_id=${move}.session_id
    AND ${child}.worker_id=${move}.worker_id AND ${child}.lease_epoch=${move}.lease_epoch AND ${child}.control_epoch=${move}.control_epoch
    AND ${child}.hardware_id=${move}.hardware_id AND ${child}.board_boot_id=${move}.board_boot_id AND ${child}.expires_at=${move}.expires_at
    AND json_extract(${move}.precondition,'$.point.protocol')='paired_mouse_point.v1'
    AND json_extract(${move}.precondition,'$.point.click_command_id')=${child}.id
    AND json_extract(${move}.precondition,'$.point_source.protocol')='reviewed_point_crop.v4'
    AND json_extract(${move}.receipt,'$.command_id')=${move}.id
    AND json_extract(${move}.receipt,'$.board_boot_id')=${move}.board_boot_id
    AND json_extract(${move}.receipt,'$.state')='executed' AND json_extract(${move}.receipt,'$.error') IS NULL
    AND json_extract(${move}.receipt,'$.subcommand_index')=0
    AND json_type(${move}.receipt,'$.effect.hid_reports_sent')='true'
    AND json_extract(${move}.receipt,'$.effect.absolute_requested_x')=json_extract(${move}.payload,'$.x')
    AND json_extract(${move}.receipt,'$.effect.absolute_requested_y')=json_extract(${move}.payload,'$.y')`;
}
