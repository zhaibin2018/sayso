# SaySo — Sites MCP

## Immediate screen reader

For ordinary current-screen questions use `read_screen` directly. It returns an actual capture only if the active owner, broadcast, worker lease, orientation and conservative capture age pass. The age is strictly less than 2000 ms at Sites release, including response serialization. A user may request a smaller cap. Earlier presentation-only heartbeats leave the original capture time unchanged and never qualify stale pixels. An explicit `if_unchanged_since` may reuse a still-visible image when a fresh actual capture proves the same pixels, scope and geometry. The default returns image bytes.

A fresh direct read uses one database snapshot, with no product database writes, capture request or R2 wait. An active stream missing eligible pixels can retry within the existing 15-second soft budget. Missing images and timeouts count as unsuccessful visual trials. `view_screen` and `get_latest_screen` retain explicit capture-refresh behavior, and their real image egress has the same age gate. Compound after-images also pass this gate without changing the original command result.

The iOS sampler still depends on actual ReplayKit callbacks; it cannot force a new screenshot. Repeated presentation and clock maintenance now run independently of those callbacks. Upload congestion lowers image quality/size rather than introducing two/five-second intentional gaps; the existing one-in-flight/latest-only queue still bounds work. Unusually large JPEGs are recompressed to fit the 256 KiB immediate-read cache. A successful zero-byte unchanged-frame observation represents a newly sampled frame, not a renewal of an unseen old screenshot. The phone update must be installed before relying on this cadence.

Upload validation combines active session, lease, prior frame, replay check, clock probe and capture-refresh state into one SQL snapshot. The transaction committing the frame still rechecks the current lease/session and frame ordering. Pure reader timings appear as metadata-only `screen_read` Worker console events, not new D1 product records.

The response goal is less than 4000 ms from end of speech to first meaningful answer, also recording speech-start-to-answer duration. Tool timing, an empty/unavailable response, a software fixture, or a completed text-agent turn does not establish that voice goal. Actual iPhone acoustic end-to-end acceptance remains separate. Use a fast conversation configuration and a short direct screen question; avoid a preliminary device/profile lookup or a delegated development task for simple visual replies. The service never calls another LLM API.

Runtime 0.6.2 introduced125/250/500ms bounded backoff for empty legacy capture-refresh polling. The current pure reader uses only the bounded snapshot retries described above. A paused broadcast returns `paused / CAPTURE_PAUSED` directly, with `worker_online` indicating whether its heartbeat is still valid; it preserves the last reported pause state even when iOS suspends the worker. A paused device does not make a separate active phone ambiguous. No paused image is returned. Broadcast heartbeat USB readiness reflects that worker's report instead of a previous foreground diagnostic. Upload timing metadata includes the sampling reason and whether the image hash matched the previous image, without recording image bytes or a screenshot history.

An authenticated heartbeat from the same current capture-only worker/session/epoch may recover after iOS suspends its timers beyond the lease deadline. A replaced worker, stopped session or revoked device cannot recover. This does not renew a foreground LED or actuator grant: capture heartbeat still returns `all_release` and zero control budget. A recovered worker still needs a sufficiently fresh actual frame for live output.

MCP0.13.43 combines normal `POST /v1/device/frame-observation` authentication, first confirmation and observation admission into one D1 batch/RPC. The transaction derives device/owner from the current unrevoked, unexpired bearer hash and validates session/worker/lease/sequence/orientation/dimensions/hash/clock/freshness. It updates observation metadata and inserts a replay marker only after the authorized update succeeds; a miss does not create or delete markers. JPEG bytes and the original capture clock are unchanged. Explicit refresh correlation, unknown clocks and missing/non-inline references use the compatible fallback with a fresh token-bound snapshot; no authentication grant is cached.

Only this observation route may parse at most16KiB of JSON metadata before database authentication, bounded by a1500ms body-read timeout. Missing/malformed bearer headers fail immediately; payload errors remain hidden until authentication succeeds, and unauthenticated requests cannot write frames. JPEG upload authentication order is unchanged. Normal observation receipts and numeric history now include HTTP-handler entry, body-read, hash-completion and authenticated-batch boundaries, plus monotonic request-to-commit duration. The new `authenticated_atomic_observation` / `authenticated_validation_commit_rpc` timings include authentication; older `atomic_observation` timings exclude it and must not be compared as equal scopes. Handler entry does not measure Site ingress, URLSession or phone request preparation. This optimization removes a known serial database round trip; it does not establish the cause of a physical5–6second publication gap or a phone performance target.

This owner-private Sites service is separate from the original ESP32 ping/synthetic-image plugin. It implements screen sharing and opt-in foreground ESP32 LED diagnostics using managed Sites OAuth, D1 state and private R2 images. The Python/FastAPI/PostgreSQL reference service remains in the parent ScreenBridge project; the user explicitly selected Sites for this deployment.

