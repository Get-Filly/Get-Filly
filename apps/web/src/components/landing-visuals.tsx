// ============================================================
// Landing-visuals — statische product-mockups per homepage-pijler.
// Concrete "product-momenten" i.p.v. abstracte hub-diagrammen.
// De pop-in loopt via het site-brede `data-reveal` + <ScrollReveal/>
// (gemount in page.tsx): elk item komt 1× omhoog-faden zodra het in
// beeld scrollt, identiek aan de rest van de pagina. Geen eigen hook.
// ============================================================

import { getTranslations } from "next-intl/server";
import { BrandLogo, type BrandId } from "./brand-logos";
import "./landing-visuals.css";

// BrandLogo rendert een SVG-<g>; in HTML-context wrappen we 'm in een
// eigen <svg> zodat 'ie als los icoontje getoond kan worden.
function Logo({ id, size = 22 }: { id: BrandId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <BrandLogo id={id} x={12} y={12} size={24} />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="#9aa39b" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa39b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// === 01 Vindbaarheid: zoekresultaat + AI-chat + review ===
export async function VindbaarheidVisual() {
  const t = await getTranslations("home");
  return (
    <div className="lv lv-find" aria-hidden="true">
      {/* Klassiek zoekresultaat met echte zoekbalk (SEO) */}
      <div className="lv-card lv-search" data-reveal>
        <span className="lv-rank">
          <Logo id="google" size={13} /> #1
        </span>
        <div className="lv-searchbar">
          <SearchIcon />
          <span>{t("mockup.visuals.find.searchQuery")}</span>
        </div>
        <div className="lv-result">
          <div className="lv-result-name">Bistro Get-Filly</div>
          <div className="lv-result-url">{t("mockup.visuals.find.resultUrl")}</div>
          <div className="lv-result-meta">
            {t.rich("mockup.visuals.find.resultMeta", { b: (c) => <b>{c}</b> })}
          </div>
        </div>
      </div>

      {/* AI-zoekmachine als chatgesprek (GEO) */}
      <div className="lv-card lv-chat" data-reveal>
        <div className="lv-chat-head">
          <Logo id="chatgpt" size={16} /> {t("mockup.visuals.find.chatHead")}
        </div>
        <div className="lv-chat-q">{t("mockup.visuals.find.chatQ")}</div>
        <div className="lv-chat-a">
          <span className="lv-chat-ava"><Logo id="chatgpt" size={15} /></span>
          <span className="lv-chat-bubble">
            {t.rich("mockup.visuals.find.chatBubble", { b: (c) => <b>{c}</b> })}
          </span>
        </div>
      </div>

      {/* Review als echte review-kaart (met eigenaar-antwoord) */}
      <div className="lv-card lv-rev" data-reveal>
        <div className="lv-rev-head">
          <Logo id="tripadvisor" size={16} /> {t("mockup.visuals.find.revHead")}
        </div>
        <div className="lv-rev-top">
          <span className="lv-avatar">S</span>
          <div>
            <div className="lv-rev-name">Sophie M.</div>
            <div className="lv-rev-date">{t("mockup.visuals.find.revDate")}</div>
          </div>
          <span className="lv-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
        </div>
        <div className="lv-rev-q">
          {t("mockup.visuals.find.revQuote")}
        </div>
        <div className="lv-rev-reply">
          <div className="lv-rev-reply-from">{t("mockup.visuals.find.revReplyFrom")}</div>
          <div className="lv-rev-reply-txt">{t("mockup.visuals.find.revReplyTxt")}</div>
        </div>
      </div>
    </div>
  );
}

// === 02 Zichtbaarheid: overlappende social-posts (TikTok eerst) ===
export async function ZichtbaarheidVisual() {
  const t = await getTranslations("home");
  return (
    <div className="lv lv-social" aria-hidden="true">
      {/* Facebook — achterste (foto: pasta), popt als eerste op */}
      <div className="lv-post-slot lv-post-1" data-reveal>
        <article className="lv-post">
          <div className="lv-post-head">
            <span className="lv-post-ic"><Logo id="facebook" /></span>
            <span className="lv-post-name">Bistro Get-Filly</span>
          </div>
          <div className="lv-post-media lv-media-fb">
            <img src="/visuals/facebook.jpg" alt="" loading="lazy" />
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-cap">{t("mockup.visuals.social.fbCap")}</div>
            <div className="lv-post-stats">{t("mockup.visuals.social.fbStats")}</div>
          </div>
        </article>
      </div>

      {/* TikTok — midden (foto: wokpan) */}
      <div className="lv-post-slot lv-post-2" data-reveal>
        <article className="lv-post">
          <div className="lv-post-head">
            <span className="lv-post-ic"><Logo id="tiktok" /></span>
            <span className="lv-post-name">@bistrogetfilly</span>
          </div>
          <div className="lv-post-media lv-media-tt">
            <img src="/visuals/tiktok.jpg" alt="" loading="lazy" />
            <span className="lv-post-tag">&#9654; 12k</span>
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-cap">{t("mockup.visuals.social.ttCap")}</div>
            <div className="lv-post-stats">{t("mockup.visuals.social.ttStats")}</div>
          </div>
        </article>
      </div>

      {/* YouTube — rechts-onder (foto: geroosterd rack met vijgen) */}
      <div className="lv-post-slot lv-post-4" data-reveal>
        <article className="lv-post">
          <div className="lv-post-head">
            <span className="lv-post-ic"><Logo id="youtube" /></span>
            <span className="lv-post-name">Bistro Get-Filly</span>
          </div>
          <div className="lv-post-media lv-media-yt">
            <img src="/visuals/youtube.jpg" alt="" loading="lazy" />
            <span className="lv-post-tag">&#9654; 0:38</span>
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-cap">{t("mockup.visuals.social.ytCap")}</div>
            <div className="lv-post-stats">{t("mockup.visuals.social.ytStats")}</div>
          </div>
        </article>
      </div>

      {/* Instagram — voorste (foto: sfeer/ambiance) */}
      <div className="lv-post-slot lv-post-3" data-reveal>
        <article className="lv-post">
          <div className="lv-post-head">
            <span className="lv-post-ic"><Logo id="instagram" /></span>
            <span className="lv-post-name">bistro_getfilly</span>
          </div>
          <div className="lv-post-media lv-media-ig">
            <img src="/visuals/instagram.jpg" alt="" loading="lazy" />
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-cap">{t("mockup.visuals.social.igCap")}</div>
            <div className="lv-post-stats">{t("mockup.visuals.social.igStats")}</div>
          </div>
        </article>
      </div>
    </div>
  );
}

// === 03 Bereikbaarheid: doelgroep + uiting + resultaat ===
// Per 2026-09-09 herzien: was een mailkaart + WhatsApp-gesprek, daarna kort een
// grote advertentie-preview. Die laatste maakte de derde feature-rij ~130px
// hoger dan de eerste twee, waardoor de rijen niet meer uitlijnden. Nu drie
// compacte kaarten (zelfde aantal als pijler 1 en 2, dus ook dezelfde
// gestaffelde pop-in) met een kleine vierkante thumbnail i.p.v. een 16:9-beeld,
// samen ~500px hoog. De platform-chrome blijft generiek: de site houdt de
// koepelterm "uitingen op sociale media" aan.
export async function BereikbaarheidVisual() {
  const t = await getTranslations("home");
  return (
    <div className="lv lv-reach" aria-hidden="true">
      {/* 1. Wie ga je bereiken */}
      <div className="lv-card lv-aud" data-reveal>
        <div className="lv-aud-head">
          <span className="lv-aud-pin">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
          </span>
          <span className="lv-aud-title">{t("mockup.visuals.reach.audienceTitle")}</span>
        </div>
        <div className="lv-aud-tags">
          <span>{t("mockup.visuals.reach.audienceRadius")}</span>
          <span>{t("mockup.visuals.reach.audienceAge")}</span>
          <span className="lv-aud-tag-hi">{t("mockup.visuals.reach.audienceReach")}</span>
        </div>
      </div>

      {/* 2. De uiting zoals die klant hem ziet, compact */}
      <div className="lv-card lv-uit" data-reveal>
        <div className="lv-uit-thumb">
          <img src="/visuals/instagram.jpg" alt="" loading="lazy" />
        </div>
        <div className="lv-uit-body">
          <div className="lv-uit-brand">
            <span className="lv-uit-logo"><Logo id="instagram" size={15} /></span>
            {t("mockup.visuals.reach.brand")}
            <span className="lv-uit-sponsored">{t("mockup.visuals.reach.sponsored")}</span>
          </div>
          <div className="lv-uit-cap">{t("mockup.visuals.reach.cap")}</div>
          <span className="lv-uit-cta">{t("mockup.visuals.reach.cta")}</span>
        </div>
      </div>

      {/* 3. Wat het opleverde */}
      <div className="lv-card lv-res" data-reveal>
        <div className="lv-res-title">{t("mockup.visuals.reach.resultTitle")}</div>
        <div className="lv-res-stats">
          <div className="lv-res-stat">
            <b>{t("mockup.visuals.reach.resultBookings")}</b>
            <span>{t("mockup.visuals.reach.resultBookingsLabel")}</span>
          </div>
          <div className="lv-res-stat">
            <b>{t("mockup.visuals.reach.resultCost")}</b>
            <span>{t("mockup.visuals.reach.resultCostLabel")}</span>
          </div>
          <div className="lv-res-stat">
            <b>{t("mockup.visuals.reach.resultOcc")}</b>
            <span>{t("mockup.visuals.reach.resultOccLabel")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
