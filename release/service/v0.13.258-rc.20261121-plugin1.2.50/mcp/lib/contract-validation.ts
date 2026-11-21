/** Small JSON Schema subset used by the current device wire envelope. */
export function matchesContract(value: unknown, schema: Record<string, any>): boolean {
  if (Object.hasOwn(schema, "const") && !Object.is(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some((item: unknown) => Object.is(item, value))) return false;
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>,
      properties = schema.properties ?? {};
    if ((schema.required ?? []).some((key: string) => !Object.hasOwn(object, key))) return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(object).some((key) => !Object.hasOwn(properties, key))
    )
      return false;
    return Object.entries(properties).every(
      ([key, rule]) =>
        !Object.hasOwn(object, key) || matchesContract(object[key], rule as Record<string, any>),
    );
  }
  if (schema.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
    )
      return false;
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    )
      return false;
    return !schema.items || value.every((item) => matchesContract(item, schema.items));
  }
  if (schema.type === "string") {
    if (
      typeof value !== "string" ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity)
    )
      return false;
    if (schema.format === "uuid" && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
      return false;
    return !schema.pattern || new RegExp(schema.pattern).test(value);
  }
  if (schema.type === "integer" || schema.type === "number") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isSafeInteger(value)) &&
      value >= (schema.minimum ?? -Infinity) &&
      value <= (schema.maximum ?? Infinity)
    );
  }
  if (schema.type === "boolean") return typeof value === "boolean";
  return true;
}
