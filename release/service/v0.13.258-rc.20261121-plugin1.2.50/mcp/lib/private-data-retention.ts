export const privacyStorageReadySQL =
  "(SELECT count(*)=3 FROM sqlite_master WHERE type='trigger' AND name IN ('sb_mouse_terminal_text_update','sb_mouse_terminal_text_insert','sb_mouse_text_digest_required'))";
export function publicCommandPayload(kind: string, payload: string) {
  const value = JSON.parse(payload);
  if (kind === "keyboard.type_text" && Object.hasOwn(value, "text")) {
    delete value.text;
    value.text_omitted = true;
  }
  return value;
}
