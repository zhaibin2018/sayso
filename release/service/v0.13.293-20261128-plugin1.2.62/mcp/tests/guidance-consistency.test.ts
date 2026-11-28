import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { allMcpTools, compatibilityToolNames, mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { phoneWorkflowInstructions, afterImageInstruction } from "../lib/interaction-guidance.ts";
import { controlGuide, controlWorkflows } from "../lib/control-guide.ts";
const tools = mcpToolsForAudience(),
  names = new Set(tools.map((t) => t.name));
const parameters = new Set(tools.flatMap((t) => Object.keys(t.inputSchema.properties)));
const outputs = new Set(["click_at_source", "click_at_instruction", "stop_reason","search_command_id","type_command_id"]);
export function validateReferences(text: string) {
  for (const name of text.match(
    /\b(?:read|get|stop|move|click|drag|scroll|type|open|create|list|revoke|prepare|search|run|view)_[a-z_]+\b/g,
  ) ?? [])
    assert.ok(
      names.has(name) || compatibilityToolNames.has(name) ||
        parameters.has(name) ||
        (controlWorkflows as readonly string[]).includes(name) ||
        outputs.has(name),
      `Unknown production tool reference: ${name}`,
    );
  for (const call of text.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(([^)\n]*)\)/g)) {
    const tool = tools.find((t) => t.name === call[1]);
    if (!tool) continue;
    for (const parameter of call[2].matchAll(/\b([a-z]+(?:_[a-z]+)*)\s*=/g))
      assert.ok(
        Object.hasOwn(tool.inputSchema.properties, parameter[1]),
        `${call[1]} has no parameter ${parameter[1]}`,
      );
  }
  for (const ref of text.matchAll(/\b([a-z]+(?:_[a-z]+)+)\.([a-z]+(?:_[a-z]+)*)\b/g)) {
    const tool = tools.find((t) => t.name === ref[1]);
    if (tool)
      assert.ok(
        Object.hasOwn(tool.inputSchema.properties, ref[2]),
        `Unknown qualified parameter: ${ref[0]}`,
      );
  }
  assert.doesNotMatch(
    text,
    /Region-center|x=0\s*(?:,|and)\s*y=0|target_region|landmark_region|calibrated relative path|focus PNG|current reviewed image|existing confirmation mechanism|\b(?:reviewed|crops|regions)\b/i,
  );
}
function schemaDescriptions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(schemaDescriptions);
  return Object.entries(value).flatMap(([key, item]) =>
    key === "description" && typeof item === "string" ? [item] : schemaDescriptions(item),
  );
}
test("production instructions and descriptions reference only current tools and call parameters", () => {
  for (const text of [
    phoneWorkflowInstructions,
    afterImageInstruction,
    ...tools.map((t) => t.description),
    ...tools.flatMap((t) => schemaDescriptions(t.inputSchema)),
    ...controlWorkflows.map((w) => JSON.stringify(controlGuide(w))),
  ])
    validateReferences(text);
  for (const tool of tools)
    assert.ok(
      tool.description.length <= (tool.name === "click_at" ? 800 : 500),
      `${tool.name}: ${tool.description.length}`,
    );
  assert.match(JSON.stringify(controlGuide("pointer")), /T6:.*do not call click_at/);
  assert.ok(
    !allMcpTools
      .find((t) => t.name === "stop_session")!
      .inputSchema.required.includes("bridge_session_id"),
  );
});
test("reference checker rejects retired tools and invented input parameters", () => {
  for (const text of [
    "call read_screen_text",
    "click_at(target_region=box)",
    "drag_at(invented_delay=3)",
    "click_at.target_region",
    "Exact reviewed JPEG frame",
    "No crops needed",
    "Use two regions",
  ])
    assert.throws(() => validateReferences(text));
  validateReferences('type_text_in_field(submit="enter")');
});
// Source package CI need not contain a private plugin checkout. Validate the public bundle
// when present, or the sibling owned plugin during local development.
const roots = [
  join(import.meta.dirname, "../../plugin/skills"),
  join(import.meta.dirname, "../../plugins/sayso/skills"),
];
const root = roots.find((p) => {
  try {
    return readdirSync(p).length > 0;
  } catch {
    return false;
  }
});
test(
  "packaged production skills have current references and no internal acceptance instructions",
  { skip: !root },
  () => {
    const walk = (p: string): string[] =>
      readdirSync(p, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(p, e.name)) : e.name.endsWith(".md") ? [join(p, e.name)] : [],
      );
    for (const file of walk(root!)) {
      const text = readFileSync(file, "utf8");
      validateReferences(text);
      assert.doesNotMatch(text, /WDA|iPhone 11 acceptance|sayso\.davidzhai/);
    }
  },
);

test("rereview wording states actual limits, binding and revocation scope", () => {
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  assert.match(
    tool("type_text_in_field").description,
    /max_text_len.*150/,
  );
  assert.match(tool("move_mouse_to").description, /original dimensions and orientation/);
  assert.doesNotMatch(tool("move_mouse_to").description, /exact source/);
  assert.equal(
    tools.some((t) => t.name === "revoke_device"),
    false,
  );
  assert.match(
    tool("cancel_current_operation").description,
    /permission and screen sharing are unchanged/,
  );
  assert.equal(controlGuide("overview").guide_revision, "2.8.0");
  assert.doesNotMatch(
    JSON.stringify(controlGuide("overview")),
    /historical-image replay|synthetic fixtures/,
  );
  for (const name of ["stop_mouse", "stop_session"]) {
    assert.ok(!names.has(name));
    const props = allMcpTools.find((t) => t.name === name)!.inputSchema.properties;
    const field = Object.values(props)[0] as { type: unknown; format?: string };
    assert.deepEqual(field.type, ["string", "null"]);
    assert.equal(field.format, undefined);
  }
});

