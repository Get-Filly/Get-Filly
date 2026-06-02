// ============================================================
// Landing-visuals — statische product-mockups per homepage-pijler.
// Concrete "product-momenten" i.p.v. abstracte hub-diagrammen.
// De pop-in loopt via het site-brede `data-reveal` + <ScrollReveal/>
// (gemount in page.tsx): elk item komt 1× omhoog-faden zodra het in
// beeld scrollt, identiek aan de rest van de pagina. Geen eigen hook.
// ============================================================

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
export function VindbaarheidVisual() {
  return (
    <div className="lv lv-find" aria-hidden="true">
      {/* Klassiek zoekresultaat met echte zoekbalk (SEO) */}
      <div className="lv-card lv-search" data-reveal>
        <span className="lv-rank">
          <Logo id="google" size={13} /> #1
        </span>
        <div className="lv-searchbar">
          <SearchIcon />
          <span>restaurant Haarlem reserveren</span>
        </div>
        <div className="lv-result">
          <div className="lv-result-name">Bistro Get-Filly</div>
          <div className="lv-result-url">bistrogetfilly.nl &rsaquo; reserveren</div>
          <div className="lv-result-meta">
            <b>&#9733; 4,8</b> (320) &middot; Italiaans &middot; &euro;&euro; &middot; Nu open
          </div>
        </div>
      </div>

      {/* AI-zoekmachine als chatgesprek (GEO) */}
      <div className="lv-card lv-chat" data-reveal>
        <div className="lv-chat-head">
          <Logo id="chatgpt" size={16} /> AI-zoekmachine
        </div>
        <div className="lv-chat-q">Waar kan ik in Haarlem lekker uit eten voor een verjaardag?</div>
        <div className="lv-chat-a">
          <span className="lv-chat-ava"><Logo id="chatgpt" size={15} /></span>
          <span className="lv-chat-bubble">
            Een mooie keuze is <b>Bistro Get-Filly</b>, sfeervol, met uitstekende
            reviews (4,8&#9733;) en ruimte voor groepen. Je kunt direct online reserveren.
          </span>
        </div>
      </div>

      {/* Review als echte review-kaart (met eigenaar-antwoord) */}
      <div className="lv-card lv-rev" data-reveal>
        <div className="lv-rev-head">
          <Logo id="tripadvisor" size={16} /> Tripadvisor-review
        </div>
        <div className="lv-rev-top">
          <span className="lv-avatar">S</span>
          <div>
            <div className="lv-rev-name">Sophie M.</div>
            <div className="lv-rev-date">2 dagen geleden</div>
          </div>
          <span className="lv-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
        </div>
        <div className="lv-rev-q">
          &ldquo;Geweldige avond gehad, het eten was top en de service heel attent.&rdquo;
        </div>
        <div className="lv-rev-reply">
          <div className="lv-rev-reply-from">Bistro Get-Filly &middot; eigenaar</div>
          <div className="lv-rev-reply-txt">Wat fijn om te horen, Sophie! Tot snel weer. &#128075;</div>
        </div>
      </div>
    </div>
  );
}

// === 02 Zichtbaarheid: overlappende social-posts (cascade, alle bijschriften zichtbaar) ===
export function ZichtbaarheidVisual() {
  // Footer (logo + naam + bijschrift) staat ONDER de foto. In de cascade
  // (zie landing-visuals.css) dekt de voorste kaart alleen de foto-bovenkant
  // van de kaart erachter af, zodat elke footer er onderlangs uitsteekt en
  // je per kanaal het logo + de volledige tekst leest. Likes/weergaves zijn
  // bewust weggelaten (alleen de tekst telt).
  return (
    <div className="lv lv-social" aria-hidden="true">
      {/* Facebook — achterste/onderste, popt als eerste op (foto: pasta) */}
      <div className="lv-post-slot lv-post-1" data-reveal>
        <article className="lv-post">
          <div className="lv-post-media lv-media-fb">
            <img src="/visuals/facebook.jpg" alt="" loading="lazy" />
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-by">
              <span className="lv-post-ic"><Logo id="facebook" size={16} /></span>
              <span className="lv-post-name">Bistro Get-Filly</span>
            </div>
            <div className="lv-post-cap">Verse pasta, elke dag huisgemaakt &#127837;</div>
          </div>
        </article>
      </div>

      {/* TikTok — midden (foto: wokpan) */}
      <div className="lv-post-slot lv-post-2" data-reveal>
        <article className="lv-post">
          <div className="lv-post-media lv-media-tt">
            <img src="/visuals/tiktok.jpg" alt="" loading="lazy" />
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-by">
              <span className="lv-post-ic"><Logo id="tiktok" size={16} /></span>
              <span className="lv-post-name">@bistrogetfilly</span>
            </div>
            <div className="lv-post-cap">Achter de schermen in de keuken &#128293;</div>
          </div>
        </article>
      </div>

      {/* Instagram — voorste, bovenop (foto: sfeer/ambiance) */}
      <div className="lv-post-slot lv-post-3" data-reveal>
        <article className="lv-post">
          <div className="lv-post-media lv-media-ig">
            <img src="/visuals/instagram.jpg" alt="" loading="lazy" />
          </div>
          <div className="lv-post-foot">
            <div className="lv-post-by">
              <span className="lv-post-ic"><Logo id="instagram" size={16} /></span>
              <span className="lv-post-name">bistro_getfilly</span>
            </div>
            <div className="lv-post-cap">Donderdag livemuziek &#127926; Reserveer op tijd!</div>
          </div>
        </article>
      </div>
    </div>
  );
}

// === 03 Bereikbaarheid: mail + WhatsApp ===
export function BereikbaarheidVisual() {
  return (
    <div className="lv lv-reach" aria-hidden="true">
      {/* E-mailcampagne */}
      <div className="lv-card lv-mail" data-reveal>
        <div className="lv-mail-top">
          <span className="lv-mail-av">B</span>
          <div className="lv-mail-meta">
            <div className="lv-mail-from">Bistro Get-Filly</div>
            <div className="lv-mail-addr">reserveren@bistrogetfilly.nl</div>
          </div>
          <span className="lv-mail-time">10:14</span>
        </div>
        <div className="lv-mail-subj">We zien je graag weer, deze week nog een tafel vrij?</div>
        <div className="lv-mail-body">
          Hoi Marieke, het is alweer even geleden! Donderdag hebben we nog een mooi
          plekje vrij. Als welkom terug trakteren we op een glas wijn van het huis. &#127863;
        </div>
        <span className="lv-mail-cta">Reserveer mijn tafel</span>
      </div>

      {/* WhatsApp-gesprek (zonder dubbele vinkjes) */}
      <div className="lv-wa-phone" data-reveal>
        <div className="lv-wa-bar">
          <span className="lv-wa-av">B</span>
          <div className="lv-wa-contact">
            <div className="lv-wa-name">Bistro Get-Filly</div>
            <div className="lv-wa-online">online</div>
          </div>
        </div>
        <div className="lv-wa-chat">
          <div className="lv-wa-bubble lv-wa-in">
            Hoi Marieke! Donderdag om 19:00 nog een tafeltje vrij, kom je langs? &#127837;
            <span className="lv-wa-meta">10:15</span>
          </div>
          <div className="lv-wa-bubble lv-wa-out">
            Ja leuk! Doe maar voor 2 personen &#128522;
            <span className="lv-wa-meta">10:18</span>
          </div>
        </div>
      </div>
    </div>
  );
}
