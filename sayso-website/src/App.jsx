import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowCounterClockwise,
  Play,
  Pause,
  SpeakerSlash,
  SpeakerHigh,
  ClosedCaptioning,
  DeviceMobile,
  UserCircle,
  WifiHigh,
  Cpu,
  Laptop,
  HandTap,
  Info,
  DownloadSimple,
} from "@phosphor-icons/react";
import { copy } from "./copy";
import { SiteHeader, NotFound } from "./SiteChrome.jsx";
import { getLanguage, rememberLanguage } from "../public/language.js";
import { getTheme, toggleTheme, watchTheme } from "../public/site-preferences.js";
import { installation, serviceDefinition, sharingInstructions, switchingGuide } from "./installation.js";
import {
  normalizeConfig,
  sceneIds,
  linkTarget,
} from "./config.mjs";
import "@fontsource-variable/inter";

const entryLanguage = () => {
  const fragment = location.hash.slice(1);
  return fragment === "zh" || fragment === "en" ? fragment : null;
};
const currentRoute = () =>
  entryLanguage() ? "home" : location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
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
  const [lang, setLang] = useState(() => entryLanguage() ?? getLanguage());
  const [theme, setTheme] = useState(getTheme);
  const [route, setRoute] = useState(currentRoute);
  const [menu, setMenu] = useState(false);
  const [config, setConfig] = useState(() => normalizeConfig());
  const [configError, setConfigError] = useState(false);
  const main = useRef(null);
  const t = copy[lang];
  useEffect(() => {
    const sync = (event) => {
      if (event.key === "sayso-language" || event.key === null) setLang(getLanguage());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => watchTheme(setTheme), []);
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
      })
      .catch((e) => {
        if (e.name !== "AbortError") setConfigError(true);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const change = () => {
      setRoute(currentRoute());
      const locale = entryLanguage();
      if (locale) setLang(locale);
      setMenu(false);
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = `${route === "home" ? (lang === "en" ? "Make your iPhone easier to use" : "让 iPhone 更容易使用") : t[route] || t.notFound} · SaySo`;
  }, [route, t, lang]);
  const props = { t, lang, config };
  let page;
  switch (route) {
    case "home":
      page = <Home {...props} />;
      break;
    case "start":
      page = <Start {...props} />;
      break;
    case "requirements":
      page = <Requirements {...props} />;
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
      page = <NotFound lang={lang} />;
  }
  const notFound = page.type === NotFound;
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
      <SiteHeader lang={lang} route={route} theme={theme} menu={menu} setMenu={setMenu}
        setLanguage={(locale) => {
          rememberLanguage(locale);
          if (entryLanguage()) history.replaceState(history.state, "", `#${locale}`);
          setLang(locale);
        }}
        onTheme={() => setTheme(toggleTheme(theme))} />
      <main
        id="main-content"
        ref={main}
        tabIndex={-1}
        className={`shell route-${notFound ? "not-found" : route}`}
      >
        {!notFound && configError && (
          <p className="notice" role="status">
            <Info />
            {t.configError}
          </p>
        )}
        {!notFound && <div className="preview-banner">
          {config.testFlightUrl ? (
            <Link to={config.testFlightUrl} data-beta-link="banner">{t.betaJoin}</Link>
          ) : (
            <span>{t.betaPending}</span>
          )}
        </div>}
        {page}
      </main>
      {!notFound && <footer className="site-footer shell">
        <div className="footer-row">
          <nav aria-label={lang === "en" ? "Footer navigation" : "页脚导航"}>
            {["requirements", "buy", "privacy", "support", "licenses"].map((key) => (
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

      </footer>}
    </>
  );
}
function Download({ t, config }) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    let live = true;
    setQr(null);
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
        {qr && (
          <div className="qr-slot">
            <img src={qr} alt={t.qrLabel} width="96" height="96" />
          </div>
        )}
      </div>
    </div>
  );
}
export function Home({ t, lang, config }) {
  const [scene, setScene] = useState("food");
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <h1 id="home-title">{t.headline}</h1>
        <p className="hero-subtitle">{t.subtitle}</p>
        <p className="hero-safety-note">{t.finalTapNote}</p>
        {config.appStoreUrl && <Download t={t} config={config} />}
        <Link className="button-primary" to={config.testFlightUrl || "start"} data-beta-link={config.testFlightUrl ? "hero" : undefined}>{config.testFlightUrl ? t.betaJoin : lang === "zh" ? "查看开始步骤" : "See how to get started"}</Link>
        <div className="hero-requirements">
          <p>{t.hardware}</p>
          <Link to="requirements">{t.checkAll}</Link>
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
            <span>{t.everyday[0]}</span>{" "}
            <span>{t.everyday[1]}</span>
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
          {config.videos[scene] && <p className="playback-note">{t.playback}</p>}
        </div>
      </section>
      <section className="document-sections home-sharing">
        <h2>{sharingInstructions[lang].title}</h2>
        <p>{sharingInstructions[lang].short}</p>
        <p>{sharingInstructions[lang].example}</p>
        <Link to="start">{t.start}</Link>
      </section>
      <ScreenSharingComparison t={t} />
      <Allowance t={t} paragraphs={t.feeParagraphs} />
      <section className="privacy-strip">
        <Info aria-hidden />
        <div>
          <p>{t.privacyShort}</p>
          <Link to="privacy">{t.privacyLink}</Link>
        </div>
      </section>
    </>
  );
}
function ScreenSharingComparison({ t }) {
  return (
    <section className="document-sections screen-sharing-comparison">
      <h2>{t.comparisonTitle}</h2>
      <p>{t.comparisonBody}</p>
      <p>{t.comparisonDisclaimer}</p>
      <Link to="https://help.openai.com/en/articles/20001274-chatgpt-voice">{t.officialDocs}</Link>
    </section>
  );
}
function Allowance({ t, paragraphs = [t.free] }) {
  return (
    <section className="pricing-band" aria-label={t.feesTitle}>
      <h2>{t.feesTitle}</h2>
      {paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </section>
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
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
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
        ) : null}
      </div>
    </div>
  );
}
const requirementIcons = {
  screen: [DeviceMobile, UserCircle, WifiHigh],
  tapping: [DeviceMobile, Cpu, Laptop],
};
export function Start({ t, lang, config, documentPrefix }) {
  const labels = installation[lang];
  const sharing = sharingInstructions[lang];
  const { connection, permissions, assistiveTouch, tapping } = labels;
  const supportDirectory = lang === "zh" ? "support/" : "support/en/";
  const resource = path => documentPrefix ? documentPrefix + path : asset(path);
  const support = faq => <a href={resource(`${supportDirectory}#faq-${faq}`)}>{labels.help}</a>;
  useEffect(() => {
    const focusAssistiveTouch = () => {
      if (location.hash !== "#/start?section=assistive-touch") return;
      const target = document.getElementById("assistive-touch");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView();
    };
    focusAssistiveTouch();
    window.addEventListener("hashchange", focusAssistiveTouch);
    return () => window.removeEventListener("hashchange", focusAssistiveTouch);
  }, []);
  return (
    <div className="start-flow">
      <section className="start-intro" aria-labelledby="start-title">
        <h1 id="start-title">{labels.title}</h1>
        <div className="start-before">
          <h2>{labels.before}</h2>
          <p>{t.startPrerequisite}</p>
          <p>{t.beforeSub}</p>
        </div>
        <h2>{labels.phone}</h2>
        <ol className="installation-steps">
          <li>
            <h3>{labels.install.title}</h3>
            {config.testFlightUrl
              ? <><a href={config.testFlightUrl} data-beta-link="start">{t.betaJoin}</a>
                <p className="small-note">{labels.install.expected}</p></>
              : <p>{t.supportBetaPending}</p>}
          </li>
          <li>
            <h3>{connection.title}</h3>
            <p>{connection.action}</p>
            <ol className="setup-actions">{connection.steps.map(([action, detail]) => <li key={action}>
              <p>{action}</p>
              <p className="setup-step-detail">{detail}</p>
            </li>)}</ol>
            <div className="work-chat">
              <p>{serviceDefinition[lang]}</p>
              <p>{labels.workChat} <Link to={switchingGuide} arrow={false}>{labels.switchLabel}</Link></p>
            </div>
            {support(5)}
          </li>
          <li>
            <h3>{sharing.title}</h3>
            <ol className="setup-actions">{sharing.steps.map(step => <li key={step}>{step}</li>)}</ol>
            <p>{sharingInstructions[lang].accessoryPrompt}</p>
            <p className="small-note">{labels.sharingResult}</p>
            {support(6)}
          </li>
        </ol>
        {config.appStoreUrl && <a className="button-primary" href={config.appStoreUrl} {...external}>{t.download}</a>}
      </section>
      <section className="optional-control" aria-labelledby="control-title">
        <h2 id="control-title">{installation[lang].optional}</h2>
        <p>{t.usbRequirement}</p>
        <ol className="installation-steps">
          {labels.controlSteps.map(([title, body, expected, faq], i) => <li key={title}>
            <h3>{title}</h3>
            <p>{body}{i === 0 && <> <a href="#/buy">{t.buy}</a></>}</p>
            {i === 0 && <a href={resource(lang === "zh" && documentPrefix ? "flash/zh.html" : "flash/")}>{t.firmware}</a>}
            <p className="small-note">{expected}</p>
            {support(faq)}
          </li>)}
          <li id="assistive-touch" tabIndex={-1}>
            <h3>{assistiveTouch.title[0]}<wbr />{assistiveTouch.title[1]}</h3>
            <p>{assistiveTouch.summary}</p>
            <details className="setup-detail">
              <summary>{assistiveTouch.details}</summary>
              <p>{assistiveTouch.open}</p>
              <ol className="setup-actions">{assistiveTouch.steps.map(step => <li key={step}>{step}</li>)}</ol>
              <p>{assistiveTouch.confirm}</p>
            </details>
            {support(7)}
          </li>
        </ol>
        <details className="setup-detail tapping-permissions">
          <summary>{permissions.title}</summary>
          <p>{permissions.body}</p>
        </details>
        <section className="tapping-options" aria-labelledby="tapping-options-title">
          <h3 id="tapping-options-title">{tapping.title}</h3>
          <p>{tapping.subtitle}</p>
          <dl>
            <dt>{tapping.automatic}</dt><dd>{tapping.automaticBody}</dd>
            <dt>{tapping.ask}</dt><dd>{tapping.askBody}</dd>
          </dl>
          <p>{tapping.safety}</p>
          <p className="small-note">{t.finalTapNote}</p>
        </section>
        {!documentPrefix && <div className="link-row"><Link to="buy">{t.buy}</Link><Link to="firmware">{t.firmware}</Link></div>}
        <p className="small-note">{t.controlCompatibility}</p>
      </section>
      <Allowance t={t} />
      <section className="start-details" aria-labelledby="details-title">
        <h2 id="details-title">{t.detailsTitle}</h2>
        <details>
          <summary>{t.need}</summary>
          <div className="details-content">
            <h3 className="group-label">{t.screenGroup}</h3>
            <RequirementList rows={t.requirementGroups.screen} group="screen" />
            <h3 className="group-label">{t.controlGroup}</h3>
            <RequirementList rows={t.requirementGroups.tapping} group="tapping" />
          </div>
        </details>
        <details>
          <summary>{t.compatTitle}</summary>
          <div className="details-content"><Compatibility t={t} config={config} heading={false} supportUrl={documentPrefix && resource(supportDirectory)} /></div>
        </details>
        <details>
          <summary>{t.support}</summary>
          <div className="details-content start-help">
            <h3>{t.approve}</h3><p><DocumentText text={t.approveSub} /></p>
            <p>{t.connectedNote}</p>
            {t.appNameNote && <p>{t.appNameNote}</p>}
            <p>{t.keyboardNote}</p>
            {documentPrefix ? <a href={resource(supportDirectory)}>{t.resume}</a> : <Link to="support">{t.resume}</Link>}
          </div>
        </details>
      </section>
      <ScreenSharingComparison t={t} />
    </div>
  );
}
function RequirementList({ rows, group }) {
  return rows.map((row, i) => <Requirement key={row[0]} row={row} Icon={requirementIcons[group][i]} />);
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
export function Requirements({ t, config }) {
  return (
    <div className="document">
      <PageHeading title={t.requirements} subtitle={t.hardware} />
      <section className="document-sections requirements-detail">
        <h2>{t.screenGroup}</h2>
        <RequirementList rows={t.requirementGroups.screen} group="screen" />
        <h2>{t.controlGroup}</h2>
        <RequirementList rows={t.requirementGroups.tapping} group="tapping" />
        <p className="requirements-keyboard">{t.requirementsKeyboard}</p>
      </section>
      <Compatibility t={t} config={config} />
      <div className="link-row">
        <Link className="button-primary" to="buy">{t.buy}</Link>
        <Link to="start">{t.start}</Link>
      </div>
    </div>
  );
}
function DocumentText({ text }) {
  return text.split(/(\*\*.*?\*\*|saysoapp\.help@gmail\.com)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> :
    part === "saysoapp.help@gmail.com" ? <a key={i} href={`mailto:${part}`}>{part}</a> : part
  );
}
function DocumentBody({ body }) {
  if (body?.blocks) return body.blocks.map((block, i) => {
    if (block.type === "p") return <p key={i}>{block.link
      ? <>{block.link.before}<Link to={block.link.route} arrow={false}>{block.link.label}</Link>{block.link.after}</>
      : <DocumentText text={block.text} />}</p>;
    const Tag = block.type === "ol" ? "ol" : "ul";
    return <Tag key={i}>{block.items.map(item => <li key={item}><DocumentText text={item} /></li>)}</Tag>;
  });
  if (!Array.isArray(body)) return <p><DocumentText text={body} /></p>;
  const [lead, ...details] = body;
  return (
    <>
      <p>{lead}</p>
      {details.length > 0 && (
        <ul>{details.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
    </>
  );
}
function DocumentSections({ sections }) {
  return (
    <div className="document-sections">
      {sections.map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <DocumentBody body={body} />
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
export function Guides({ t, config, lang }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.guides}
        title={t.guidesTitle}
        subtitle={t.guidesSub}
      />
      <DocumentSections sections={t.guideSections} />
      <section className="document-sections guide-examples">
        <h2>{t.trySaying}</h2>
        {sceneIds.map((scene, index) => {
          const [title, ...examples] = t.guideExamples[scene];
          return (
            <section key={scene}>
              <h3>{title} <small>{t.scenes[index][1]}</small></h3>
              <ul>
                {examples.map((example) => <li key={example}>“{example}”</li>)}
              </ul>
            </section>
          );
        })}
      </section>
      <ScreenSharingComparison t={t} />
      <p>{t.needHelp} <Link to="support">{t.viewSupport}</Link></p>
      <Link className="button-primary" to="start">
        {t.start}
      </Link>
    </div>
  );
}
function Compatibility({t,config,heading = true,supportUrl}) {
  const rows=config.compatibility;
  return (      <section className="document-sections" id="compatibility">
        {heading && <h2>{t.compatTitle}</h2>}
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
                    <td className="compatibility-model">{r.model}</td>
                    <td>{r.ios}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p>{supportUrl ? <a href={supportUrl}>{t.compatUnverified}</a> : <Link to="support">{t.compatUnverified}</Link>}</p>
      </section>);
}
export function Firmware({ t, config }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.firmware}
        title={t.firmwareTitle}
        subtitle={t.firmwareSub}
      />
      <p className="lead">{t.firmwareBody}</p>
      <section className="accessory-requirements" aria-labelledby="accessory-requirements">
        <h2 id="accessory-requirements">{t.need}</h2>
        <ul>
          <li>{t.usbRequirement}</li>
          {t.requirementGroups.tapping.slice(1).map(row => <li key={row[0]}>{row.join(" — ")}</li>)}
        </ul>
      </section>
      {config.installerPath || config.installerUrl ? (
        <Link className="button-primary" to={config.installerPath || config.installerUrl}
          kind={config.installerPath ? "app" : "route"}>{t.installer}</Link>
      ) : (
        <a className="button-primary" href={asset("flash/")}>{t.installer}</a>
      )}
      <Compatibility t={t} config={config} />
      <div className="link-row">
        <Link to="requirements">{t.checkAll}</Link>
        <Link to="buy">{t.buy}</Link>
      </div>
    </div>
  );
}
function Buy({ t }) {
  return (
    <div className="document buy-document">
      <PageHeading eyebrow={t.buy} title={t.buyTitle} subtitle={t.buyIntro} />
      <p>{t.buySub}</p>
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
      <div className="link-row">
        <Link to="requirements">{t.viewCompat}</Link>
        <Link className="button-primary" to="firmware">{t.firmware}</Link>
      </div>
    </div>
  );
}
export function Privacy({ t, config }) {
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
      <p className="publisher-info">{t.publisherLabel}{t.publisherType}{config.publisherName || t.publisherPending}{t.publisherContact}<a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></p>
      <p className="lead">{t.privacyIntro}</p>
      <DocumentSections sections={t.privacySections} />
      <section className="document-sections">
        <h2>{t.privacyResources}</h2>
        <ul>
          <li><Link arrow={false} to="https://openai.com/policies/privacy-policy/">{t.openaiPrivacy}</Link></li>
          <li><Link arrow={false} to="https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt">{t.openaiDataControls}</Link></li>
          <li><Link arrow={false} to="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection">{t.githubPagesData}</Link></li>
        </ul>
      </section>
      <Link to="support">{t.support}</Link>
    </div>
  );
}
export function Support({ t, config, staticDocument = false }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.support}
        title={t.supportTitle}
        subtitle={t.supportSub}
      />
      <div className="faq-list">
        {t.supportItems.map(([q, a], i) => (
          <details key={q} id={`faq-${i}`} open={staticDocument || undefined}>
            <summary>{q}</summary>
            {a ? <DocumentBody body={a} /> : config.testFlightUrl
              ? <p><Link to={config.testFlightUrl} data-beta-link="support">{t.betaJoin}</Link></p>
              : <p>{t.supportBetaPending}</p>}
          </details>
        ))}
      </div>
      <section className="document-sections">
        <h2>{t.supportContactTitle}</h2>
        <DocumentBody body={t.supportContactBody} />
        <div className="link-row">
          <ul className="support-links"><li><Link to="start">{t.start}</Link></li><li><Link to="requirements">{t.requirements}</Link></li><li><Link to="firmware">{t.firmware}</Link></li></ul>
        </div>
        <p><Link to="privacy">{t.supportPrivacyLink}</Link></p>
      </section>
    </div>
  );
}
export function Licenses({ t, config }) {
  return (
    <div className="document">
      <PageHeading
        eyebrow={t.licenses}
        title={t.licensesTitle}
        subtitle={t.licensesIntro}
      />
      <p>{t.licensesSub}</p>
      <p className="lead">{t.licensesBody}</p>
      <p>{t.publisherLabel}{config.publisherName}</p>
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
          {t.trademarkNotice}
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
          href={asset(t === copy.en ? "THIRD_PARTY_NOTICES.txt" : "THIRD_PARTY_NOTICES.zh.txt")}
          className="text-link"
          {...external}
        >
          {t.thirdPartyNotices} <ArrowUpRight />
        </a>
      </section>
    </div>
  );
}
