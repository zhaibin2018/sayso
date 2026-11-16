export const unconfiguredOrigin = "https://sayso.invalid";

export function resolvePublicOrigin(value: unknown): string {
  if (value === undefined || value === "") return unconfiguredOrigin;
  if (typeof value !== "string") throw new Error("INVALID_PUBLIC_ORIGIN");
  const url = new URL(value);
  const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("INVALID_PUBLIC_ORIGIN");
  return url.origin;
}
