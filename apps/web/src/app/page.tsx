import Link from "next/link";
import { VindbaarheidVisualizer } from "../components/vindbaarheid-visualizer";
import { ZichtbaarheidVisualizer } from "../components/zichtbaarheid-visualizer";
import { ScrollReveal } from "@/components/scroll-reveal";

// =============================================================================
// HOMEPAGE, 1-op-1 conversie van het Claude Design-prototype.
// Bron: Desktop/Website Get-Filly/app.jsx → HomePage + MiniDashboard.
//
// Vertaalslag JSX → Next.js TSX:
//   - <button onClick={setPage}>  → <Link href>
//   - t.heroTitle1 etc.           → letterlijke string uit TWEAK_DEFAULTS
//   - "images/..." paths          → "/images/..." (leading slash voor /public)
//   - className-attribuut blijft identiek
//   - inline style={{...}} blijft 1-op-1 overgenomen (ook als ze redundant
//     lijken, design is leidend, geen "verbeteringen")
// =============================================================================

// =============================================================================
// MiniDashboard, visuele namaak van het echte Filly-dashboard,
// gerenderd binnen het MacBook-scherm in de hero.
// =============================================================================
function MiniDashboard() {
  const NAV = [
    { icon: "📊", label: "Dashboard", active: true },
    { icon: "📣", label: "Campagnes" },
    { icon: "📆", label: "Reserveringen" },
    { icon: "👥", label: "Gasten" },
    { icon: "⭐", label: "Reviews" },
    { icon: "🍽️", label: "Menu" },
    { icon: "📈", label: "Rapportages" },
    { icon: "🔗", label: "Koppelingen" },
  ];

  const KPIS = [
    { label: "Bezetting vandaag", val: "82%" },
    { label: "Bezetting april", val: "74%", extra: "12% via Filly", positive: true },
    { label: "Gasten april", val: "1.248", extra: "+184 via Filly", positive: true },
    { label: "Voorgesteld", val: "3", extra: "wachten op je" },
    { label: "Omzet april", val: "€48.6k", extra: "+€6.4k via Filly", positive: true },
  ];

  type CalCell = { d: number; p: number; lvl: number; today?: boolean } | null;
  const CAL: CalCell[][] = [
    [null, null, { d: 1, p: 62, lvl: 1 }, { d: 2, p: 71, lvl: 2 }, { d: 3, p: 88, lvl: 3 }, { d: 4, p: 96, lvl: 4 }, { d: 5, p: 92, lvl: 3 }],
    [{ d: 6, p: 58, lvl: 1 }, { d: 7, p: 64, lvl: 1 }, { d: 8, p: 70, lvl: 2 }, { d: 9, p: 38, lvl: 0 }, { d: 10, p: 84, lvl: 3 }, { d: 11, p: 98, lvl: 4 }, { d: 12, p: 95, lvl: 4 }],
    [{ d: 13, p: 60, lvl: 1 }, { d: 14, p: 67, lvl: 2 }, { d: 15, p: 72, lvl: 2 }, { d: 16, p: 82, lvl: 3, today: true }, { d: 17, p: 78, lvl: 2 }, { d: 18, p: 96, lvl: 4 }, { d: 19, p: 91, lvl: 3 }],
    [{ d: 20, p: 55, lvl: 1 }, { d: 21, p: 42, lvl: 0 }, { d: 22, p: 68, lvl: 2 }, { d: 23, p: 74, lvl: 2 }, { d: 24, p: 86, lvl: 3 }, { d: 25, p: 99, lvl: 4 }, { d: 26, p: 94, lvl: 3 }],
    [{ d: 27, p: 64, lvl: 1 }, { d: 28, p: 70, lvl: 2 }, { d: 29, p: 76, lvl: 2 }, { d: 30, p: 80, lvl: 3 }, null, null, null],
  ];

  return (
    <div className="mini-dash">
      {/* Sidebar */}
      <aside className="md-sidebar">
        <div className="md-workspace">
          <div className="md-avatar">BG</div>
          <div style={{ minWidth: 0 }}>
            <div className="md-ws-name">Bistro Get-Filly</div>
            <div className="md-ws-role">Eigenaar</div>
          </div>
        </div>
        <div>
          <div className="md-section-label">Menu</div>
          <div className="md-nav">
            {NAV.map((n) => (
              <div key={n.label} className={`md-nav-item ${n.active ? "active" : ""}`}>
                <span className="md-nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md-main">
        <div className="md-topbar">
          <div>
            <div className="md-page-title">Dashboard</div>
            <div className="md-page-sub">Woensdag 16 april · Filly draait 3 campagnes</div>
          </div>
          <div className="md-pill">Filly maak voorstellen</div>
        </div>

        <div className="md-kpi-row">
          {KPIS.map((k) => (
            <div key={k.label} className="md-kpi">
              <div className="md-kpi-label">{k.label}</div>
              <div className="md-kpi-val">{k.val}</div>
              {k.extra && <div className={`md-kpi-extra ${k.positive ? "positive" : ""}`}>{k.extra}</div>}
            </div>
          ))}
        </div>

        <div className="md-body">
          {/* Calendar */}
          <div className="md-card">
            <div className="md-card-head">
              <div>
                <div className="md-card-title">Bezettingsgraad</div>
                <div className="md-card-sub">April 2026</div>
              </div>
              <div className="md-tabs">
                <span className="md-tab">Dag</span>
                <span className="md-tab active">Maand</span>
                <span className="md-tab">Jaar</span>
              </div>
            </div>
            <div className="md-cal">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
                <div key={d} className="md-cal-dow">{d}</div>
              ))}
              {CAL.flat().map((cell, i) => {
                if (!cell) return <div key={i} className="md-cal-day empty"></div>;
                return (
                  <div key={i} className={`md-cal-day lvl-${cell.lvl} ${cell.today ? "today" : ""}`}>
                    <span>{cell.d}</span>
                    <span className="md-cal-pct">{cell.p}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filly chat */}
          <div className="md-chat">
            <div className="md-chat-head">
              <div className="md-chat-avatar"></div>
              <div className="md-chat-name">Filly</div>
              <div className="md-chat-status">online</div>
            </div>
            <div className="md-chat-body">
              <div className="md-chat-msg ai">
                Donderdag 9 april zit op 38%. Zal ik een lunchactie mailen naar je vaste gasten?
              </div>
              <div className="md-chat-proposal">
                <div className="md-prop-title">Lunchactie · 3-gangen €24,50</div>
                <div className="md-prop-meta">E-mail · 248 ontvangers · verzending donderdag 11:00</div>
                <div className="md-prop-actions">
                  <span className="md-prop-btn primary">Goedkeuren</span>
                  <span className="md-prop-btn">Bekijk versies →</span>
                </div>
              </div>
              <div className="md-chat-msg user">Verstuur naar 248 gasten</div>
              <div className="md-chat-msg ai">Top. Verstuurd naar 248 gasten ✓</div>
            </div>
            <div className="md-chat-input">
              <div className="md-chat-input-text">Stel Filly een vraag…</div>
              <div className="md-chat-send">↑</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1 className="section-title fade-up d1">
            Meer gasten.<br />Minder lege momenten.
          </h1>
          <p className="section-subtitle fade-up d2">
            Get-Filly analyseert de restaurant bezetting, herkent kansen en stelt campagnes voor die lege tafels vullen. Met jouw goedkeuring wordt de uiting gedaan via het juiste kanaal, op het moment dat ze de meeste reserveringen genereren.
          </p>
          <div className="hero-cta fade-up d3">
            <Link href="/contact" className="btn-primary">Vraag een demo</Link>
            <Link href="/product" className="btn-secondary">Bekijk het product →</Link>
          </div>

          <div className="hero-mockup fade-up d4">
            <div className="mac-lid">
              <div className="mac-camera"></div>
              <div className="mac-screen">
                <MiniDashboard />
              </div>
            </div>
            <div className="mac-base"></div>
          </div>
        </div>
      </section>

      <section id="hoe-het-werkt" className="features">
        <div className="container">
          {/* Per 2026-05-13: sectie herschreven naar 3 pijlers
              (Vindbaarheid / Zichtbaarheid / Bereikbaarheid) i.p.v.
              de tijd-as (Vandaag / Deze week / Seizoenen). De mockups
              op de visual-plek blijven voor nu; Floris vervangt
              foto's later met pijler-specifieke beelden (bv. Google-
              Maps listing voor Vindbaarheid). */}
          <h2 className="section-title">Meer gasten.<br />Volle tafels. Automatisch.</h2>
          <div className="features-stack">
            {/* Scroll-reveal: laat de pijlers één voor één oppoppen. */}
            <ScrollReveal />
            {/* Pijler 1 — Vindbaarheid (Google/SEO/AI-zoekmachines).
                Visual: Get-Filly-platform-mind-map (integraties met
                Google Business, Tripadvisor, TheFork, OpenTable,
                Kaarten, ChatGPT, Claude, Gemini). Per 2026-05-13
                op verzoek van Floris vervangt deze de oude
                Instagram-mockup. */}
            <div className="feature-row feature-row--split">
              <div className="feature-row-text feature-row-text--card" data-reveal>
                <p className="feature-eyebrow feature-eyebrow--pill">
                  <span className="feature-eyebrow-num">01</span>
                  <span>Vindbaarheid</span>
                </p>
                <h3 className="feature-row-title">Gevonden worden begint hier.</h3>
                <p className="feature-row-desc">Gasten zoeken online voordat ze reserveren. Wij zorgen dat jouw restaurant bovenaan staat in zoekmachines.</p>
                <ul className="feature-bullets">
                  <li>Google Business altijd up-to-date met actuele tijden, foto&rsquo;s en beschrijving</li>
                  <li>Reviews automatisch beantwoord in de tone-of-voice van het restaurant</li>
                  <li>SEO zodat je gevonden wordt op zoekopdrachten in jouw buurt</li>
                  <li>GEO-optimalisatie voor AI-zoekmachines zoals ChatGPT, Claude en Gemini</li>
                  <li>Zoekwoordstrategie afgestemd op jouw type restaurant en locatie</li>
                  <li>Live dashboard met rapportage over jouw zichtbaarheid in zoekmachines</li>
                </ul>
              </div>
              <div className="feature-row-visual feature-row-visual--card">
                {/* Geanimeerde Get-Filly hub die cyclisch verbinding
                    maakt met de 8 zoek/AI-platforms. Letter-cirkels
                    zijn placeholder; latere fase kan ze door echte
                    SVG-brand-logos vervangen. */}
                <VindbaarheidVisualizer />
              </div>
            </div>

            {/* Pijler 2 — Zichtbaarheid (social media, content,
                white-label). Per 2026-05-21: tekst en visual
                staan nu elk in een eigen --card (zelfde patroon
                als pijler 1) + de visual is een dynamische
                hybride HTML+SVG-component met platform-mini-
                cards die sequentieel popen + groene content-
                pulsen vanaf Filly. */}
            <div className="feature-row feature-row--reverse feature-row--split">
              <div className="feature-row-text feature-row-text--card" data-reveal>
                <p className="feature-eyebrow feature-eyebrow--pill">
                  <span className="feature-eyebrow-num">02</span>
                  <span>Zichtbaarheid</span>
                </p>
                <h3 className="feature-row-title">Blijf in beeld. Ook als ze niet reserveren.</h3>
                <p className="feature-row-desc">Gasten die jou kennen maar nog niet hebben gereserveerd, heb je nodig op stille avonden. Wij zorgen dat jij top of mind blijft via sociale media, automatisch en in jouw stijl.</p>
                <ul className="feature-bullets">
                  <li>Automatische contentplanning voor Instagram en Facebook op basis van jouw bezettingsdata</li>
                  <li>AI-gegenereerde content volledig in de stijl en toon van jouw restaurant</li>
                  <li>Strategische timing gebaseerd op data, meer zichtbaarheid op dagen dat het rustig is</li>
                  <li>Suggesties voor stories en reels afgestemd op jouw regio en doelgroep</li>
                  <li>Alles white-label, gasten zien jouw naam, niet die van ons</li>
                  <li>Jij keurt elk bericht goed voordat het verstuurd wordt</li>
                  <li>Live dashboard rapportage over bereik, engagement en doorkliks</li>
                </ul>
              </div>
              <div className="feature-row-visual feature-row-visual--card">
                <ZichtbaarheidVisualizer />
              </div>
            </div>

            {/* Pijler 3 — Bereikbaarheid (e-mail, WhatsApp,
                segmentatie). Per 2026-05-21: tekst + visual nu in
                hetzelfde --split-patroon als pijler 1 + 2 zodat
                alle 3 pijlers visueel consistent zijn. */}
            <div className="feature-row feature-row--split">
              <div className="feature-row-text feature-row-text--card" data-reveal>
                <p className="feature-eyebrow feature-eyebrow--pill">
                  <span className="feature-eyebrow-num">03</span>
                  <span>Bereikbaarheid</span>
                </p>
                <h3 className="feature-row-title">De juiste boodschap. Op het juiste moment. Bij de juiste gast.</h3>
                <p className="feature-row-desc">Jouw bestaande gasten zijn de makkelijkste manier om lege tafels te vullen. Wij bereiken hen automatisch via e-mail en WhatsApp op het moment dat jouw bezetting het nodig heeft.</p>
                <ul className="feature-bullets">
                  <li>Automatische e-mailcampagnes op basis van real-time bezettingsdata</li>
                  <li>WhatsApp-campagnes met hoge openratio voor last-minute reserveringen</li>
                  <li>Gepersonaliseerde berichten in de tone-of-voice van het restaurant</li>
                  <li>Segmentatie op vaste gasten, nieuwe gasten en slapende gasten</li>
                  <li>Jij keurt elk bericht goed voordat het verstuurd wordt</li>
                </ul>
              </div>
              <div className="feature-row-visual feature-row-visual--card">
                <div className="fmock-email">
                  <div className="fmock-email-header">
                    <div className="fmock-email-meta">
                      <div className="fmock-email-from">Bistro Get-Filly</div>
                      <div className="fmock-email-time" style={{ color: "rgb(82, 82, 91)" }}>vandaag · 10:14</div>
                    </div>
                    <div className="fmock-email-subject">We hebben je al een tijdje niet gezien, kom weer eens langs</div>
                    <div className="fmock-email-to" style={{ color: "rgb(82, 82, 91)" }}>aan: marieke@voorbeeld.nl</div>
                  </div>
                  <div className="fmock-email-body">
                    Hé Marieke,<br /><br />
                    Het is alweer ruim drie maanden geleden dat we je voor het laatst aan tafel zagen. We zouden het leuk vinden om je weer te zien.<br /><br />
                    Als welkom-terug bieden we je <strong>een glas wijn van het huis</strong> aan bij je volgende bezoek.
                  </div>
                  <div className="fmock-email-cta" style={{ fontSize: "10px" }}>Reserveer mijn tafel</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Afsluitende CTA. Per 2026-05-30 omgezet van de ingesloten
          .pillars-cta-kaart naar de full-bleed groene .cta-section,
          identiek aan de product- en over-pagina (eigen tekst). */}
      <section className="cta-section">
        <h2 className="section-title">Klaar om jouw tafels te vullen?</h2>
        <p className="section-subtitle">Vraag een demo aan en ontdek wat Get-Filly voor jouw onderneming kan doen.</p>
        <Link href="/contact" className="cta-btn">Plan een gratis kennismaking</Link>
      </section>

      {/* Footer-CTA-sectie verwijderd per 2026-05-13. De pijlers-
          CTA hierboven (groene "Plan een gratis kennismaking"-blok
          direct na de drie pijlers) is nu de enige homepage-CTA.
          Eén consistent actie-blok i.p.v. twee verschillende
          knoppen ("Plan kennismaking" vs "Vraag demo aan"). */}
    </>
  );
}
