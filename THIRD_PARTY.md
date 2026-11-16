# Third-party licensing and scope

The root FSL-1.1-ALv2 grant covers original SaySo software offered by ZHAI BIN in this repository. It does not replace upstream licenses, remove attribution or claim ownership of third-party work.

- `mcp/vendor/shadcn-tailwind-4.13.0.css` retains the accompanying MIT license and shadcn copyright notice.
- `mcp/scripts/vite/sites-vite-plugin.ts` retains the adjacent `sites-vite-plugin.LICENSE` (MIT, Copyright 2026 OpenAI).
- Existing Sites scaffold/UI support material retains any upstream notices and terms; the FSL claim is for original SaySo additions, not an assertion of ownership over upstream templates.
- npm dependencies are identified by each application's package-lock.json and retain their package licenses. Dependency source is not relicensed merely because a package imports it.
- The website and installer bundle third-party notice files under their respective public directories. Those files apply to the named dependencies, separately from SaySo's FSL and trademark notice.
- The SaySo brand is governed separately by TRADEMARK.md; third-party marks are not owned by this project.

The iOS application, ESP firmware implementation, device backups, runtime databases and production secrets are excluded. A future stable DIY firmware source release requires its own complete linked-component license audit. No native firmware is covered or distributed merely because the browser installer is present.
