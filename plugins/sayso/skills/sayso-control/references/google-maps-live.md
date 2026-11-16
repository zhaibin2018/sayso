<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->
# Generic Live acceptance examples

Examples use the same open-app, click and type skills. They introduce no app-specific coordinates or code.

- 中文 “打开淘宝”。 Search uses the user's permitted pinyin, such as `taobao`. confirm the installed app from actual images.
- English “Open Google Maps and search for Changi Airport.” Open Maps from the actual installed result, then select its visible field, type the requested destination and submit when supported.
- English “Scroll down and tap the item I mentioned.” Use the actual scroll after-image to choose the next target.

For a full-flow timing trial, measure from the user-visible acknowledgment to the first image proving the requested result. Record reporting latency separately and use one or calibrated timebases. Adopt the currently agreed KPI.

For iPhone 11 acceptance, use a new chat inside the SaySo project, Chat mode, Instant, with Live active. Live must choose every tested target from plugin images. WDA may prepare sharing and this test chat only; it must not select or execute the measured phone actions. Record each tool, request ID, source frame, returned frame, original action ID, image age and elapsed time. Count initial reads separately from recovery reads; no normal intermediate `read_screen` is allowed. An unobserved final result is not a pass. Distinguish real-device outcomes, historical JPEG replay and synthetic fixtures. A server image release, model visual recognition and final voice response each need their own evidence.
