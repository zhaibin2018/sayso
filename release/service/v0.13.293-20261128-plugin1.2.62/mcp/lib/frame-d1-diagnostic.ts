import { schemaRaiseMessages, schemaConstraintNames } from "./frame-d1-schema-whitelist.ts";

/** Only exact repository constants leave this function. Provider wrappers are
 * stripped only when they surround the ENTIRE message, never via substring search. */
type Diagnostic = { error_message_length: number } & (
  | { d1_message_match: "RAISE_MESSAGE" | "NAMED_CONSTRAINT"; schema_message: string }
  | { d1_message_match: "UNMATCHED"; schema_message?: never }
);
export function frameD1Diagnostic(error: unknown): Diagnostic {
  const seen = new Set<unknown>();
  let current = error,
    error_message_length = 0;
  let match:
    { d1_message_match: "RAISE_MESSAGE" | "NAMED_CONSTRAINT"; schema_message: string } | undefined;
  for (let depth = 0; current != null && !seen.has(current) && depth < 4; depth++) {
    seen.add(current);
    const message =
      typeof current === "string"
        ? current
        : typeof current === "object"
          ? Object.getOwnPropertyDescriptor(current, "message")?.value
          : undefined;
    if (typeof message === "string") {
      error_message_length += message.length;
      let bare = message;
      for (let i = 0; i < 4 && bare.startsWith("D1_ERROR: "); i++) bare = bare.slice(10);
      bare = bare.replace(
        /: SQLITE_CONSTRAINT(?:_(?:TRIGGER|CHECK|UNIQUE|PRIMARYKEY))?(?: \((?:code|cause|extended): (?:SQLITE_CONSTRAINT(?:_(?:TRIGGER|CHECK|UNIQUE|PRIMARYKEY))?|19|1811|275|2067|1555)\))?$/,
        "",
      );
      const raise = schemaRaiseMessages.find((value) => value === bare);
      const constraint = schemaConstraintNames.find(
        (value) =>
          bare === value ||
          bare === "CHECK constraint failed: " + value ||
          bare === "UNIQUE constraint failed: index '" + value + "'",
      );
      if (raise) match = { d1_message_match: "RAISE_MESSAGE", schema_message: raise };
      else if (constraint && !match)
        match = { d1_message_match: "NAMED_CONSTRAINT", schema_message: constraint };
    }
    current =
      typeof current === "object"
        ? Object.getOwnPropertyDescriptor(current, "cause")?.value
        : undefined;
  }
  return { ...(match ?? { d1_message_match: "UNMATCHED" as const }), error_message_length };
}
