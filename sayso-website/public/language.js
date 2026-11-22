// One preference for every page. Only a deliberate language switch is persisted.
export function languageFrom(saved, languages = []) {
  if (saved === "zh" || saved === "en") return saved;
  return /^zh(?:-|$)/i.test(languages[0] || "") ? "zh" : "en";
}
export function getLanguage() {
  let saved;
  try {
    saved = localStorage.getItem("sayso-language");
  } catch {}
  return languageFrom(
    saved,
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
}
export function rememberLanguage(language) {
  try {
    localStorage.setItem("sayso-language", language);
  } catch {}
}
