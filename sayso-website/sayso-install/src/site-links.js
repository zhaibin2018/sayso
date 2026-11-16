// Presentation metadata only. No firmware, trust-key or authorization fields.
const paths = Object.freeze({
  homePath: "../",
  startPath: "../#/start",
  guidesPath: "../#/guides",
  privacyPath: "../#/privacy",
  supportPath: "../#/support",
});
const https = (value, host) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.hostname === host
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export function normalizeSiteLinks(value) {
  const v = value?.schema === 1 ? value : {};
  const store = https(v.appStoreUrl, "apps.apple.com");
  return Object.freeze({
    ...Object.fromEntries(
      Object.entries(paths).map(([key, path]) => [
        key,
        v[key] === path ? path : null,
      ]),
    ),
    appStoreUrl:
      store && /\/id\d+\/?$/.test(new URL(store).pathname) ? store : null,
    repositoryUrl: https(v.repositoryUrl, "github.com"),
    supportEmail:
      typeof v.supportEmail === "string" &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.supportEmail)
        ? v.supportEmail
        : null,
  });
}
export async function loadSiteLinks(base, signal) {
  try {
    const response = await fetch(new URL("site-links.json", base), {
      signal,
      redirect: "error",
    });
    if (!response.ok) return normalizeSiteLinks();
    return normalizeSiteLinks(await response.json());
  } catch {
    return normalizeSiteLinks();
  }
}
export function preferredLanguage(saved, languages = []) {
  if (["en", "zh"].includes(saved)) return saved;
  for (const locale of languages) {
    if (/^zh\b/i.test(locale)) return "zh";
    if (/^en\b/i.test(locale)) return "en";
  }
  return "en";
}
export function canLeaveForWebsite(busy, locked) {
  return !busy && !locked;
}