test(
  "plugin presentation is bilingual and discovered skills declare names and invocation policy",
  { skip: !root },
  () => {
    const plugin = JSON.parse(readFileSync(join(root!, "..", "plugin.json"), "utf8"));
    const ui = plugin.extensions?.["com.openai"]?.interface ?? plugin.interface;
    const baseline=JSON.parse(readFileSync(new URL("./fixtures/plugin-1.2.54-manifests.json",import.meta.url),"utf8"));
    assert.deepEqual({...plugin,version:"1.2.54"},baseline.root,"Only the version changes in the published manifest");
    for (const text of [plugin.description, ui.shortDescription, ui.longDescription]) {
      assert.match(text, /[A-Za-z]/);
      assert.match(text, /[\u4e00-\u9fff]/);
      assert.doesNotMatch(text, /\bESP\b/);
    }
    assert.ok(
      ui.shortDescription.length <= 30 && ui.shortDescription.length <= ui.longDescription.length,
    );
    const skills = readdirSync(root!, { withFileTypes: true }).filter((e) => e.isDirectory());
    const overlay = join(root!, "..", ".codex-plugin/plugin.json");
    const compatibility = existsSync(overlay) ? JSON.parse(readFileSync(overlay, "utf8")) : plugin;
    assert.deepEqual({...compatibility,version:"1.2.54"},baseline.overlay);
    assert.equal(compatibility.skills ?? "./skills", "./skills");
    assert.ok(skills.length > 0, "The configured skill directory must contain skills");
    const discoveredNames = new Set<string>();
    for (const skill of skills) {
      const entry = join(root!, skill.name, "SKILL.md");
      assert.ok(existsSync(entry), `Missing skill entry: ${skill.name}`);
      const source = readFileSync(entry, "utf8");
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      assert.ok(frontmatter, `Missing skill metadata: ${skill.name}`);
      const name = frontmatter[1].match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1];
      assert.equal(name, skill.name, "Discovered directory and declared skill name must agree");
      assert.ok(!discoveredNames.has(name!), `Duplicate skill name: ${name}`);
      discoveredNames.add(name!);
      assert.match(frontmatter[1], /^description:\s*\S.+$/m);
    }
    for (const skill of skills)
      assert.match(
        readFileSync(join(root!, skill.name, "agents/openai.yaml"), "utf8"),
        /policy:\s*\n\s+allow_implicit_invocation: true/,
      );
  },
);

test("D26 uses app-name pinyin only for system app discovery", () => {
  const sources = [
    ...controlWorkflows.map((name) => JSON.stringify(controlGuide(name))),
    JSON.stringify(tools),
  ];
  if (root) {
    const walk = (p: string): string[] =>
      readdirSync(p, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(p, e.name))
          : e.name.endsWith(".md")
            ? [readFileSync(join(p, e.name), "utf8")]
            : [],
      );
    sources.push(...walk(root));
    for (const path of [
      "sayso-control/references/workflows.md",
      "sayso-type-text/SKILL.md",
      "sayso-open-app/SKILL.md",
    ]) {
      const text = readFileSync(join(root, path), "utf8");
      assert.match(text, /Only in system search to find an app/);
      assert.match(text, /enter the app name in pinyin \(for example taobao\)\./);
      assert.match(text, /Elsewhere, do not transliterate Chinese into pinyin/);
      assert.match(text, /English \(ABC\)/);
      assert.match(text, /pinyin candidates or garbled text without retyping/);
    }
  }
  for (const source of sources)
    assert.doesNotMatch(
      source,
      /Pinyin entry is not supported|use pinyin only when (?:the )?user permits|pinyin (?:needs|requires) user permission|Use English \(ABC\); do not transliterate/i,
    );
  assert.match(
    JSON.stringify(controlGuide("search_taobao")),
    /enter the app name in pinyin \(for example taobao\)\./,
  );
  assert.match(
    phoneWorkflowInstructions,
    /Only in system search to find an app.*Elsewhere, do not transliterate Chinese into pinyin/,
  );
});

test("exposed guidance describes phone operations without host approval instructions", () => {
  const sources = [
    phoneWorkflowInstructions,
    afterImageInstruction,
    ...controlWorkflows.map((name) => JSON.stringify(controlGuide(name))),
    ...mcpToolsForAudience("development").flatMap((tool) => [
      tool.description,
      ...schemaDescriptions(tool.inputSchema),
    ]),
  ];
  if (root) {
    const walk = (path: string): string[] =>
      readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(path, entry.name))
          : /\.(?:md|yaml)$/.test(entry.name)
            ? [readFileSync(join(path, entry.name), "utf8")]
            : [],
      );
    sources.push(...walk(root));
  }
  for (const text of sources)
    assert.doesNotMatch(
      text,
      /approval|classifier|\b(?:low|high)[ -]risk\b|\b(?:no|without|skip) confirmation\b|without asking|(?:no|without|without repeated) (?:additional |extra )?permission(?: questions)?|needs no additional permission|do not ask which app|无需确认|无须确认|批准|不必等批准卡片/i,
    );
});
