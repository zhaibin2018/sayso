---
name: sayso-debug
description: "给我调试报告、调试信息、出错报告、出错了帮我查一下、生成报告；debug report, troubleshooting report, something went wrong, show diagnostics. Fetch the SaySo server report and paste it unchanged, including in Live voice; never translate or rewrite the report."
---

# Debug report

Paste the server `report` verbatim; do not translate, summarize or rewrite it.

Call `get_debug_report` first. Defaults are 15 minutes and 20 entries; use `minutes` (1–60) and `limit` (1–50) when requested. For `CHOOSE_DEVICE`, use a device already established in the conversation or ask the user which device. Do not read the screen, click, retry the failed operation or change permission to generate a report.

The server `report` is complete Markdown with 【环境】【当前状态】【最近操作】【最近状态变化】【汇总】 and SGT millisecond timestamps. Preserve every field, error code and unknown value exactly, including its language. If the tool fails, retain the actual request ID/error code and state that no server report was obtained; never invent a report.

Prepend a conversation-only section using the visible history, leaving the entire server report unchanged below it:

【这次对话的经过】 / [This conversation]

| # | 用户的指令 / Request | 操作顺序 / Tool calls | 请求 ID / Request IDs | 结果 / Results | 尝试 / Attempts |
|---|---|---|---|---|---|

- One row per user instruction; join actual ordered calls with arrows and align their IDs/results/attempts with slashes. Copy full request IDs only from actual `mcp_request_id` or `sayso_performance.request_id`; compare with server records. If outside the server window, say “服务器记录不可用 / Server record unavailable”. Missing IDs, unavailable history or uncertain counts are “未知 / Unknown”.
- Prefer the server's same-tool/same-target attempt number within 60 seconds; label conversation-only retries separately. State actual call count, retries and final outcome only when supported by visible evidence.
- Summarize requests safely: replace literal input with “输入文字 / Text entry”; omit personal details, credentials, proofs, signatures, screenshots, image links, encoded data and tool parameters. Keep only operation names, request IDs, results and counts. Add no report secrets or images.
- This section stays in the reply; never save, upload or send it to the server. Server totals may include other conversations and are not this conversation's call count. If there are no visible prior operations, keep the table header and say “本次对话无可用操作记录 / No operation history is available in this conversation”.

For an expected wait longer than a few seconds, briefly say “好，我取一下调试报告。 / Okay, I'll get the debug report.” In Live voice, put the complete report into the chat and say only “调试报告已经放在对话里了，可以直接复制。 / The debug report is in the chat, ready to copy.” Do not read the report aloud. In text, output the complete report directly.
