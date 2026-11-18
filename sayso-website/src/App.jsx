import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowCounterClockwise,
  Moon,
  Sun,
  List,
  X,
  Play,
  Pause,
  SpeakerSlash,
  SpeakerHigh,
  ClosedCaptioning,
  DeviceMobile,
  UserCircle,
  Waveform,
  WifiHigh,
  Cpu,
  Laptop,
  HandTap,
  Info,
  DownloadSimple,
  QrCode,
  Copy,
  ImageSquare,
} from "@phosphor-icons/react";
import { copy } from "./copy";
import {
  normalizeConfig,
  releaseGaps,
  sceneIds,
  linkTarget,
} from "./config.mjs";
import "@fontsource-variable/inter";

const readPreference = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const savePreference = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing can be nonpersistent. */
  }
};
const preferredLanguage = () => {
  const saved = readPreference("sayso-language");
  if (["en", "zh"].includes(saved)) return saved;
  for (const locale of navigator.languages || [navigator.language]) {
    if (/^zh\b/i.test(locale)) return "zh";
    if (/^en\b/i.test(locale)) return "en";
  }
  return "en";
};
const currentRoute = () =>
  location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
const asset = (path) =>
  path?.startsWith("https://") ? path : `${import.meta.env.BASE_URL}${path}`;
