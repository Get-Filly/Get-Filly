# Ontwerp: welk type uiting scoort bij welke zaak

Status: ontwerp, nog niets gebouwd. Wacht op akkoord van Floris.

## Doel
Filly leert per zaak welk soort uiting (kanaal, hoek, dag, soort foto) de meeste
extra reserveringen oplevert, en stuurt daar zachtjes op bij.

## Wat we meten
De beste maat is wat we zelf kunnen zien, zonder afhankelijk te zijn van wat
Meta of Google aan cijfers teruggeeft:
1. Reserveringen die via een campagnelink binnenkomen (UTM, `via_campaign_id`).
2. Bezetting van het rustige moment waarvoor de uiting was bedoeld, tegenover de
   verwachte bezetting (dat meet `quiet-feedback.service` al per venster).
3. Alleen als aanvulling, en alleen samengevat: bereik en interactie per uiting.

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

## De Meta-privacyvraag
Meta-gegevens (bereik, likes, reacties per post) zijn "Meta Platform Data".
Onze afspraak is dat die NIET naar Claude (Anthropic) gaan. Zodra we
post-insights in een prompt stoppen, verandert dat. Voorstel:
- De rekensom (welk type scoort) doet gewone code in onze eigen backend, geen AI.
- Naar Claude gaat alleen de uitkomst in eigen woorden ("carrousels op Instagram
  leverden meer op"), zonder Meta-cijfers of losse posts.
- Reserveringen via UTM zijn onze eigen data en mogen wel de prompt in.
- Laat een jurist bevestigen dat een samengevatte uitkomst niet als Platform Data telt.

## Open punten
- Minimum aantal uitingen per laag.
- Hoe lang we terugkijken (advies: 90 dagen, met minder gewicht voor oud).
- Of de eigenaar het leren per kanaal kan uitzetten.
