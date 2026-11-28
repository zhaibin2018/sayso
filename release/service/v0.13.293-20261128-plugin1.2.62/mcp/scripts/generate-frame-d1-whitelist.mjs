import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function schemaWhitelist(root) {
  const files = [
    "db/schema.ts",
    ...readdirSync(resolve(root, "drizzle"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => "drizzle/" + f),
  ];
  const raises = new Set(),
    constraints = new Set();
  for (const file of files) {
    // These repository files contain literal schema definitions, never live SQL/data.
    const source = readFileSync(resolve(root, file), "utf8").replace(
      /--[^\n]*|\/\*[\s\S]*?\*\//g,
      "",
    );
    for (const m of source.matchAll(
      /\bRAISE\s*\(\s*(?:ABORT|FAIL|ROLLBACK)\s*,\s*'((?:''|[^'])*)'\s*\)/gi,
    ))
      raises.add(m[1].replaceAll("''", "'"));
    for (const pattern of [
      /\bCONSTRAINT\s+["`\[]?([a-z_][a-z0-9_]*)/gi,
      /\bCREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?([a-z_][a-z0-9_]*)/gi,
      /\buniqueIndex\(\s*["']([^"']+)["']/g,
    ]) {
      for (const m of source.matchAll(pattern)) constraints.add(m[1]);
    }
  }
  return { raises: [...raises].sort(), constraints: [...constraints].sort() };
}
export function generatedWhitelist(root) {
  const { raises, constraints } = schemaWhitelist(root);
  return (
    "// Generated from db/schema.ts and drizzle/*.sql; never extend with observed user/provider text.\n" +
    "export const schemaRaiseMessages = " +
    JSON.stringify(raises, null, 2) +
    " as const;\n" +
    "export const schemaConstraintNames = " +
    JSON.stringify(constraints, null, 2) +
    " as const;\n"
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  writeFileSync(resolve(root, "lib/frame-d1-schema-whitelist.ts"), generatedWhitelist(root));
  console.log(JSON.stringify(schemaWhitelist(root)));
}
