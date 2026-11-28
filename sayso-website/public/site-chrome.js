import { getLanguage, rememberLanguage } from "./language.js";
import { getTheme, toggleTheme, watchTheme } from "./site-preferences.js";

export function initSiteChrome(renderLanguage) {
  const root = document.documentElement;
  const headers = [...document.querySelectorAll("[data-site-header]")];
  function language(locale, persist = false) {
    if (persist) rememberLanguage(locale);
    root.lang = locale === "zh" ? "zh-CN" : "en";
    renderLanguage(locale);
  }
  const theme = (value) => {
    root.dataset.theme = value;
  };
  for (const header of headers) {
    const menu = header.querySelector(".menu-button");
    const nav = document.getElementById(menu.getAttribute("aria-controls"));
    const setMenu = (open) => {
      nav.hidden = !open;
      menu.setAttribute("aria-expanded", String(open));
      menu.setAttribute(
        "aria-label",
        open ? menu.dataset.closeLabel : menu.dataset.openLabel,
      );
    };
    setMenu(false);
    menu.addEventListener("click", () => setMenu(nav.hidden));
    header.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !nav.hidden) {
        setMenu(false);
        menu.focus();
      }
    });
    header
      .querySelector(".theme-button")
      .addEventListener("click", () => theme(toggleTheme(root.dataset.theme)));
    for (const link of header.querySelectorAll("[data-site-language]")) {
      link.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
          return;
        event.preventDefault();
        const locale = link.dataset.siteLanguage;
        setMenu(false);
        language(locale, true);
        document
          .querySelector(
            `[data-header-locale="${locale}"] [data-site-language="${locale}"]`,
          )
          ?.focus();
      });
    }
  }
  theme(getTheme());
  watchTheme(theme);
  language(getLanguage());
  window.addEventListener("storage", (event) => {
    if (event.key === "sayso-language" || event.key === null)
      language(getLanguage());
  });
  root.dataset.siteReady = "";
  return { setLanguage: (locale) => language(locale, true) };
}
