# SaySo plugin and skill source

Seven skills are provided: sayso-control, sayso-onboarding, sayso-open-app, sayso-click-at, sayso-type-text, sayso-scroll-view and sayso-drag-to. Their source is based on the owned 1.2.37 package. The developer-instance URL was removed; the instructions use only the service connected to the current user's plugin.

The portable plugin.json describes a **skills-only bundle**. It contains no developer App ID, MCP URL, account binding or token. It does not install or connect the MCP server itself.

The default Sites path is documented in [INSTALL.md](../../INSTALL.md): deploy the user's private MCP Site, then add these skills to that Site's existing canonical plugin while preserving the platform-owned connection and interface. Do not upload this generic manifest over an App-backed plugin or create a duplicate Site wrapper. A standalone client may use the skills-only bundle only after its separate SaySo MCP connection is configured.

Onboarding runs after installation; it cannot install itself or bypass login, system screen sharing or device permissions. New-account/mobile activation and configuration handoff are not yet accepted end to end.

Copyright 2026 ZHAI BIN. Original SaySo source is licensed under FSL-1.1-ALv2; see LICENSE.md. Preserve the license and trademark notices when redistributing.
