# Losse HTML-prototypes (2026)

Deze zes bestanden stonden buiten de repo, in `~/Projects/get-filly-proto/`, en
dus buiten versiebeheer. Ze zijn hierheen verplaatst zodat ze een geschiedenis
hebben; de originele map is daarna opgeruimd.

Het zijn zelfstandige HTML-pagina's: openen in een browser, verder niets nodig.
Ze zijn gemaakt om een ontwerp te kunnen laten zien zonder in te loggen.

| Bestand | Datum | Wat het was | Waar het nu zit |
|---|---|---|---|
| `index.html` | jun 2026 | eerste dashboard-schets | opgegaan in het dashboard |
| `rustige-momenten.html` | jul 2026 | kansen per dagdeel | `/proto-kansen`, en live op het dashboard |
| `dashboard-v3.html` | sep 2026 | staafgrafiek-variant | niet gekozen |
| `dashboard-v2b.html` | sep 2026 | tussenvariant | niet gekozen |
| `dashboard-v2.html` | sep 2026 | de gekozen v2 | live sinds september 2026 |
| `rapportages-v2.html` | sep 2026 | rapportages-herontwerp | `/proto-bezetting` |

Nieuwe prototypes horen niet meer hier maar als route in de app zelf
(`apps/web/src/app/[locale]/proto-*`). Die zijn publiek bereikbaar maar staan
via `robots.ts` uit de zoekindex, en draaien op de echte aggregatie in plaats
van op verzonnen cijfers.
