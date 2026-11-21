# Third-party licensing and scope

Original SaySo software retains FSL-1.1-ALv2, licensor ZHAI BIN, exact notice `Copyright 2026 ZHAI BIN`. This is source-available software, not an OSI-approved open-source license. See the copied `LICENSE.md`, `LICENSE_DETAILS.md` and `TRADEMARK.md`; third-party software retains its own terms.

- `mcp/vendor/shadcn-tailwind-4.13.0.css` retains its adjacent MIT license and shadcn copyright notice.
- `mcp/scripts/vite/sites-vite-plugin.ts` retains the adjacent `sites-vite-plugin.LICENSE` (MIT, Copyright 2026 OpenAI).
- Existing Sites scaffold/UI support material retains upstream notices and terms. The SaySo grant covers original additions and does not claim ownership of upstream templates.
- npm dependencies are pinned in `mcp/package-lock.json`, with their individual package licenses. Importing them does not relicense their source. Dependency trees and bundled build outputs are not included in this source package.
- Seven companion skills retain the public source's original-software license and attribution; developer account bindings are not distributed; two owner-neutral presentation manifests are included.

The native iOS App and ESP firmware implementation/binaries, native Swift implementation fixture, runtime databases, screenshots, device backups and production secrets are excluded. Synthetic protocol-test fixture data is not a native firmware distribution. No final native-binary license audit or device acceptance is implied.
