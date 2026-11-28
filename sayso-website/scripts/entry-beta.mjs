import { normalizeConfig } from "../src/config.mjs";
import { copy } from "../src/copy.js";

export function renderEntryBeta(html, invitationConfig) {
  const { testFlightUrl } = normalizeConfig(invitationConfig);
  for (const lang of ["en", "zh"]) {
    const marker = `<!-- no-script-beta-${lang} -->`;
    if (!html.includes(marker)) throw new Error(`Missing ${lang} no-script beta marker`);
    const t = copy[lang];
    const message = testFlightUrl
      ? `<a href="${testFlightUrl}" data-beta-link="entry" target="_blank" rel="noopener noreferrer">${t.betaJoin} <span aria-hidden="true">↗</span></a>`
      : t.betaPending;
    html = html.replace(marker, `<p class="preview-banner">${message}</p>`);
  }
  return html;
}
