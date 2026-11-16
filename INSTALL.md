# Install your private SaySo service

**One entry, not silent authorization.** This guide is for ChatGPT Work to deploy the supplied MCP source into the user's own private Site and attach the supplied skills to that Site's existing plugin. It does not install the iOS app, flash firmware or approve phone control. New-account/iPhone end-to-end setup and automatic configuration handoff are not yet accepted.

## User instruction

Ask ChatGPT Work to follow the fixed-commit link to this guide, create or resume your private SaySo Site, deploy this version of the MCP service, install the seven companion skills into the same Site plugin, and guide you through necessary sign-in, permissions and phone pairing. Require it to reuse completed steps and report the verified state.

中文：请让 ChatGPT Work 按本指南的固定版本链接，在你的账号中创建或恢复私人 SaySo，部署此版本 MCP，为同一个 Site 插件安装配套的七个 Skill，并引导完成必要的登录、授权与手机配对；复用已有进度，按实际验证结果报告状态。

The README provides the copyable instruction with an immutable commit URL. Opening a draft is not sending it, and a deployed server is not a paired phone.

## 1. Check the environment and identify this installation

- Use the intended ChatGPT account/workspace. Confirm Work, Sites and Plugin Creator capabilities are available. The current personal Sites route requires an eligible paid plan; do not promise that a Free account can complete it. Explain missing capabilities and stop the dependent step rather than inventing tools or IDs.
- Confirm that the user has access to a compatible SaySo iOS build before promising phone setup. Public App Store availability and the iPhone compatibility matrix are still pending. Cloud source installation can be reported separately if the phone app is unavailable.
- Reuse a private installation ledger associated with this request. Record the pinned source commit, actual Site/App/plugin identifiers, current plugin release, deployment state, pairing progress and errors. Store it privately in the installation task; never put it in this public repository. Do not record long-lived credentials in the ledger or conversation.
- If the App supplies an installation request ID, protocol version and public key, preserve them. Do not generate a replacement identity for that phone or guess its callback target.
- Do not modify ChatGPT permissions to “Allow all actions”. Required sign-in, connection and on-screen approvals remain the user's choices.

## 2. Pin and verify the source

- Use the exact 40-character commit from the URL of this guide. If someone supplies a branch URL instead, resolve it once to a commit before fetching any source, and use that one commit throughout. Never mix main-branch files from different times.
- Download that public repository snapshot; a GitHub login is not normally required to read public source.
- Run `node scripts/verify-source.mjs` from the repository root. It checks SOURCE_MANIFEST.json against all covered files. Stop on a missing file or digest mismatch; do not regenerate the manifest to make a bad download pass.
- Read LICENSE.md, LICENSE_DETAILS.md, TRADEMARK.md and THIRD_PARTY.md. Preserve notices. This is source-available FSL software; third-party material retains its own licensing.
- Deploy `mcp/` as supplied. Do not ask a model to recreate the server from this prose or install unrelated similarly named projects.

## 3. Create or resume the user's private Site

- Follow the current Sites skill/runtime instructions. If this installation already has a verified owned project, resume it. Otherwise create one private Site and immediately retain the platform-returned project identity in its private checkout/ledger.
- The distributed `.openai/hosting.json` has storage/capability declarations but no developer project ID. Never borrow a project's IDs from old examples or another user's installation.
- Use the platform's actual expected origin for `SAYSO_PUBLIC_ORIGIN`. It must be this user's Site origin, not the GitHub Pages website and not a developer instance.
- Generate a fresh per-instance 32-byte random HMAC secret with a cryptographic random generator and configure `SAYSO_FRAME_PERMIT_HMAC_KEY_HEX` through private runtime environment tools. Never print the secret, place it in a URL, commit it, or copy it from another Site.
- Provision the declared D1/R2 bindings and database migrations through the supported Sites workflow. Preserve authenticated ingress. Do not make a private Site public to work around authentication.
- Install dependencies, run `npm test`, `npm run typecheck` and `npm run build` in `mcp/`. Save/push the actual source and deploy via the current Sites tools. A build alone is not deployment success; wait for a terminal platform result and retain its exact version/deployment identity privately.

## 4. Verify MCP and install skills into the same plugin

- Read the actual MCP connection details and canonical plugin ID created for the user's Site. Do not create a duplicate wrapper plugin and do not reuse any developer plugin/App ID.
- Verify authenticated MCP initialization/tool discovery and a harmless identity/readiness query. Do not move the pointer, type text, read an unshared screen or flash a board as an installation test.
- Read the canonical plugin's source/metadata and verify edit eligibility. Preserve its scope, audience, App connection, interface, prompts and other existing files.
- Apply the contents of `plugins/sayso/skills/` plus their license notices to the eligible existing plugin using its guarded update process. Use the just-read release ID for concurrency protection and an appropriate version bump. The repository's generic `plugins/sayso/plugin.json` describes a skills-only source bundle; it is **not** a replacement for the platform-owned App-backed manifest.
- Configure `sayso-onboarding` as the first-use skill only through the field/mechanism supported by the actual current platform. Consult current documentation rather than guessing manifest fields.
- Read back the saved skill files and confirm all seven names and their relative references. Verify their availability in a subsequent intended phone conversation; a successful upload alone does not prove activation.

## 5. Hand configuration to the correct phone

This is a separate acceptance gate. The phone needs both private-Site access and a device credential; being signed in to ChatGPT or having a pairing code alone does not prove background phone access.

- Use an authenticated, confirmed handoff supported by the actual SaySo build. Bind it to the installation request, phone public key, target Site and expiry. Encryption alone does not establish sender authenticity; verify origin and prevent replay.
- Long-lived tokens belong in device secure storage/private runtime configuration, never in the public repository, chat text, QR code or query string.
- A manual one-time pairing code is a recovery path only when that build's private-Site access is already correctly configured. Do not claim it solves the missing Site credential or publish a bypass token.
- The current consumer automatic handoff is not fully implemented/accepted. If the available build cannot safely receive both configurations, report `service_ready_phone_handoff_required`, explain the precise missing step and stop phone-dependent work. Do not silently switch hosting, weaken access, or report full success.

## 6. Sharing and control remain separate

- Start system screen sharing in SaySo, not in ChatGPT. The user confirms the actual receiver and the iOS system prompt.
- ChatGPT Voice uses the Live option where available. When ChatGPT asks for approval, the user must use the on-screen controls; spoken approval does not approve it.
- A user who only wants screen guidance does not need the control accessory. Hardware pairing, verified compatibility and control permission are additional gates for input. The DIY firmware installer remains independent and unavailable until a signed accepted release is supplied.
- Screen inspection only follows the user's sharing/request. Device actions require a specific user task and current control authorization; setup does not grant blanket action permission.

## 7. Report state and resume safely

Use concrete states: `needs_sign_in`, `needs_platform_permission`, `deploying`, `service_ready`, `skills_saved_activation_unverified`, `service_ready_phone_handoff_required`, `paired_waiting_for_share`, `screen_ready`, or `control_ready`. Only report a state when its evidence exists.

On retry, reconcile the existing Site, deployment and plugin release before creating anything. Resume the last uncompleted phase. Reissue an expired one-time code only when needed; preserve a still-valid installation identity. Unknown responses require checking the original operation, not automatically duplicating it. Explicit Stop/Cancel wins over recovery.

Public test status: this source snapshot and packaging can be checked offline. A clean new account's complete iPhone flow, real credential handoff and voice skill activation still require independent end-to-end acceptance. No fixed “one tap completes everything” promise is made.
