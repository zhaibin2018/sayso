import { ArrowRight, List, Moon, Sun, X } from "@phosphor-icons/react";
import { copy } from "./copy.js";

const routes = ["start", "guides", "buy", "firmware", "support"];
const labels = {
  en: {
    home: "Home",
    support: "Troubleshooting",
    buy: "Where to buy",
    main: "Main navigation",
    mobile: "Mobile navigation",
  },
  zh: {
    home: "首页",
    support: "遇到问题",
    buy: "去哪里买配件",
    main: "主导航",
    mobile: "手机导航",
  },
};

export function SiteHeader({
  lang,
  route,
  base = "",
  theme,
  menu = false,
  setMenu,
  setLanguage,
  onTheme,
  languageLinks,
}) {
  const t = copy[lang];
  const names = labels[lang];
  const navId = `mobile-navigation-${lang}`;
  const isStatic = Boolean(languageLinks);
  const nav = routes.map((key) => (
    <a
      key={key}
      href={`${base}#/${key}`}
      aria-current={route === key ? "page" : undefined}
      onClick={setMenu && (() => setMenu(false))}
    >
      {names[key] || t[key]}
    </a>
  ));
  const language = (locale, text) => {
    const selected = lang === locale;
    const props = {
      className: selected ? "current-language" : undefined,
      lang: locale === "zh" ? "zh-CN" : "en",
    };
    return isStatic ? (
      <a
        {...props}
        href={languageLinks[locale]}
        data-site-language={locale}
        aria-current={selected ? "true" : undefined}
      >
        {text}
      </a>
    ) : (
      <button
        {...props}
        type="button"
        aria-pressed={selected}
        onClick={() => setLanguage(locale)}
      >
        {text}
      </button>
    );
  };
  return (
    <div data-site-header data-header-locale={lang}>
      <header className="site-header shell">
        <a
          className="brand"
          href={base || "#/home"}
          aria-label={`SaySo · ${names.home}`}
        >
          <img
            src={`${base || "./"}assets/sayso-88.png`}
            alt=""
            width="44"
            height="44"
          />
          <span>SaySo</span>
        </a>
        <span className="header-divider" aria-hidden />
        <nav className="desktop-nav" aria-label={names.main}>
          {nav}
        </nav>
        <div className="header-tools">
          <div className="language-button" role="group" aria-label={t.language}>
            {language("en", "EN")}
            <span aria-hidden>/</span>
            {language("zh", "中文")}
          </div>
          <button
            type="button"
            className="icon-button theme-button"
            onClick={onTheme}
            aria-label={t.theme}
            title={t.theme}
          >
            {(isStatic || theme === "dark") && (
              <Moon aria-hidden data-icon="dark" />
            )}
            {(isStatic || theme !== "dark") && (
              <Sun aria-hidden data-icon="light" />
            )}
          </button>
          <button
            type="button"
            className="icon-button menu-button"
            aria-label={menu ? t.closeMenu : t.menu}
            aria-expanded={menu}
            aria-controls={navId}
            data-open-label={t.menu}
            data-close-label={t.closeMenu}
            onClick={setMenu && (() => setMenu(!menu))}
          >
            {(isStatic || !menu) && <List aria-hidden data-icon="open" />}
            {(isStatic || menu) && <X aria-hidden data-icon="close" />}
          </button>
        </div>
      </header>
      <nav
        id={navId}
        className="mobile-nav shell"
        aria-label={names.mobile}
        hidden={!isStatic && !menu}
      >
        {nav}
      </nav>
    </div>
  );
}

export function NotFound({ lang, base = "", staticDocument = false }) {
  const t = copy[lang];
  const names = labels[lang];
  const support = `${base}#/support`;
  const start = `${base}#/start`;
  const localePath = lang === "en" ? "en/" : "";
  const links = [
    [names.home, base || "#/home"],
    [t.start, staticDocument ? `${base}start/${localePath}` : start, staticDocument ? start : undefined],
    [
      names.support,
      staticDocument ? `${base}support/${localePath}` : support,
      staticDocument ? support : undefined,
    ],
  ];
  return (
    <div className="not-found">
      <h1>{t.notFound}</h1>
      <p>{t.notFoundDetail}</p>
      <nav aria-label={names.main}>
        {links.map(([name, href, interactiveHref]) => (
          <a key={name} href={href} data-interactive-href={interactiveHref}>
            {name}
            <ArrowRight aria-hidden />
          </a>
        ))}
      </nav>
    </div>
  );
}
