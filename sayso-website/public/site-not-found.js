import { initSiteChrome } from "./site-chrome.js";

initSiteChrome((language) => {
  document.documentElement.dataset.errorLanguage = language;
  const page = document.getElementById(language);
  document.title = page.querySelector("h1").textContent + " · SaySo";
});
for (const link of document.querySelectorAll("[data-interactive-href]")) {
  link.href = link.dataset.interactiveHref;
}