The current ChatGPT conversation is the only LLM. This service exposes MCP tools and image transport; it does not call a model API, use an OpenAI API key, push into arbitrary conversations or wake an ended model turn. Live voice/tool availability must be tested in the actual client.

Phone setup: authenticated MCP `create_pairing_code` creates a five-minute, single-use code. The phone redeems it at `/v1/device/pair`, receives its device token only once and stores it in Keychain. Private Sites service access is a separate, origin-scoped Keychain credential. Developer bootstrap uses an encrypted capsule addressed to a public key generated on the phone; plaintext credentials are not staged on disk or sent in launch arguments.

Only authenticated video frames from ReplayKit are accepted. Server decode/hash/dimension checks precede the current-frame update. Frame ordering, worker epoch, session, broadcast, capture clocks and refresh correlation are checked. A 30-second logical cache TTL and bounded edge cleanup retain only the current readable image; explicit stop/revoke removes it and fences old uploads. Edge cleanup can evict an inactive cache slightly early. A cloud deletion cannot remove a picture already delivered to a chat.

`get_latest_screen` returns JPEG MCP image content, never a public screenshot URL. The Site's service bearer is not a user identity: MCP user data always requires the Sites-injected authenticated caller ID, and phone APIs require their own device token. `set_led` is the only ESP32 action published; there are no HID tools or arbitrary USB/developer commands.

For LED testing, connect MCU-USB to iPhone, stop any existing broadcast, turn off “仅共享屏幕（不连接板子）” under Connection → USB configuration, then choose Home → 开发诊断 → 开始前台云端点灯诊断. Keep ScreenBridge foreground. This explicit phone action binds locally authenticated board identity, starts a worker lease, and enables only `led.set`. ChatGPT calls the MCP `set_led` tool; the existing iOS worker claims it over HTTPS and sends authenticated MIDI/NCM to the board. No Mac app automation is involved. `get_command_result` reads progress. Queued requests expire after 10 seconds; starts receive at most 2.5 seconds of execution budget. Board boot, owner, worker/session/control epochs and idempotency are checked. A `board_acked` result means the authenticated phone verified the board receipt; physical illumination still needs observation. An uncertain outcome is never replayed automatically.

Image TTL is a logical access/cleanup policy. The bounded inline JPEG transport cache also resides in D1; managed database backups can retain older bytes beyond that TTL. It is not a promise of physical erasure from backups within 30 seconds.

`list_devices.last_diagnostic` includes the latest foreground session's phone-supplied stop reason and server timestamp. A delayed stop from a superseded worker must not clear the replacement worker's USB readiness. This does not prevent an old iOS worker from issuing its own local USB stop, so avoid repeatedly starting diagnostics; if multiple workers were started, fully close and reopen the app before starting once. MCP catalogue scans log only runtime version and tool names, with no caller identity or credentials.

Validation commands:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/bridge.test.ts
```

The tests use isolated in-memory SQLite and JPEG fixtures and are software evidence only. Native publication applies the schema-only Drizzle migrations and configures the D1/R2 bindings declared in `.openai/hosting.json`. Source and publication are managed by the Sites workflow helper. No local preview/backend process is required for the real cloud test.

Metrics distinguish cloud handler, JPEG decode, object-store work, image byte count and MCP image preparation. They do not claim to measure model inference or voice playback. Real ReplayKit/background/native ChatGPT acceptance is recorded separately after actual device/tool execution.

## SaySo operating guide

`get_control_guide(workflow)` returns static, authenticated guidance for opening apps, verified pointer clicks, scrolling, Taobao/Maps, clipboard limitations and stopping. It makes no device or database calls. The portable Skills are maintained under `plugin/skills` in the main SaySo source workspace. Clipboard/text/long-press capabilities remain unavailable.

The current managed origin is `https://YOUR-SITE.chatgpt.site`; the MCP server advertises `sayso`. `get_screen_metrics` uses one owner-gated read-only D1 batch for diagnostics and voice history, with no relaxation of image freshness.

## Missing-frame recovery

`read_screen` retries transient missing/expired pixels until success or one total monotonic wait_for_new_ms budget: default15000ms, maximum15000ms. Minimum attempt-start intervals150/300/450ms then500ms pace requests; elapsed snapshot time consumes the interval instead of adding another full sleep; each snapshot rechecks the same owner/device/session/lease. `wait_for_new_ms:0` disables freshness retries, while a required authorized cache-to-inline fallback remains possible. No capture request, productDB write or input is made. Normal fresh reads stay one snapshot. Ordinary visual reads require an actual image younger than 2000 ms at Sites release. This is a soft scheduling deadline: no new query starts after it, but an in-flight remote query may finish later. Recovery includes attempts, total wait, elapsed budget and success/timeout/terminal/no_wait termination.