const external = { target: "_blank", rel: "noopener noreferrer" };
function Link({
  to,
  children,
  className = "",
  arrow = true,
  kind = "route",
  ...props
}) {
  const target = linkTarget(to, kind);
  if (!target) return <span className={className}>{children}</span>;
  const outside = target.external;
  return (
    <a
      href={target.href}
      className={`text-link ${className}`}
      {...(outside ? external : {})}
      {...props}
    >
      {children}
      {arrow &&
        (outside ? <ArrowUpRight aria-hidden /> : <ArrowRight aria-hidden />)}
    </a>
  );
}
export function App() {
  const [lang, setLang] = useState(preferredLanguage);
  const [theme, setTheme] = useState(() =>
    readPreference("sayso-theme") === "light" ? "light" : "dark",
  );
  const [route, setRoute] = useState(currentRoute);
  const [menu, setMenu] = useState(false);
  const [config, setConfig] = useState(() => normalizeConfig());
  const [preview, setPreview] = useState(true);
  const [configError, setConfigError] = useState(false);
  const main = useRef(null);
  const t = copy[lang];
  useEffect(() => {
    const sync = (event) => {
      if (
        event.key === "sayso-language" &&
        ["en", "zh"].includes(event.newValue)
      )
        setLang(event.newValue);
      if (
        event.key === "sayso-theme" &&
        ["dark", "light"].includes(event.newValue)
      )
        setTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}site-config.json`, {
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("configuration unavailable");
        return r.json();
      })
      .then((raw) => {
        setConfig(normalizeConfig(raw));
        setPreview(releaseGaps(raw).length > 0);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setConfigError(true);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const change = () => {
      setRoute(currentRoute());
      setMenu(false);
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    savePreference("sayso-language", lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePreference("sayso-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.title = `${route === "home" ? (lang === "en" ? "Make your iPhone easier to use" : "让 iPhone 更容易使用") : t[route] || t.notFound} · SaySo`;
  }, [route, t, lang]);
  const nav = (
    <>
      {["start", "guides", "firmware"].map((key) => (
        <a
          key={key}
          href={`#/${key}`}
          aria-current={route === key ? "page" : undefined}
          onClick={() => setMenu(false)}
        >
          {t[key]}
        </a>
      ))}
    </>
  );
  const props = { t, lang, config, preview };
  let page;
  switch (route) {
    case "home":
      page = <Home {...props} />;
      break;
    case "start":
      page = <Start {...props} />;
      break;
    case "guides":
      page = <Guides {...props} />;
      break;
    case "firmware":
      page = <Firmware {...props} />;
      break;
    case "buy":
      page = <Buy {...props} />;
      break;
    case "privacy":
      page = <Privacy {...props} />;
      break;
    case "support":
      page = <Support {...props} />;
      break;
    case "licenses":
      page = <Licenses {...props} />;
      break;
    default:
      page = (
        <div className="document">
          <h1>{t.notFound}</h1>
          <Link to="home">{t.backHome}</Link>
        </div>
      );
  }
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        {t.skip}
      </a>
      <header className="site-header shell">
        <a className="brand" href="#/home" aria-label="SaySo home">
          <img src={asset("assets/sayso.png")} alt="" width="44" height="44" />
          <span>SaySo</span>
        </a>
        <span className="header-divider" aria-hidden />
        <nav
          className="desktop-nav"
          aria-label={lang === "en" ? "Main navigation" : "主导航"}
        >
          {nav}
        </nav>
        <div className="header-tools">
          <a
            className="github-link"
            href={config.repositoryUrl || "#/guides"}
            {...(config.repositoryUrl ? external : {})}
          >
            {t.github}
          </a>
          <button
            className="language-button"
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            aria-label={t.language}
          >
            <span className={lang === "en" ? "current-language" : ""}>EN</span>
            <span aria-hidden>/</span>
            <span className={lang === "zh" ? "current-language" : ""}>
              中文
            </span>
          </button>
          <button
            className="icon-button theme-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t.theme}
            title={t.theme}
          >
            {theme === "dark" ? <Moon /> : <Sun />}
          </button>
          <button
            className="icon-button menu-button"
            aria-label={menu ? t.closeMenu : t.menu}
            aria-expanded={menu}
            aria-controls="mobile-navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <List />}
          </button>
        </div>
      </header>
      {menu && (
        <nav
          id="mobile-navigation"
          className="mobile-nav shell"
          aria-label={lang === "en" ? "Mobile navigation" : "手机导航"}
        >
          {nav}
          <a
            href={config.repositoryUrl || "#/guides"}
            {...(config.repositoryUrl ? external : {})}
            onClick={() => setMenu(false)}
          >
            GitHub
          </a>
        </nav>
      )}
      <main
        id="main-content"
        ref={main}
        tabIndex={-1}
        className={`shell route-${route}`}
      >
        {configError && (
          <p className="notice" role="status">
            <Info />
            {t.configError}
          </p>
        )}
        {preview && <p className="notice preview-banner">{t.preview}</p>}
        {page}
      </main>
      <footer className="site-footer shell">
        <div className="footer-row">
          <nav aria-label={lang === "en" ? "Footer navigation" : "页脚导航"}>
            {["privacy", "support", "licenses"].map((key) => (
              <a key={key} href={`#/${key}`}>
                {t[key]}
              </a>
            ))}
            <a
              href={config.repositoryUrl || "#/guides"}
              {...(config.repositoryUrl ? external : {})}
            >
              GitHub
            </a>
          </nav>
          <p>{t.disclaimer}</p>
        </div>

      </footer>
    </>
  );
}
function Download({ t, config }) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    let live = true;
    setQr(null);
    if (config.appStoreUrl)
      QRCode.toDataURL(config.appStoreUrl, {
        width: 140,
        margin: 2,
        errorCorrectionLevel: "M",
      })
        .then((url) => {
          if (live) setQr(url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [config.appStoreUrl]);
  return (
    <div className="download-block">
      <div className="download-row">
        {config.appStoreUrl ? (
          <a
            className={`download-button ${config.appStoreBadge ? "official-badge" : ""}`}
            href={config.appStoreUrl}
            {...external}
          >
            {config.appStoreBadge ? (
              <img src={asset(config.appStoreBadge)} alt={t.download} />
            ) : (
              <>
                <DownloadSimple />
                {t.download}
              </>
            )}
          </a>
        ) : (
          <button className="download-button unavailable" disabled>
            <DownloadSimple aria-hidden />
            <span>
              {t.download}
              <small>{t.downloadPending}</small>
            </span>
          </button>
        )}
        <div className="qr-slot">
          {qr ? (
            <img src={qr} alt={t.qrLabel} width="96" height="96" />
          ) : (
            <>
              <QrCode aria-hidden />
              <small>{t.qrPending}</small>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function Home({ t, lang, config, preview }) {
  const [scene, setScene] = useState("food");
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <h1 id="home-title">
          <span>{t.headline[0]}</span>
          <span>{t.headline[1]}</span>
        </h1>
        <p className="hero-subtitle">{t.subtitle}</p>
        <Download t={t} config={config} />
        <div className="hero-requirements">
          <p>{t.hardware}</p>
          <p>{t.setupNeed}</p>
          <p>{t.needs[2].join(" — ")}</p>
          <Link to="start">{t.checkAll}</Link>
        </div>
      </section>
      <section className="demo-section" aria-labelledby="demo-title">
        <PortraitVideo
          key={`${scene}-${lang}`}
          scene={scene}
          video={config.videos[scene]}
          t={t}
          lang={lang}
        />
        <div className="demo-copy">
          <h2 id="demo-title">
            {t.everyday[0]}
            <br />
            {t.everyday[1]}
          </h2>
          <p>{t.chooseScene}</p>
          <div className="scene-list" role="group" aria-label={t.chooseScene}>
            {sceneIds.map((id, i) => (
              <button
                key={id}
                className={`scene-button ${scene === id ? "selected" : ""}`}
                aria-pressed={scene === id}
                onClick={() => setScene(id)}
              >
                <span>{t.scenes[i][0]}</span>
                <small>{t.scenes[i][1]}</small>
                <ArrowRight aria-hidden />
              </button>
            ))}
          </div>
          <p className="playback-note">{t.playback}</p>
        </div>
      </section>
      <section
        className="pricing-band"
        aria-label={lang === "en" ? "Free allowance" : "免费额度"}
      >
        <h2>{t.free}</h2>
        <p>{t.task}</p>
        <p className="separate-costs">{t.costs}</p>
        {preview && !config.quotaVerified && <small>{t.quotaPending}</small>}
      </section>
      <section className="privacy-strip">
        <Info aria-hidden />
        <div>
          <p>{t.privacyShort}</p>
          <Link to="privacy">{t.privacyLink}</Link>
        </div>
      </section>
      <p className="price-footnote">
        {t.priceNote}{" "}
        <a
          href="https://shop.m5stack.com/products/atoms3-lite-esp32s3-dev-kit"
          {...external}
        >
          {t.currentPrice}
        </a>
      </p>
    </>
  );
}
function PortraitVideo({ scene, video, t, lang }) {
  const ref = useRef(null),
    [error, setError] = useState(false),
    [paused, setPaused] = useState(true),
    [muted, setMuted] = useState(true),
    [captions, setCaptions] = useState(true),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const [reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [attempt, setAttempt] = useState(0);
  const togglePlay = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setPaused(true));
    else v.pause();
  };
  const toggleCaption = () => {
    const next = !captions;
    setCaptions(next);
    if (ref.current)
      for (const track of ref.current.textTracks)
        track.mode =
          next &&
          (track.language === lang ||
            (lang === "zh" && !video.captionsZh && track.language === "en"))
            ? "showing"
            : "disabled";
  };
  return (
    <div className="portrait-column">
      <div
        className={`portrait-player ${!video ? "empty" : ""}`}
        aria-label={`${t.scenes[sceneIds.indexOf(scene)][0]} ${t.portrait}`}
      >
        {video && !error ? (
          <video
            key={attempt}
            ref={ref}
            playsInline
            muted={muted}
            poster={asset(video.poster)}
            preload="metadata"
            onError={() => setError(true)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
              if (!reduced) e.currentTarget.play().catch(() => setPaused(true));
            }}
            onEnded={() => setPaused(true)}
          >
            {video.webm && <source src={asset(video.webm)} type="video/webm" />}
            <source
              src={asset(video.mp4)}
              type="video/mp4"
              onError={() => setError(true)}
            />
            <track
              kind="captions"
              src={asset(video.captionsEn)}
              srcLang="en"
              label="English"
              default={lang === "en" || !video.captionsZh}
            />
            {video.captionsZh && (
              <track
                kind="captions"
                src={asset(video.captionsZh)}
                srcLang="zh"
                label="中文"
                default={lang === "zh"}
              />
            )}
          </video>
        ) : (
          <div className="media-placeholder" role="status">
            {error ? (
              <>
                <Info size={42} />
                <h3>{t.mediaError}</h3>
                <button
                  className="button-secondary"
                  onClick={() => {
                    setError(false);
                    setAttempt((a) => a + 1);
                  }}
                >
                  <ArrowCounterClockwise />
                  {t.retry}
                </button>
              </>
            ) : (
              <>
                <h3>{t.exampleLabel}</h3>
                <blockquote>“{t.sceneExamples[scene][0]}”</blockquote>
                <p>{t.sceneExamples[scene][1]}</p>
                <p>{t.sceneExamples[scene][2]}</p>
                <small>{t.scenePending}</small>
              </>
            )}
          </div>
        )}
        {video && !error ? (
          <div className="video-controls">
            <button
              className="icon-button"
              onClick={togglePlay}
              aria-label={paused ? t.play : t.pause}
            >
              {paused ? <Play weight="fill" /> : <Pause weight="fill" />}
            </button>
            <input
              type="range"
              aria-label={lang === "en" ? "Video position" : "视频进度"}
              min="0"
              max={Number.isFinite(duration) && duration > 0 ? duration : 1}
              step="0.1"
              value={time}
              disabled={!duration}
              onChange={(e) => {
                ref.current.currentTime = Number(e.target.value);
                setTime(Number(e.target.value));
              }}
            />
            <button
              className="icon-button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? t.unmute : t.mute}
            >
              {muted ? <SpeakerSlash /> : <SpeakerHigh />}
            </button>
            <button
              className={`icon-button ${captions ? "captions-on" : ""}`}
              aria-label={lang === "en" ? "Toggle captions" : "切换字幕"}
              aria-pressed={captions}
              onClick={toggleCaption}
            >
              <ClosedCaptioning />
            </button>
          </div>
        ) : (
          <div className="empty-media-note">
            <ClosedCaptioning aria-hidden />
            <span>{t.exampleLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
const requirementIcons = [
  DeviceMobile,
  UserCircle,
  Waveform,
  WifiHigh,
  DeviceMobile,
  Cpu,
  Laptop,
];
function Start({ t, lang, config }) {
  return (
    <>
      <PageHeading eyebrow={t.start} title={t.before} subtitle={t.beforeSub} />
      <div className="start-grid">
        <section className="requirements">
          <h2>{t.need}</h2>
          <h3 className="group-label">{t.screenGroup}</h3>
          {t.needs.slice(0, 4).map((r, i) => (
            <Requirement key={i} row={r} Icon={requirementIcons[i]}>
              {i === 0 && <a className="text-link" href="#compatibility" onClick={e => {e.preventDefault(); document.getElementById("compatibility")?.scrollIntoView({behavior:"smooth"});}}>{t.viewCompat}</a>}
            </Requirement>
          ))}
          <h3 className="group-label control-group">{t.controlGroup}</h3>
          {t.needs.slice(4).map((r, i) => (
            <Requirement key={i} row={r} Icon={requirementIcons[i + 4]}>
              {i === 1 && <Link to="buy">{t.buy}</Link>}
            </Requirement>
          ))}
          <Link className="button-secondary" to="firmware">
            {t.firmware}
          </Link>
          <p className="small-note">{t.noAccessory}</p>
        </section>
        <section className="steps">
          <h2>{t.threeSteps}</h2>
          {t.steps.map((step, i) => {
            const screenshot = config.screenshots.find(
              (s) => s.step === i + 1 && s.locale === lang,
            );
            return (
              <article className="step-row" key={i}>
                <figure>
                  <div className="step-capture">
                    {screenshot ? (
                      <img src={asset(screenshot.src)} alt={step[2]} />
                    ) : (
                      <>
                        <ImageSquare size={24} aria-hidden />
                        <span>{t.screenshot}</span>
                      </>
                    )}
                  </div>
                  <figcaption>
                    {step[2]}
                    {screenshot && (
                      <small>
                        {t.captured}: {screenshot.capturedAt}
                        <br />
                        iOS {screenshot.ios} · SaySo {screenshot.appVersion}
                        <br />
                        ChatGPT {screenshot.chatgptVersion} ·{" "}
                        {screenshot.locale}
                      </small>
                    )}
                  </figcaption>
                </figure>
                <div className="step-text">
                  <span className="step-number">0{i + 1}</span>
                  <h3>{step[0]}</h3>
                  <p>{step[1]}</p>
                </div>
              </article>
            );
          })}
          <p className="small-note">{t.connectedNote}</p>
          <Link to="support">{t.resume}</Link>
        </section>
      </div>
      <Compatibility t={t} config={config} />
      <aside className="approval-band">
        <HandTap aria-hidden />
        <div>
          <h2>{t.approve}</h2>
          <p>{t.approveSub}</p>
        </div>
      </aside>
      <div className="start-bottom">
        <p>{t.free}</p><p>{t.quotaPending}</p>
        <p>{t.costs}</p>
        <small>{t.priceNote}</small>
      </div>
    </>
  );
}
function Requirement({ row, Icon, children }) {
  return (
    <div className="requirement">
      <Icon aria-hidden />
      <div>
        <h4>{row[0]}</h4>
        <p>{row[1]}</p>
        {children}
      </div>
    </div>
  );
}
function PageHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="page-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
function DocumentSections({ sections }) {
  return (
    <div className="document-sections">
      {sections.map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
    </div>
  );
}
function Repository({ config, t }) {
  return config.repositoryUrl ? (
    <Link to={config.repositoryUrl}>{t.repoOpen}</Link>
  ) : (
    <p className="notice">
      <Info aria-hidden />
      {t.repoPending}
    </p>
  );
}
function Guides({ t, config }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.guides}
        title={t.guidesTitle}
        subtitle={t.guidesSub}
      />
      <DocumentSections sections={t.guideSections} />
      <Repository t={t} config={config} />
      <section className="document-sections">
        <h2>{t.officialDocs}</h2>
        <Link to="https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites">
          {t.sitesDocs}
        </Link>
        <Link to="https://help.openai.com/en/articles/20001274-chatgpt-voice">
          {t.voiceDocs}
        </Link>
      </section>
      <Link className="button-primary" to="start">
        {t.start}
      </Link>
    </div>
  );
}
function Compatibility({t,config,mode}) {
  const rows=config.compatibility.filter(row => !mode || row.mode===mode);
  return (      <section className="document-sections" id="compatibility">
        <h2>{t.compatTitle}</h2>
        {rows.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  {t.compatColumns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.mode === "screen" ? t.screenMode : t.controlMode}
                    </td>
                    <td>{r.model}</td>
                    <td>{r.ios}</td>
                    <td>{r.appVersion}</td>
                    <td>
                      {r.mode === "control"
                        ? `${r.accessory} / ${r.firmware}`
                        : "—"}
                    </td>
                    <td>{r.testedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t.compatPending}</p>
        )}
      </section>);
}
function Firmware({ t, config }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow="SaySo Install"
        title={t.firmwareTitle}
        subtitle={t.firmwareSub}
      />
      <p className="lead">{t.firmwareBody}</p>
      <p>{t.needs[5].join(" — ")}</p><p>{t.needs[6].join(" — ")}</p><p>{t.compatPending}</p>
      {config.installerPath || config.installerUrl ? (
        <Link
          className="button-primary"
          to={config.installerPath || config.installerUrl}
          kind={config.installerPath ? "app" : "route"}
        >
          {t.installer}
        </Link>
      ) : (
        <p className="notice">
          <Info aria-hidden />
          {t.installerPending}
        </p>
      )}
      <Compatibility t={t} config={config} mode="control" />
      <div className="link-row">
        <Link to="start">{t.checkAll}</Link>
        <Link to="buy">{t.buy}</Link>
      </div>
    </div>
  );
}
function Buy({ t }) {
  return (
    <div className="document">
      <PageHeading eyebrow={t.buy} title={t.buyTitle} subtitle={t.buySub} />
      <div className="vendor-list">
        {[
          [
            t.officialShop,
            "https://shop.m5stack.com/products/atoms3-lite-esp32s3-dev-kit",
          ],
          [
            t.digikey,
            "https://www.digikey.com/en/products/detail/m5stack-technology-co-ltd/C124/18070571",
          ],
        ].map(([name, url]) => (
          <a key={url} href={url} {...external}>
            <span>
              <strong>{name}</strong>
              <small>AtomS3 Lite · C124</small>
            </span>
            <span>
              {t.vendor}
              <ArrowUpRight />
            </span>
          </a>
        ))}
      </div>
      <p>{t.buyNote}</p>
      <Link to="firmware">{t.viewCompat}</Link>
    </div>
  );
}
function Privacy({ t, config }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.privacy}
        title={t.privacyTitle}
        subtitle={t.privacySub}
      />
      {!config.privacyApproved && (
        <p className="notice">
          <Info aria-hidden />
          {t.draft}
        </p>
      )}
      <DocumentSections sections={t.privacySections} />
      <Link to="support">{t.support}</Link>
    </div>
  );
}
function Support({ t, config }) {
  const [status, setStatus] = useState("");
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(t.reportBody);
      setStatus(t.copied);
    } catch {
      setStatus(t.copyFailed);
    }
  };
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.support}
        title={t.supportTitle}
        subtitle={t.supportSub}
      />
      <div className="faq-list">
        {t.supportItems.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <section className="document-sections">
        <h2>{t.report}</h2>
        <p>{t.reportBody}</p>
        <button className="button-secondary" onClick={copyReport}>
          <Copy />
          {t.copyReport}
        </button>
        <p className="small-note" role="status">
          {status}
        </p>
        {config.supportEmail ? (
          <a className="text-link" href={`mailto:${config.supportEmail}`}>
            {t.contact}
            <ArrowUpRight />
          </a>
        ) : (
          <p className="notice">
            <Info aria-hidden />
            {t.contactPending}
          </p>
        )}
      </section>
    </div>
  );
}
function Licenses({ t, config }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.licenses}
        title={t.licensesTitle}
        subtitle={t.licensesSub}
      />
      <p className="lead">{t.licensesBody}</p>
      <p>
        <a
          href="https://github.com/zhaibin2018/sayso/blob/main/LICENSE.md"
          {...external}
        >
          FSL-1.1-ALv2
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/zhaibin2018/sayso/blob/main/TRADEMARK.md"
          {...external}
        >
          SaySo trademark notice
        </a>
      </p>
      <Repository t={t} config={config} />
      <section className="document-sections">
        <h2>{t.licenseFrontend}</h2>
        <ul>
          <li>React / React DOM — MIT</li>
          <li>Phosphor Icons — MIT</li>
          <li>Inter — SIL Open Font License 1.1</li>
          <li>QRCode — MIT</li>
        </ul>
        <a
          href={asset("THIRD_PARTY_NOTICES.txt")}
          className="text-link"
          {...external}
        >
          Third-party notices <ArrowUpRight />
        </a>
      </section>
    </div>
  );
}
