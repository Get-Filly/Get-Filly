// =============================================================================
// ABOUT-PAGINA. Doorlopend wit + groene waas (geen scheiding) t/m "Wat ons
// drijft"; daarna "Waar we staan" (papier-warm) + CTA. (2026-06-13)
// =============================================================================

import Link from "next/link";
import { COMPANY } from "@/config/company";
import { ScrollReveal } from "@/components/scroll-reveal";
import { pageMetadata } from "@/config/seo";

// Stijl voor contextuele links in de groene cta-section (witte tekst,
// dus link = wit + onderstreept zodat 'ie opvalt op de groene achtergrond).
const inlineLink: React.CSSProperties = {
  color: "#FFFFFF",
  textDecoration: "underline",
};

export const metadata = pageMetadata({
  title: "Over ons",
  description:
    "Get-Filly is opgericht door twee ondernemers met één missie: horeca helpen rustige momenten om te zetten in omzet, zonder uren of grote marketingbudgetten.",
  path: "/about",
});

const missionPillars = [
  { title: "Ondernemer eerst", desc: "De ondernemer hoeft geen uren te besteden aan marketing of website-optimalisatie. Get-Filly doet het werk, jij richt je op de gasten en dienstverlening." },
  { title: "Eigen data, eigen keuzes", desc: "Jouw bezettingsdata en gastenlijst blijven van jou. Geen doorverkoop, je zit nergens aan vast, alles te exporteren." },
  { title: "AI die zichzelf terugverdient", desc: "Geen AI om de AI. We zetten jouw data in voor extra reserveringen en meer omzet." },
];

export default function AboutPage() {
  return (
    <>
      {/* Scroll-reveal: laat de items één voor één oppoppen. */}
      <ScrollReveal />

      {/* Eén doorlopend blok (wit + groene waas), zonder scheiding tussen de
          onderdelen. Tot en met "Wat ons drijft". */}
      <div className="about-top">
        {/* ---------- Hero ---------- */}
        <section className="about-intro">
          <div className="container">
            <h1 className="section-title">Van idee naar impact.</h1>
            <p className="section-subtitle" style={{ marginTop: 18, maxWidth: 640 }}>
              Get-Filly is opgericht door twee ondernemers met één missie: meer gasten aan tafel, zonder dat marketing je tijd of budget opslokt.
            </p>
          </div>
        </section>

        {/* ---------- Ons verhaal (geen aparte kop) ---------- */}
        <section className="about-story">
          <div className="container">
            {/* Lead + body springen samen op via de site-brede [data-reveal]
                (1.5s, zodra in beeld): zelfde snelheid + trigger als elders. */}
            <div data-reveal>
              <p className="about-story-lead">
                Het beste restaurant zit niet altijd vol. De best vindbare wel.
              </p>
              <div className="about-story-body">
                <p>
                  Dat zagen we overal: zaken met fantastisch eten en trouwe gasten, en toch lege tafels. Niet omdat ze iets fout deden, maar omdat marketing een vak apart is geworden. Een vak waar je een duur bureau voor nodig hebt, of jouw tijd en aandacht die je liever in je gasten steekt.
                </p>
                <p>
                  En de tools die dat zouden moeten oplossen? Die zijn gebouwd voor ketens met een marketingafdeling. Niet voor de ondernemer die z'n zaak op z'n eigen manier wil laten groeien.
                </p>
                <p>
                  Daar maakten we een einde aan. Get-Filly neemt het marketingwerk over, werkt op jouw eigen data en komt zelf met voorstellen. Jij hoeft alleen ja te zeggen. Geen loze beloftes, geen jargon. Gewoon meer gasten aan tafel.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Missie & visie als kaarten (geen aparte kop) ---------- */}
        <section className="about-mv-section">
          <div className="container">
            <div className="about-mv">
              <div className="about-mv-card" data-reveal>
                <p className="about-mv-label">Missie</p>
                <p className="about-mv-text">
                  Onafhankelijke restaurants laten groeien zonder dat de ondernemer verdrinkt in marketing. We nemen het werk uit handen, zodat jij je kunt richten op waar je goed in bent: je zaak en je gasten.
                </p>
              </div>
              <div className="about-mv-card" data-reveal>
                <p className="about-mv-label">Visie</p>
                <p className="about-mv-text">
                  Een horecawereld waarin elk lokaal restaurant dezelfde marketingkracht heeft als een grote keten. Zonder marketingafdeling, zonder duur bureau, en zonder dat je verstand van techniek nodig hebt.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Wat ons drijft ---------- */}
        <section className="about-drive">
          <div className="container">
            <h2 className="section-title">Wat ons drijft.</h2>

            {/* Hergebruikt dezelfde "hero-diff"-strip als op de product- en
                pricing-pagina: 3-koloms, dunne scheidingslijn bovenaan, geen
                card-achtergrond. Scroll-reveal (data-reveal). */}
            <div className="product-features-list">
              {missionPillars.map((p) => (
                <div key={p.title} className="hero-diff" data-reveal>
                  <h3 className="hero-diff-title">{p.title}</h3>
                  <p className="hero-diff-desc">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="about-journey">
        <div className="container">
          <h2 className="section-title">Waar we staan.</h2>

          <ol className="zig-timeline">
            <li className="zig-item zig-left active">
              <div className="zig-card" data-reveal>
                <div className="zig-card-badge">Nu</div>
                <h3 className="zig-card-title">Hoofdstuk 1, Founded</h3>
                <ul className="zig-card-list">
                  <li>Get-Filly opgericht door twee ambitieuze vrienden</li>
                  <li>MVP live</li>
                  <li>Eerste klanten aan boord</li>
                </ul>
              </div>
              <div className="zig-marker"><span>2026</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2027</span></div>
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">Hoofdstuk 2, Eerste 100 klanten</h3>
                <ul className="zig-card-list">
                  <li>Get-Filly nationaal uitrollen in heel Nederland</li>
                </ul>
              </div>
            </li>

            <li className="zig-item zig-left">
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">Hoofdstuk 3, Internationale uitrol</h3>
                <ul className="zig-card-list">
                  <li>Eerst BeNeLux, daarna DACH-regio</li>
                  <li>Lokale teams, lokale data</li>
                </ul>
              </div>
              <div className="zig-marker"><span>2028</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2029</span></div>
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">Hoofdstuk 4</h3>
                <ul className="zig-card-list">
                  <li>Wordt vervolgd&hellip;</li>
                </ul>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">Laten we kennismaken.</h2>
        <p className="section-subtitle">Vragen over Get-Filly, samenwerken of sparren over je marketing? Stuur een mail, we reageren snel.</p>
        <a href={`mailto:${COMPANY.email}`} className="cta-btn">{COMPANY.email}</a>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          Liever eerst rondkijken? Bekijk{" "}
          <Link href="/product" style={inlineLink}>onze oplossing voor restaurants</Link>{" "}
          of <Link href="/pricing" style={inlineLink}>de prijzen</Link>.
        </p>
      </section>
    </>
  );
}