Phone publishers may attach `after_command_id` to a forced post-input JPEG or same-image observation. Admission validates this optional UUID and discards it, so the tag cannot block the phone's next frame or become stored authority. It never enables mouse control, refreshes a capture timestamp or proves an application effect. `read_screen(after_command_id)` independently requires the real saved phone acknowledgement, the same current scope and a strictly later original capture clock.

## JPEG validation profile

`strict_components_v1` retains the pinned jpeg-js strict entropy decode,4.2MP guard and equivalent48MiB legacy allocation admission. It omits unused color conversion and alpha output; one byte per expected pixel is reserved from the memory allowance to avoid widening admission merely through a smaller output. Only dimensions leave the helper. Original authenticated JPEG bytes are stored and delivered unchanged. Upload metadata records the profile for later controlled device comparisons; local CPU savings are not a production latency or freshness guarantee.

## Post-receipt image ordering

`read_screen(after_command_id)` is a pure snapshot gate, not a capture request. It checks the owner, current device/session/worker/lease/control revision, a saved confirmed phone board-ack observation, verified capture clock and strict capture-lower>ack ordering in one database snapshot. Earlier/equal frames return no pixels and may re-read once within the existing soft budget. Old rows retain NULL timing; ESP uptime and server wall time are never substituted. Temporal proof remains separate from actual pointer landing/page effect and from permission for another input. Default snapshots now include source timing/scope so callers do not need a separate device lookup. App24 already sends the relevant phone timestamp; no phone update is needed for its retention.

## Write plus after-image

Mouse write tools now default to observe_after=true. A confirmed, timestamped phone acknowledgement may use the remaining original wait_ms budget for a strict-freshness, same-command after-image. Input result and after_screen/observation_state are separate; image-read failures never discard an acknowledged command or resend it. observe_after=false is receipt-only. Move remains move-only: inspect its real landing image before clicking. Image content is emitted once, never inside structured JSON. The shared deadline is a soft scheduling limit for geometry/receipt/image work; an already-started remote lookup can finish later.

## Device list snapshot

`list_devices` reads at most20 owner-scoped non-revoked devices, active sessions, frame metadata, hardware capabilities and latest diagnostic in one SELECT snapshot. Every join binds device and owner; no image bytes or device credentials are selected. The status projection is shared with the phone status path, and expiry is checked after the lookup. This reduces one active device from6D1 requests to1 and20active devices from101to1; the earlier per-device chains ran in parallel, so101requests never meant101serial waits. Lists remain initialization/diagnostic information, never input permission or a substitute for a current screen.

## Read recovery observations

Unavailable or recovered reads expose compact recovery.frame_progress from already authorized attempt endpoints: no frame, the same observed frame, or changed frame identities. It includes the last observed frame/source sequence, original capture lower bound and age, plus maximum lookup-phase duration. A sole known source sequence cannot prove no advancement;unknown comparison remains null. These fields do not prove every ReplayKit callback or a network cause, do not modify capture time and do not authorize input. Scope/permission termination redacts previous frame details. Normal one-snapshot success omits the progress projection;no extra query is made.

MCP0.13.44 extends only read_screen missing/expired-frame recovery patience to15seconds after a controlled App29 calculator case showed5.597seconds without video input while the broadcast and nonvideo callbacks remained live. It does not cure that source silence,retime old pixels,request capture or send HID. A normal fresh snapshot still returns immediately in one D1 read. Explicit wait_for_new_ms=5000/0 remain supported;pause,revocation and scope changes terminate promptly. Mouse-write shared budgets and legacy refresh-route limits remain unchanged. That release used a 1500 ms Sites gate. A longer retry budget alone establishes neither end-to-end latency nor a visual success rate.

## Google Maps Live MVP guidance

App33 also resolves the current Site-admitted image when an upload response was lost, including the first frame with no phone ACK. Its independent presentation request carries current source geometry and a fresh clock proof; a known frame ID only suppresses redundant reference metadata. The Site selects the original current frame under the same authorization transaction and preserves its capture timestamp. No new image ID or fresh capture is manufactured.

The existing maps/open_app guide now follows the same-iPhone Live route: visible AssistiveTouch Home, Home Search, Spotlight focus, mouse clicks on English screen-keyboard keys, installed-app result, real map-page confirmation and original Live voice return. Live screen viewing is already user-confirmed; control writes, background continuation, local keyboard batching and final voice return still need actual device evidence. There are no new typing or batch MCP tools. The unpublished Swift batch contract/progress kernel does not make local pixel/focus/pointer checks ready.
