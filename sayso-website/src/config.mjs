export const sceneIds = ["bus", "food", "subscription", "setting"];
export function installerPath(value) {
  return value === "./accessory-install/" || value === "./accessory-install/index.html"
    ? value
    : null;
}
export function linkTarget(value, kind = "route") {
  if (kind === "app") {
    const local = installerPath(value);
    return local ? { href: local, external: false } : null;
  }
  const outside = httpsUrl(value);
  if (outside) return { href: outside, external: true };
  return typeof value === "string" && /^[a-z][a-z0-9-]*$/.test(value)
    ? { href: `#/${value}`, external: false }
    : null;
}
export function httpsUrl(value, host) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!host || u.hostname === host)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function assetUrl(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.split("/").includes("..")
  )
    return null;
  if (value.startsWith("https://")) return httpsUrl(value);
  return /^[a-zA-Z0-9_./-]+$/.test(value) && !value.startsWith("/")
    ? value
    : null;
}
export function normalizeConfig(raw = {}) {
  const c = raw && typeof raw === "object" ? raw : {};
  const appStoreUrl = httpsUrl(c.appStoreUrl, "apps.apple.com");
  const videos = Object.fromEntries(
    sceneIds.map((id) => {
      const v = c.videos?.[id];
      if (!v || typeof v !== "object") return [id, null];
      const normalized = {
        mp4: assetUrl(v.mp4),
        webm: assetUrl(v.webm),
        poster: assetUrl(v.poster),
        captionsEn: assetUrl(v.captionsEn),
        captionsZh: assetUrl(v.captionsZh),
      };
      return [
        id,
        normalized.mp4 && normalized.poster && normalized.captionsEn
          ? normalized
          : null,
      ];
    }),
  );
  const compatibility = Array.isArray(c.compatibility)
    ? c.compatibility.filter(
        (row) =>
          row &&
          row.verified === true &&
          typeof row.model === "string" &&
          typeof row.ios === "string" &&
          typeof row.appVersion === "string" &&
          typeof row.testedAt === "string" &&
          ["screen", "control"].includes(row.mode) &&
          (row.mode !== "control" ||
            (typeof row.firmware === "string" &&
              typeof row.accessory === "string")),
      )
    : [];
  const screenshots = Array.isArray(c.screenshots)
    ? c.screenshots.filter(
        (s) =>
          s &&
          [1, 2, 3].includes(s.step) &&
          ["en", "zh"].includes(s.locale) &&
          assetUrl(s.src) &&
          ["capturedAt", "ios", "appVersion", "chatgptVersion"].every(
            (k) => typeof s[k] === "string" && s[k],
          ),
      )
    : [];
  return {
    releaseReady: c.releaseReady === true,
    appStoreUrl:
      appStoreUrl && /\/id\d+\/?$/.test(new URL(appStoreUrl).pathname)
        ? appStoreUrl
        : null,
    appStoreBadge: assetUrl(c.appStoreBadge),
    installerUrl: httpsUrl(c.installerUrl),
    installerPath: installerPath(c.installerPath),
    repositoryUrl: httpsUrl(c.repositoryUrl, "github.com"),
    supportEmail:
      typeof c.supportEmail === "string" &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.supportEmail)
        ? c.supportEmail
        : null,
    publisherName: typeof c.publisherName === "string" ? c.publisherName : null,
    privacyApproved: c.privacyApproved === true,
    quotaVerified: c.quotaVerified === true,
    compatibility,
    screenshots,
    videos,
  };
}
export function releaseGaps(raw) {
  const c = normalizeConfig(raw),
    gaps = [];
  for (const key of [
    "appStoreUrl",
    "appStoreBadge",
    "repositoryUrl",
    "supportEmail",
    "publisherName",
    "privacyApproved",
    "quotaVerified",
  ])
    if (!c[key]) gaps.push(key);
  if (!c.installerPath && !c.installerUrl) gaps.push("installer destination");
  if (!c.compatibility.some((r) => r.mode === "screen"))
    gaps.push("verified screen compatibility");
  if (!c.compatibility.some((r) => r.mode === "control"))
    gaps.push("verified control compatibility");
  for (const lang of ["en", "zh"])
    for (const step of [1, 2, 3])
      if (!c.screenshots.some((s) => s.step === step && s.locale === lang))
        gaps.push(`screenshot ${lang}/${step}`);
  for (const id of ["bus", "food", "subscription"])
    if (!c.videos[id]?.webm)
      gaps.push(`video ${id}: MP4, WebM, poster, English WebVTT`);
  if (!c.releaseReady) gaps.push("releaseReady approval");
  return gaps;
}
