const themeKey = "sayso-theme";
const isTheme = (value) => value === "dark" || value === "light";
const systemTheme = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme() {
  let saved;
  try {
    saved = localStorage.getItem(themeKey);
  } catch {}
  return isTheme(saved) ? saved : systemTheme().matches ? "dark" : "light";
}

export function toggleTheme(current = getTheme()) {
  const next = current === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(themeKey, next);
  } catch {}
  return next;
}

export function watchTheme(render) {
  const media = systemTheme();
  const onChange = () => render(getTheme());
  const onStorage = (event) => {
    if (event.key === themeKey || event.key === null) onChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}
