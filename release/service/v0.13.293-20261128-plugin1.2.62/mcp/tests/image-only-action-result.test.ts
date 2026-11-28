import test from "node:test";
import assert from "node:assert/strict";
import { imageOnlyActionResult, imageOnlyActionTools } from "../lib/image-only-action-result.ts";

const image = {type: "image", mimeType: "image/jpeg", data: "offline-fixture"};
const value = {
  state: "board_acked", command_id: "original", kind: "keyboard.type_text",
  verification: "phone_verified_board_ack", app_effect_observed: false,
  input_not_submitted: false, enter_sent: false, text_input: {enter_sent: false, mouse_mode_confirmed: true},
  image_handoff: {device_id: "device", source_frame_id: "after", image_width: 16, image_height: 32, orientation_epoch: 0, source_after_command_id: "original"},
  board_receipt: {command_id: "original", state: "executed", error: null, effect: {all_released: true, typed_count: 4, typed_count_exact: true}},
  after_screen: {state: "available", metadata: {frame_id: "after", age_ms: 80}, after_command: {command_id: "original", lower_gap_ms: 360}},
  trace: {private: "diagnostic"}, payload: {text: "private input"}, source_point_proof: "server-retained",
};
test("image_only actions keep original IDs, release/count/Return facts and observation gap, without diagnostics", () => {
  for (const tool of imageOnlyActionTools) {
    const result = imageOnlyActionResult(tool, value, [image], false)!;
    assert.deepEqual(result.content.map(b => b.type), ["text", "image"]);
    assert.equal(result.content[0].type, "text", "D207 actions use text-first order");
    assert.equal(result.content[1], image);
    const s = result.structuredContent as typeof value;
    assert.equal(s.command_id, "original");
    assert.equal(s.verification, "phone_verified_board_ack");
    assert.equal(s.app_effect_observed, false);
    assert.equal(s.enter_sent, false);
    assert.deepEqual(s.board_receipt.effect, value.board_receipt.effect);
    assert.deepEqual(s.text_input, value.text_input);
    assert.deepEqual(s.image_handoff, value.image_handoff);
    assert.equal(s.after_screen.after_command.lower_gap_ms, 360);
    assert.doesNotMatch(JSON.stringify(result), /private input|diagnostic|server-retained|source_point_proof/);
    assert.equal(Object.hasOwn(result, "_meta"), false);
  }
});
test("image_only actions retain full recovery for stopped, partial, unknown, warning and unusable images", () => {
  for (const patch of [
    {state: "outcome_unknown"}, {state: "cancelled"}, {code: "STOPPED"}, {code: "TEXT_UNCONFIRMED"},
    {code: "OPERATION_ALREADY_STARTED"}, {code: "SEARCH_NOT_OPEN"}, {step_error: "failed"},
    {warning: "ACTION_NO_SCREEN_CHANGE"}, {recovery_eligible: true}, {input_not_submitted: true},
    {cancellation_receipt: {effect: {all_released: true}}}, {parent_state_persisted: false},
    {image_usable_for_input: false}, {image_handoff: undefined},
    {after_screen: {...value.after_screen, state: "repeated"}},
    {after_screen: {...value.after_screen, warning: "ACTION_NO_SCREEN_CHANGE"}},
    {after_screen: {...value.after_screen, metadata: {age_ms: NaN}}},
    {click_result: {state: "outcome_unknown"}},
  ]) assert.equal(imageOnlyActionResult("get_mouse_result", {...value, ...patch}, [image], false), undefined);
  assert.equal(imageOnlyActionResult("click_at", value, [], false), undefined);
  assert.equal(imageOnlyActionResult("click_at", value, [image], true), undefined);
});
