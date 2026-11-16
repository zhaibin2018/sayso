# Website content handoff

Update `public/site-config.json`; keep unavailable values `null`. Use UTF-8. Asset paths are relative to `public/`, e.g. `media/food.mp4`, or explicit HTTPS URLs. Relative paths preserve GitHub Pages subpath hosting. Never place credentials, device records or private service tokens here: this file is public.

## Destinations

`appStoreUrl`: verified `https://apps.apple.com/.../id...` product page. A real QR is generated from this same URL only. `appStoreBadge`: official Apple badge asset path (not an Image Gen imitation). No store URL means no enabled download.

`installerPath`: the integrated build supplies `./install/` (also accepts `./install/index.html`). This is a real same-origin pathname, never a hash route or root-relative path. Leave it null in standalone website development unless the installer output is also hosted there. `installerUrl` is an optional verified HTTPS fallback for standalone deployments. `repositoryUrl`, `supportEmail`, `publisherName` remain actual approved public details.

Use an approved domain support mailbox for `supportEmail`, not a personal mailbox. Keep it null until that public address is actually available.

The combined build derives `install/site-links.json` from a whitelist of public metadata: App Store, repository, support contact and fixed parent-page routes. It excludes marketing readiness, compatibility arrays, firmware locations and trust keys. The installer's signed release manifest is the sole firmware admission source. Local language/theme keys are shared and synchronized across tabs; no device state or consent is stored with them.

Run `npm run release:check -- --integrated` to inspect the merged package's content readiness. Firmware acceptance remains independent from that website check.

## Portrait videos

Scene keys: `bus`, `food`, `subscription`, `setting`. Each object has `mp4`, `webm`, `poster`, `captionsEn` and optionally `captionsZh`. Example shape (paths are illustrative, not supplied media):

```json
{"mp4":"media/food.mp4","webm":"media/food.webm","poster":"media/food.jpg","captionsEn":"media/food.en.vtt","captionsZh":null}
```

MP4, poster and English captions are required to enable a scene; WebM is also required by release preflight for the three core scenarios. Target 1080×1920 with unchanged 9:16 composition. Keep captions as actual WebVTT synchronized to supplied footage; do not fabricate timing. Review fictional or real interface branding, private details and final-confirmation behavior before publishing. No video assets were created by this frontend task.

Playback: muted inline autoplay after metadata only when reduced motion is not requested; fallback manual playback when browser disallows autoplay. Controls support pause/play, seek, mute and captions. Runtime load failures display retry/scene selection rather than a false playing state. Actual media decode/caption timing acceptance requires the supplied videos.

## Step screenshots

Each entry requires `step` (1–3), `locale` (`en`/`zh`), `src`, `capturedAt`, `ios`, `appVersion`, `chatgptVersion`. The page displays the recorded version/date next to the screenshot. Do not reuse old screenshots as proof of a different current interface. Missing language variants retain a clear placeholder.

## Compatibility

Each row needs `mode` (`screen` or `control`), `model`, `ios`, `appVersion`, `testedAt`, `verified: true`. Control rows also require `accessory` and `firmware`. Only verified rows are shown. Retain private real-device evidence separately. An iOS deployment target, simulator build, USB-C connector or firmware write receipt is not device acceptance.

## Release flags

`privacyApproved`, `quotaVerified` and `releaseReady` are off. They are acceptance records, not feature implementations. Before setting them, replace draft privacy/guide copy with audited final terms and synchronize App Store and App behavior. Changing flags alone does not complete acceptance.

`npm run release:check` checks all required destinations, metadata, core media and local asset existence. It does not verify the truth of compatibility reports, legal adequacy, external URL ownership, actual purchase behavior or complete data deletion. Preview indicators remain whenever required release fields are absent.
