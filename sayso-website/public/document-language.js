import { getLanguage, rememberLanguage } from "./language.js";
// Keep the complete readable HTML and immutable package pointer available without JS.
const lang = getLanguage();
for (const link of document.querySelectorAll("[data-language]")) {
  link.addEventListener("click", () => rememberLanguage(link.dataset.language));
}
if (
  document.body.dataset.documentLocale &&
  lang !== document.body.dataset.documentLocale
) {
  location.replace(lang === "en" ? "./en/" : "../");
} else {
  const render = (locale) => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    for (const el of document.querySelectorAll("[data-locale]"))
      el.hidden = el.dataset.locale !== locale;
    for (const button of document.querySelectorAll("button[data-language]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === locale),
      );
  };
  for (const button of document.querySelectorAll("button[data-language]"))
    button.addEventListener("click", () => render(button.dataset.language));
  render(lang);
}
