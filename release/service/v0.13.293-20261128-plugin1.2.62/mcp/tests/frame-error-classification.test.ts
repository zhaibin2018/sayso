import { test } from "node:test";
import assert from "node:assert/strict";
import { BridgeError } from "../lib/bridge-engine.ts";
import { runWithBridgeContext } from "../lib/bridge-context.ts";
import {
  withFrameErrors,
  frameStage,
  frameErrorStages,
  verifiedFrameIDs,
  logFrameFailure,
  classifyFrameException,
} from "../lib/frame-error-classification.ts";

const device = crypto.randomUUID(),
  session = crypto.randomUUID(),
  broadcast = crypto.randomUUID(),
  frame = crypto.randomUUID();
const request = (path = "frame") =>
  new Request("https://offline.invalid/v1/device/" + path, {
    method: "POST",
    headers: { "cf-ray": "0123456789abcdef-SIN", Authorization: "Bearer PRIVATE_TOKEN" },
  });
test("D213 every stage projects only fixed fields, deduplicates and defers errors", async () => {
  for (const stage of frameErrorStages) {
    const jobs: Promise<unknown>[] = [],
      logs: Record<string, unknown>[] = [],
      original = console.error;
    console.error = (value) => {
      logs.push(JSON.parse(value));
    };
    try {
      await runWithBridgeContext(
        {
          waitUntil: (job) => {
            jobs.push(job);
          },
        },
        () =>
          withFrameErrors(request(), async () => {
            verifiedFrameIDs(
              device,
              {
                frame_id: frame,
                bridge_session_id: session,
                broadcast_id: broadcast,
                secret: "PRIVATE_BODY",
              },
              { id: session, broadcast_id: broadcast },
            );
            frameStage(stage);
            const error = new Error("SQL PRIVATE_SQL bind PRIVATE_BIND image PRIVATE_IMAGE", {
              cause: new Error("D1_ERROR: UNIQUE constraint failed: sb_observations.id"),
            });
            logFrameFailure(error);
            logFrameFailure(error);
            assert.equal(logs.length, 0);
            assert.equal(jobs.length, 1);
          }),
      );
      await Promise.all(jobs);
      assert.deepEqual(logs, [
        {
          request_id: "0123456789abcdef-SIN",
          route: "/v1/device/frame",
          device_id: device,
          session_id: session,
          broadcast_id: broadcast,
          frame_id: frame,
          stage,
          exception: "D1_CONSTRAINT",
          constraint: "UNIQUE:sb_observations.id",
          ...(stage.startsWith("FRAME_TRANSACTION")
            ? {
                d1_message_match: "UNMATCHED",
                error_message_length:
                  "SQL PRIVATE_SQL bind PRIVATE_BIND image PRIVATE_IMAGE".length +
                  "D1_ERROR: UNIQUE constraint failed: sb_observations.id".length,
                failed_statement_index: null,
                statement_index_basis: "UNAVAILABLE",
              }
            : {}),
        },
      ]);
      assert.doesNotMatch(
        JSON.stringify(logs),
        /PRIVATE|"stack"|"message"|"headers"|"body"|"sql"|"token"/i,
      );
    } finally {
      console.error = original;
    }
  }
});
test("D213 nested exceptions collapse to known database and business codes", () => {
  const cases = [
    [
      new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'PRIVATE'"),
      "FRAME_TRANSACTION",
      { exception: "D1_OTHER", reason: "D1_UNSUPPORTED_TYPE" },
    ],
    [
      new Error("NOT NULL constraint failed: private_table.private_column"),
      "FRAME_TRANSACTION",
      { exception: "D1_CONSTRAINT", constraint: "NOT_NULL:OTHER" },
    ],
    [
      new Error("D1_ERROR: ERASURE_SCOPE_CLOSED: SQLITE_CONSTRAINT"),
      "FRAME_TRANSACTION",
      { exception: "D1_CONSTRAINT", constraint: "ERASURE_SCOPE_CLOSED" },
    ],
    [
      new Error("D1_ERROR: no such column: PRIVATE"),
      "AUTH_SNAPSHOT",
      { exception: "D1_OTHER", reason: "D1_NO_SUCH_COLUMN" },
    ],
    [new SyntaxError("PRIVATE_JSON"), "METADATA_PARSE", { exception: "JSON" }],
    [new Error("PRIVATE_STREAM"), "BODY_READ", { exception: "STREAM" }],
    [new Error("PRIVATE_R2"), "R2_PUT", { exception: "R2" }],
    [
      new BridgeError("OLD_CAPTURE"),
      "BUSINESS_CHECK",
      { exception: "BUSINESS_REJECT", reason: "OLD_CAPTURE" },
    ],
    [
      new BridgeError("PRIVATE_BUSINESS"),
      "BUSINESS_CHECK",
      { exception: "BUSINESS_REJECT", reason: "OTHER_BUSINESS" },
    ],
    [
      { message: "D1_ERROR: PRIVATE", stack: "PRIVATE" },
      "RETURN",
      { exception: "D1_OTHER", reason: "D1_UNCLASSIFIED" },
    ],
  ] as const;
  for (const [error, stage, expected] of cases)
    assert.deepEqual(classifyFrameException(error, stage), expected);
});
test("D213 absent authority, mismatched scopes, foreign routes and failing sinks stay bounded", async () => {
  const logs: Record<string, unknown>[] = [],
    original = console.error;
  console.error = (value) => {
    logs.push(JSON.parse(value));
  };
  try {
    await withFrameErrors(request("frame-observation"), async () => {
      verifiedFrameIDs("PRIVATE_DEVICE", { frame_id: "PRIVATE_FRAME" });
      logFrameFailure(new SyntaxError("PRIVATE"));
    });
    assert.deepEqual(
      Object.keys(logs[0]).sort(),
      ["request_id", "route", "stage", "exception"].sort(),
    );
    await withFrameErrors(request(), async () => {
      verifiedFrameIDs(
        device,
        { frame_id: frame, bridge_session_id: session, broadcast_id: broadcast },
        { id: crypto.randomUUID(), broadcast_id: broadcast },
      );
      logFrameFailure(new Error("PRIVATE"));
    });
    assert.equal(logs[1].session_id, undefined);
    assert.equal(logs[1].broadcast_id, undefined);
    await withFrameErrors(request("status"), async () => {
      logFrameFailure(new Error("PRIVATE"));
    });
    assert.equal(logs.length, 2);
    console.error = () => {
      throw new Error("sink failed");
    };
    await withFrameErrors(request(), async () => {
      logFrameFailure(new Error("PRIVATE"));
    });
    await runWithBridgeContext(
      {
        waitUntil: () => {
          throw new Error("scheduler failed");
        },
      },
      () =>
        withFrameErrors(request(), async () => {
          logFrameFailure(new Error("PRIVATE"));
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    console.error = original;
  }
});
test("D213 concurrent requests keep stage and authority isolated and normal paths emit nothing", async () => {
  const logs: Record<string, unknown>[] = [],
    original = console.error;
  console.error = (value) => {
    logs.push(JSON.parse(value));
  };
  try {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await Promise.all([
      withFrameErrors(request(), async () => {
        verifiedFrameIDs(device);
        frameStage("BODY_READ");
        await gate;
        logFrameFailure(new Error("PRIVATE"));
      }),
      withFrameErrors(request("frame-observation"), async () => {
        frameStage("RETURN");
        logFrameFailure(new Error("PRIVATE"));
        release();
      }),
    ]);
    assert.equal(logs.find((x) => x.route === "/v1/device/frame")?.stage, "BODY_READ");
    assert.equal(
      logs.find((x) => x.route === "/v1/device/frame-observation")?.device_id,
      undefined,
    );
    const jobs: Promise<unknown>[] = [];
    assert.deepEqual(
      await runWithBridgeContext(
        {
          waitUntil: (job) => {
            jobs.push(job);
          },
        },
        () =>
          withFrameErrors(request(), async () => {
            frameStage("RETURN");
            return { accepted: true };
          }),
      ),
      { accepted: true },
    );
    assert.equal(logs.length, 2);
    assert.equal(jobs.length, 0);
  } finally {
    console.error = original;
  }
});

test("D213 documented D1 failures and non-Error causes remain enumerated without raw details", () => {
  for (const [message, reason] of [
    [
      "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. PRIVATE",
      "D1_DAILY_ROW_WRITE_LIMIT",
    ],
    [
      "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. PRIVATE",
      "D1_DAILY_ROW_READ_LIMIT",
    ],
    ["D1_ERROR: D1 DB is overloaded. Requests queued for too long. PRIVATE", "D1_QUEUE_TIMEOUT"],
    ["D1_ERROR: D1 DB is overloaded. Too many requests queued. PRIVATE", "D1_QUEUE_FULL"],
    ["D1_ERROR: D1 DB exceeded its CPU time limit and was reset. PRIVATE", "D1_CPU_RESET"],
    ["D1_ERROR: too many SQL variables PRIVATE", "D1_VARIABLE_LIMIT"],
  ]) {
    for (const cause of [new Error(message), { message }, message]) {
      assert.deepEqual(
        classifyFrameException(new Error("D1_ERROR", { cause }), "FRAME_TRANSACTION"),
        { exception: "D1_OTHER", reason },
      );
    }
  }
  const error = {
    message: "D1_ERROR",
    cause: { message: "NOT NULL constraint failed: sb_frames.metadata PRIVATE" },
  };
  assert.deepEqual(classifyFrameException(error, "FRAME_TRANSACTION"), {
    exception: "D1_CONSTRAINT",
    constraint: "NOT_NULL:sb_frames.metadata",
  });
  const hostile = Object.defineProperty({}, "message", {
    get() {
      throw Error("must not run");
    },
  });
  assert.deepEqual(classifyFrameException(hostile, "RETURN"), { exception: "UNKNOWN" });
});

test("D213 repository expression-depth classification and SQLite/parser limits preserve safe enums", () => {
  for (const [message, reason] of [
    ["Expression tree is too large (maximum depth 1000)", "D1_EXPRESSION_DEPTH"],
    ["too many levels of trigger recursion", "D1_TRIGGER_RECURSION"],
    ["parser stack overflow", "D1_PARSER_STACK"],
    ["Failed to parse body as JSON, got: PRIVATE", "D1_INVALID_UPSTREAM_JSON"],
  ])
    assert.deepEqual(
      classifyFrameException(new Error("D1_ERROR: " + message), "FRAME_TRANSACTION"),
      { exception: "D1_OTHER", reason },
    );
});

test("D213 long D1 query wrappers retain only fixed reasons from their tail", () => {
  const sql = "PRIVATE_SQL_AND_BIND ".repeat(5000);
  for (const [tail, expected] of [
    [
      "Expression tree is too large (maximum depth 100)",
      { exception: "D1_OTHER", reason: "D1_EXPRESSION_DEPTH" },
    ],
    [
      "NOT NULL constraint failed: sb_frames.metadata",
      { exception: "D1_CONSTRAINT", constraint: "NOT_NULL:sb_frames.metadata" },
    ],
    ["malformed JSON", { exception: "D1_OTHER", reason: "D1_MALFORMED_JSON" }],
  ] as const) {
    const message = "D1_ERROR: " + sql + tail;
    for (const error of [new Error(message), new Error("D1_ERROR", { cause: { message } })]) {
      const value = classifyFrameException(error, "FRAME_TRANSACTION");
      assert.deepEqual(value, expected);
      assert.doesNotMatch(JSON.stringify(value), /PRIVATE/);
    }
  }
});
