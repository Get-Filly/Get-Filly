# Ontwerp: welk type uiting scoort bij welke zaak

Status: ontwerp, nog niets gebouwd. Wacht op akkoord van Floris.

## Doel
Filly leert per zaak welk soort uiting (kanaal, hoek, dag, soort foto) de meeste
extra reserveringen oplevert, en stuurt daar zachtjes op bij.

## Wat we meten
De beste maat is wat we zelf kunnen zien, zonder afhankelijk te zijn van wat
Meta of Google aan cijfers teruggeeft:
1. Bezetting van het rustige moment waarvoor de uiting was bedoeld, tegenover de
   verwachte bezetting (dat meet `quiet-feedback.service` al per venster).
2. Alleen als aanvulling, en alleen samengevat: bereik en interactie per uiting.

## Hoe het leert (in lagen)
1. Laag 1, zaak breed: gemiddelde extra bezetting per kanaal.
2. Laag 2, per kanaal en dagdeel.
3. Laag 3, per hoek (bijvoorbeeld gerecht, sfeer, aanbieding).
Een laag telt pas mee vanaf een minimum aantal uitingen (nu 2 metingen, later
hoger). Te weinig data betekent terugvallen op de laag erboven, zoals bij de
rustige momenten al werkt (`*|dagdeel`).

## Wat Filly ermee doet
- Kanaalkeuze in de geleide flow: het kanaal met de beste ervaring bovenaan.
- Toon eerlijke cijfers ("dit werkte de laatste 5 keer"), nooit verzonnen.
- Nooit iets blokkeren: de eigenaar beslist.

## De Meta-privacyvraag (besluit Floris 30-9)
- Gewone code in onze eigen backend rekent uit wat scoort, geen AI.
- Naar Claude mag data, zolang er GEEN bedrijfsnamen bij zitten. Geaggregeerde
  inzichten zoals "in Nederland, in deze regio, scoren carrousels op Instagram
  goed" mogen dus mee. Nooit een zaaknaam, nooit losse posts van een zaak.
- Reserveringen via campagnelinks tellen we niet mee: dat is volgens Floris niet
  betrouwbaar te meten. De hoofdmaat blijft de bezetting van het rustige moment
  tegenover de verwachting (punt 2 hierboven).
- Jurist laten bevestigen dat een samengevatte, geanonimiseerde uitkomst niet als
  Meta Platform Data telt: later, staat op BACKLOG.

## Open punten
- Minimum aantal uitingen per laag.
- Hoe lang we terugkijken (advies: 90 dagen, met minder gewicht voor oud).
- Of de eigenaar het leren per kanaal kan uitzetten.
