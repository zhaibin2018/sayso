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
  const path = lang === "en" ? "./en/" : "../";
  location.replace(path + location.hash);
} else {
  const render = (locale) => {
    const heading = document.querySelector(`[data-locale="${locale}"] h1`);
    if (heading) document.title = heading.textContent + " · SaySo";
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    for (const el of document.querySelectorAll("[data-locale]"))
      el.hidden = el.dataset.locale !== locale;
    for (const link of document.querySelectorAll("[data-install-language]")) {
      if (link.dataset.installLanguage === locale) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    for (const button of document.querySelectorAll("button[data-language]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === locale),
      );
  };
  for (const button of document.querySelectorAll("button[data-language]"))
    button.addEventListener("click", () => render(button.dataset.language));
  for (const link of document.querySelectorAll("[data-install-language]"))
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      const locale = link.dataset.installLanguage;
      rememberLanguage(locale);
      render(locale);
    });
  const fragmentLanguage = location.hash.slice(1);
  render(["zh", "en"].includes(fragmentLanguage) ? fragmentLanguage : lang);
  document.body.dataset.documentReady = "";
}

for (const button of document.querySelectorAll("[data-copy-message]")) {
  button.addEventListener("click", async () => {
    const section = button.closest("section");
    const status = section.querySelector('[role="status"]');
    const zh = section.dataset.locale === "zh";
    try {
      await navigator.clipboard.writeText(section.querySelector(".message").textContent);
      status.textContent = zh ? "已复制" : "Copied";
    } catch {
      status.textContent = zh ? "复制失败。请选中安装消息并复制。" : "Couldn’t copy. Select the installation message and copy it.";
    }
  });
}
