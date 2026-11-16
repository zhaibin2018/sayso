export const MODELS = [
  ...[
    "15",
    "15 Plus",
    "15 Pro",
    "15 Pro Max",
    "16",
    "16 Plus",
    "16 Pro",
    "16 Pro Max",
    "16e",
  ].map((n) => ({ id: `iPhone ${n}`, connector: "usb-c" })),
  ...[
    "11",
    "11 Pro",
    "11 Pro Max",
    "12",
    "12 mini",
    "12 Pro",
    "12 Pro Max",
    "13",
    "13 mini",
    "13 Pro",
    "13 Pro Max",
    "14",
    "14 Plus",
    "14 Pro",
    "14 Pro Max",
    "SE (2nd generation)",
    "SE (3rd generation)",
  ].map((n) => ({ id: `iPhone ${n}`, connector: "lightning" })),
];
export function environment(nav, secure) {
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return {
    mobile,
    supported:
      !mobile &&
      secure &&
      !!nav.serial &&
      /Chrome\/|Edg\//.test(nav.userAgent) &&
      !/OPR\//.test(nav.userAgent),
  };
}
export function compatibility(model, release) {
  if (!model || model === "other") return { kind: "unknown" };
  const known = MODELS.find((m) => m.id === model);
  if (known?.connector === "lightning") return { kind: "lightning" };
  if (!release) return { kind: "unavailable" };
  const match = release.compatibility.find((m) => m.model === model);
  return match
    ? { kind: "eligible", minIOS: match.minIOS, maxIOS: match.maxIOS }
    : { kind: "unverified" };
}
export function assertSecurity(info) {
  // Fail closed on unknown or previously provisioned security state.
  if (
    !info ||
    info.chipId !== 9 ||
    info.flags !== 0 ||
    info.flashCryptCnt !== 0 ||
    !Array.isArray(info.keyPurposes) ||
    info.keyPurposes.length < 6 ||
    info.keyPurposes.some((v) => v !== 0)
  ) {
    throw new Error("security-state");
  }
}
export function safeAppStoreURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      u.hostname === "apps.apple.com" &&
      /\/id\d+/.test(u.pathname) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function languageFrom(saved, languages = []) {
  if (saved === "zh" || saved === "en") return saved;
  return languages[0]?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
