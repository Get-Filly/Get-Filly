import Link from "next/link";

// =============================================================================
// PRODUCT-PAGINA, 1-op-1 conversie van Claude Design app.jsx → ProductPage.
// =============================================================================

const features = [
  { title: "Bezettingsdashboard", desc: "Realtime inzicht in je bezettingsgraad per dag, week en maand. Kleurcodering laat direct zien waar je omzet mist." },
  { title: "AI-chatbot", desc: "Chat met Filly zoals je met een collega praat. Hij kent je data, doet voorstellen, en voert ze uit na jouw goedkeuring." },
  { title: "E-mailcampagnes", desc: "Van concept tot verzending in één chat. Filly schrijft de mail, selecteert de juiste gasten, en stuurt op het beste moment." },
  { title: "Social media posts", desc: "Filly maakt posts voor Instagram en Facebook. Afgestemd op je merk, je aanbod, en de dagen die gevuld moeten worden." },
  { title: "Seizoensstrategie", desc: "Valentijnsdag, Koningsdag, kerst, Filly denkt vooruit. Je krijgt automatisch voorstellen, weken van tevoren." },
  { title: "Koppelingen", desc: "Verbind met Zenchef, OpenTable, SevenRooms en andere platforms. Eenmalig instellen, daarna draait alles automatisch." },
];

