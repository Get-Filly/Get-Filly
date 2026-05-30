// ============================================================
// Get-Filly bedrijfsgegevens, centrale config
// ============================================================
// Deze file bevat de bedrijfsgegevens van Get-Filly als SaaS-
// aanbieder zelf (NIET die van de restaurants/klanten, die
// staan in de `restaurants`-tabel). Wordt gebruikt op de
// publieke /privacy- en /voorwaarden-pagina's om de
// `[INVULLEN:...]`-placeholders te vervangen.
//
// **Wijzig dit éénmalig zodra de KvK-inschrijving rond is.**
// Zolang `legalName` + `kvk` leeg zijn, tonen de legal-pagina's
// automatisch de gele "concept, nog niet juridisch gereviewd"-
// banner én vallen alle nog niet ingevulde plekken terug op een
// duidelijke placeholder.
//
// Geen DB, geen env-vars: 1 plek aanpassen, 1 commit, klaar.
// ============================================================

export type CompanyInfo = {
  // Handelsnaam, gebruikt in marketing en titels. Mag al gevuld
  // zonder KvK-inschrijving.
  tradeName: string;

  // Volledige juridische naam (bv. "Get Filly B.V." of
  // "Floris Koevermans h.o.d.n. Get-Filly"). Verplicht op de
  // privacyverklaring zodra je klanten accepteert.
  legalName: string | null;

  // Bedrijfsvorm: "eenmanszaak" | "VOF" | "B.V." | etc.
  businessForm: string | null;

  // KvK-nummer (8 cijfers).
  kvk: string | null;

  // BTW-nummer (NL-format: NL123456789B01). Niet zichtbaar op
  // privacy-pagina, wel handig om hier centraal te hebben staan
  // voor toekomstig gebruik (footer, facturen, etc.).
  vatNumber: string | null;

  // Vestigingsadres, uitgesplitst zodat we 'm flexibel kunnen
  // formatteren (compleet adres OF alleen vestigingsplaats).
  addressStreet: string | null;
  addressPostcode: string | null;
  addressCity: string | null;

  // Telefoonnummer (zichtbaar op privacy- + voorwaarden-contact).
  phone: string | null;

  // Rechtbank die bij geschillen bevoegd is (algemene
  // voorwaarden art. 14). Default-keuze hangt vaak samen met de
  // vestigingsplaats, laat een jurist hier nog naar kijken.
  court: string | null;

  // Maximale aansprakelijkheid per kalenderjaar (algemene
  // voorwaarden art. 10). Vrij geformatteerde string (bv.
  // "€ 25.000") zodat we 'm 1-op-1 in de tekst kunnen plakken.
  liabilityCap: string | null;

  // Contact-e-mailadressen. Centraal hier zodat footer, privacy- en
  // voorwaarden-pagina's allemaal hetzelfde (werkende) adres tonen.
  // Nu alledrie hetzelfde werkende adres; zodra je aparte mailboxen/
  // aliassen instelt (privacy@, security@) kun je ze hier splitsen
  // zonder de pagina's aan te raken.
  email: string; // algemeen contact
  privacyEmail: string; // AVG-/privacy-verzoeken
  securityEmail: string; // security disclosures
};

export const COMPANY: CompanyInfo = {
  tradeName: "Get-Filly",
  legalName: "Get-Filly",
  businessForm: null,
  kvk: "42068177",
  vatNumber: null,
  addressStreet: "Saxen Weimarlaan 44-2",
  addressPostcode: "1075 CD",
  addressCity: "Amsterdam",
  phone: "+31 6 57737372",
  court: "Rechtbank Amsterdam",
  liabilityCap: "€ 25.000",
  // Eén werkend adres voor nu (administratie@get-filly.com). Splits
  // later in aparte aliassen als die mailboxen bestaan.
  email: "administratie@get-filly.com",
  privacyEmail: "administratie@get-filly.com",
  securityEmail: "administratie@get-filly.com",
};

// Bepaalt of de gele draft-banner op /privacy en /voorwaarden
// nog moet worden getoond. Twee minimum-velden: zonder KvK en
// legalName is de verklaring niet rechtsgeldig op te stellen,
// dus dan blijft de banner zichtbaar. Aanvullende velden mogen
// later worden ingevuld zonder dat de banner terugkomt.
export function isLegalDataComplete(c: CompanyInfo = COMPANY): boolean {
  return Boolean(c.legalName && c.kvk);
}

// Formatteert het adres als één leesbare regel. Returnt null
// als het adres nog niet (volledig) is ingevuld, pagina toont
// dan de placeholder.
export function formatFullAddress(c: CompanyInfo = COMPANY): string | null {
  if (!c.addressStreet || !c.addressPostcode || !c.addressCity) return null;
  return `${c.addressStreet}, ${c.addressPostcode} ${c.addressCity}`;
}

// Formatteert de identificatie-regel voor de algemene
// voorwaarden definitie-sectie: "Get Filly B.V. (KvK 12345678)".
// Returnt null zolang naam óf KvK ontbreekt.
export function formatLegalIdentifier(c: CompanyInfo = COMPANY): string | null {
  if (!c.legalName || !c.kvk) return null;
  return `${c.legalName} (KvK ${c.kvk})`;
}