export default function ProductPage() {
  return (
    <>
      <section className="product-hero">
        <div className="container">
          <p className="section-label">Product</p>
          <h1 className="section-title">Jouw AI marketing-assistent voor de horeca.</h1>
          <p className="section-subtitle">Get Filly combineert je reserveringsdata met AI om automatisch campagnes te draaien die lege stoelen vullen. Je chat, Filly doet de rest.</p>

          <div className="hero-diffs">
            <div className="hero-diff">
              <div className="hero-diff-num">01</div>
              <h3 className="hero-diff-title">AI d&oacute;et het werk. Jij keurt goed.</h3>
              <p className="hero-diff-desc">Andere tools assisteren. Filly schrijft, plant en verstuurt &mdash; jij klikt alleen op goedkeuren.</p>
            </div>
            <div className="hero-diff">
              <div className="hero-diff-num">02</div>
              <h3 className="hero-diff-title">Geen marketingkennis nodig.</h3>
              <p className="hero-diff-desc">Geen segmenten, geen A/B-tests, geen open-rates uitpluizen. Filly beslist wat werkt &mdash; jij ziet de uitkomst.</p>
            </div>
            <div className="hero-diff">
              <div className="hero-diff-num">03</div>
              <h3 className="hero-diff-title">Plakt op wat je al hebt.</h3>
              <p className="hero-diff-desc">Je reserveringsplatform, POS en socials houd je. Filly integreert in een paar klikken &mdash; geen overstap.</p>
            </div>
            <div className="hero-diff">
              <div className="hero-diff-num">04</div>
              <h3 className="hero-diff-title">Meet wat &eacute;cht werkt.</h3>
              <p className="hero-diff-desc">Geen open-rates of clicks &mdash; wel &lsquo;+12 reserveringen, &euro;540 omzet&rsquo;. Per campagne, in euro&rsquo;s.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="product-walkthrough">
        <div className="container">
          <p className="section-label">Hoe het werkt</p>
          <h2 className="section-title" style={{ maxWidth: 820 }}>Een week met Filly &mdash; van lege stoelen naar een volle onderneming.</h2>
          <p className="section-subtitle" style={{ maxWidth: 640 }}>Volg &eacute;&eacute;n campagne van begin tot eind. Drie minuten werk op maandag, twaalf extra reserveringen op vrijdag.</p>

          <div className="features-stack" style={{ marginTop: 56 }}>

            {/* STAP 1, Filly ziet de dip */}
            <div className="feature-row">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Maandag &middot; 09:14</p>
                <h3 className="feature-row-title">Filly ziet een dip die jij nog niet had opgemerkt.</h3>
                <p className="feature-row-desc">Filly kijkt continu naar je reserveringsdata. Een dinsdagavond op 38% is geen ramp &mdash; mits je het op tijd weet. Filly stuurt je &eacute;&eacute;n bericht: &ldquo;Dinsdag loopt achter, zal ik iets uitzetten?&rdquo;</p>
                <div className="walk-step">
                  <span className="walk-step-num">01</span>
                  <span className="walk-step-label">Detectie</span>
                </div>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-occ">
                  <div className="pmock-occ-head">
                    <div>
                      <div className="pmock-occ-eyebrow">BEZETTING &middot; KOMENDE 7 DAGEN</div>
                      <div className="pmock-occ-title">Week 47 &middot; vooruitblik</div>
                    </div>
                    <div className="pmock-occ-pill">Live</div>
                  </div>
                  <div className="pmock-occ-bars">
                    {[
                      { d: "ma", v: 78, ok: true },
                      { d: "di", v: 38, alert: true },
                      { d: "wo", v: 64, ok: true },
                      { d: "do", v: 71, ok: true },
                      { d: "vr", v: 92, ok: true },
                      { d: "za", v: 95, ok: true },
                      { d: "zo", v: 58, ok: true },
                    ].map((b) => (
                      <div key={b.d} className={`pmock-occ-bar ${b.alert ? "is-alert" : ""}`}>
                        <div className="pmock-occ-track">
                          <div className="pmock-occ-fill" style={{ height: `${b.v}%` }} />
                        </div>
                        <div className="pmock-occ-day">{b.d}</div>
                        <div className="pmock-occ-pct">{b.v}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="pmock-occ-alert">
                    <div className="pmock-occ-alert-dot" />
                    <div>
                      <div className="pmock-occ-alert-title">Dinsdag onder verwachting</div>
                      <div className="pmock-occ-alert-sub">Verwacht: 65% &middot; Nu: 38% &middot; 18 stoelen vrij</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STAP 2, Filly stelt drie kanalen voor */}
            <div className="feature-row feature-row--reverse">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Maandag &middot; 09:15</p>
                <h3 className="feature-row-title">Drie kanalen, &eacute;&eacute;n voorstel &mdash; klaar binnen een minuut.</h3>
                <p className="feature-row-desc">Filly stelt een complete campagne voor: een e-mail aan vaste gasten, een Instagram-post voor laat-boekers, en een WhatsApp-bericht voor je trouwste klanten. Tone-of-voice, beeld en timing &mdash; alles afgestemd op je onderneming.</p>
                <div className="walk-step">
                  <span className="walk-step-num">02</span>
                  <span className="walk-step-label">Voorstel</span>
                </div>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-channels">
                  <div className="pmock-channels-head">
                    <span className="pmock-f-badge">F</span>
                    <span className="pmock-channels-title">Filly stelt voor &mdash; 3 kanalen</span>
                  </div>
                  <div className="pmock-channels-list">
                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--mail">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">E-mail &middot; 412 ontvangers</div>
                        <div className="pmock-ch-preview">&ldquo;Een rustige dinsdag? Kom lunchen voor &euro;24,50.&rdquo;</div>
                      </div>
                      <div className="pmock-ch-meta">di 11:00</div>
                    </div>

                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--ig">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="5" />
                          <circle cx="12" cy="12" r="4" />
                          <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">Instagram &middot; feed &amp; story</div>
                        <div className="pmock-ch-preview">Terras-foto &middot; &ldquo;Dinsdag-deal: 3 gangen voor &euro;24,50&rdquo;</div>
                      </div>
                      <div className="pmock-ch-meta">ma 17:00</div>
                    </div>

                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--wa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 17 0z" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">WhatsApp &middot; top 40 vaste gasten</div>
                        <div className="pmock-ch-preview">&ldquo;Hoi! Morgen nog plek aan onze keukentafel &mdash; reserveer hier.&rdquo;</div>
                      </div>
                      <div className="pmock-ch-meta">di 09:30</div>
                    </div>
                  </div>
                  <button className="pmock-channels-cta" type="button">
                    Goedkeuren &amp; versturen
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* STAP 3, Eén klik */}
            <div className="feature-row">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Maandag &middot; 09:16</p>
                <h3 className="feature-row-title">Eén klik &mdash; en alle drie de berichten staan klaar.</h3>
                <p className="feature-row-desc">Geen toolswitchen, geen agenda&rsquo;s plannen, geen exports importeren. Filly verstuurt en plant alles in tegelijk. Je houdt &eacute;&eacute;n contactmoment per campagne &mdash; precies wat je nu ook al doet, alleen sneller.</p>
                <div className="walk-step">
                  <span className="walk-step-num">03</span>
                  <span className="walk-step-label">Goedkeuring</span>
                </div>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-approve">
                  <div className="pmock-approve-banner">
                    <div className="pmock-approve-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div>
                      <div className="pmock-approve-title">Campagne ingepland</div>
                      <div className="pmock-approve-sub">Goedgekeurd door Sophie &middot; 09:16</div>
                    </div>
                  </div>
                  <div className="pmock-approve-list">
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-done" />
                      <div className="pmock-approve-row-label">E-mail naar 412 vaste gasten</div>
                      <div className="pmock-approve-row-meta">di 11:00</div>
                    </div>
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-done" />
                      <div className="pmock-approve-row-label">Instagram-post + story</div>
                      <div className="pmock-approve-row-meta">ma 17:00</div>
                    </div>
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-pending" />
                      <div className="pmock-approve-row-label">WhatsApp naar top 40</div>
                      <div className="pmock-approve-row-meta">di 09:30</div>
                    </div>
                  </div>
                  <div className="pmock-approve-foot">
                    <span>Filly meldt zich vrijdag met de resultaten.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* STAP 4, Resultaat */}
            <div className="feature-row feature-row--reverse">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Vrijdag &middot; 23:00</p>
                <h3 className="feature-row-title">Resultaat: 12 extra reserveringen, &euro;540 omzet.</h3>
                <p className="feature-row-desc">Filly meldt zich aan het einde van de week met een korte samenvatting: wat heeft gewerkt, welk kanaal heeft gescoord, en wat ze volgende keer anders zou doen. Geen dashboards uitpluizen &mdash; gewoon &eacute;&eacute;n bericht.</p>
                <div className="walk-step">
                  <span className="walk-step-num">04</span>
                  <span className="walk-step-label">Resultaat</span>
                </div>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-result">
                  <div className="pmock-result-head">
                    <div className="pmock-result-eyebrow">DINSDAG-CAMPAGNE &middot; AFGEROND</div>
                    <div className="pmock-result-headline">Dinsdagavond &mdash; van 38% naar 84%</div>
                  </div>
                  <div className="pmock-result-stats">
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num">+12</div>
                      <div className="pmock-result-stat-label">extra reserveringen</div>
                    </div>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num">&euro;540</div>
                      <div className="pmock-result-stat-label">extra omzet</div>
                    </div>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num">84%</div>
                      <div className="pmock-result-stat-label">eindbezetting</div>
                    </div>
                  </div>
                  <div className="pmock-result-breakdown">
                    <div className="pmock-result-breakdown-title">Per kanaal</div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">E-mail</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "58%" }} /></div>
                      <div className="pmock-result-bar-val">7 res.</div>
                    </div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">Instagram</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "33%" }} /></div>
                      <div className="pmock-result-bar-val">4 res.</div>
                    </div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">WhatsApp</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "9%" }} /></div>
                      <div className="pmock-result-bar-val">1 res.</div>
                    </div>
                  </div>
                  <div className="pmock-result-note">
                    <span className="pmock-f-badge">F</span>
                    <span>E-mail werkte het best &mdash; volgende keer schaal ik die als eerste op.</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className="product-features">
        <div className="container">
          <p className="section-label">Alle functies</p>
          <h2 className="section-title">Wat zit er in.</h2>
          <div className="product-features-list">
            {features.map((f, i) => (
              <div key={f.title} className="hero-diff">
                <div className="hero-diff-num">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="hero-diff-title">{f.title}</h3>
                <p className="hero-diff-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">Klaar om je onderneming voller te krijgen?</h2>
        <p className="section-subtitle">Vraag een demo aan en ontdek wat Get-Filly voor jouw onderneming kan doen.</p>
        <Link className="cta-btn" href="/pricing">Vraag een demo aan</Link>
      </section>
    </>
  );
}
