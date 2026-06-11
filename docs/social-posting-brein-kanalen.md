# Social-posting-brein — Lengte & vorm per kanaal

> **Gegenereerd bestand — niet handmatig bewerken.**
> Bron: `apps/api/src/ai/filly-brain.config.ts` (CHANNEL_RULES v3).
> Bijwerken: pas de config aan en draai `pnpm brein:doc`. Gegenereerd op 2026-06-11.

Dit hoofdstuk vult het social-posting-brein-document
(`docs/social-posting-brein.docx`, de timing-laag) aan met de lengte-,
hashtag-, toon- en CTA-regels per kanaal die Filly bij élke
tekst-generatie afgedwongen krijgt (prompt-injectie + lengte-guard in code).

## Overzicht lengte-bandbreedtes

| Kanaal | Body (tekens) | Body (woorden) | Subject | Hashtags | Max/week |
|---|---|---|---|---|---|
| Mail | 400–1200 | 75–200 | 30–60 tekens | geen | 1 |
| Instagram (feed) | 125–2200 | 20–350 | — | 3–5 | 5 |
| Instagram (Reels) | 50–100 | 8–25 | — | 2–3 | 2 |
| Instagram (Stories) | 30–60 | 5–12 | — | geen | 10 |
| Facebook | 250–500 | 40–120 | — | geen | 3 |
| TikTok | 100–150 | 15–30 | — | 3–5 | 5 |
| WhatsApp | 300–700 | 50–120 | — | geen | 1 |
| Google Business | 500–1500 | 80–250 | — | geen | 3 |

## Mail

*Directe communicatie naar bestaande gasten. Hoogste conversie, langste tekst toegestaan.*

**Lengte**
- Subject: 30–60 tekens
- Preheader: 50–90 tekens
- Body: 75–200 woorden (400–1200 tekens)

**Hashtags**
- Geen hashtags op dit kanaal.

**Timing**
- Beste dagen: donderdag, vrijdag
- Beste tijden: 09:00-11:00 en 17:30-18:30
- Vrijdag 18:00 = piek in open- én click-rate (MailerLite, 2.1M campagnes); do-ochtend ideaal voor weekend-promoties (+30% CTR vs ma/di). Vermijd zondag (click-rate -32%). Maand-begin (1-5) en rond de 25e (loondag) geven extra boost.
- Tweede-beste venster: di-wo 09:00-11:00 (ochtend-open-piek werkt door de week prima); alleen zondag blijft af te raden.
- Lead-time: minimaal 24u, optimaal 72–168u vóór de doel-datum. Mensen plannen uit-eten 2-5 dagen vooruit; onder 24u keldert open-rate.
- Frequentie-plafond: 1×/week, 4×/maand

**Toon:** Persoonlijk, warm, ondertekend door eigenaar of Filly. Schrijf alsof je een vaste gast persoonlijk benadert.

**CTA:** Eén primaire CTA als button, max 3 woorden ("Reserveer nu" / "Bekijk menu"). Geen 2e of 3e CTA.

**Specifiek**
- Subject ≤ 40 tekens zichtbaar op mobiel; eerste 30 zijn cruciaal.
- Preheader complementair aan subject, niet herhalen.
- Personalisatie (voornaam) in subject of opening = +26% open-rate.
- Niet meer dan 1 mailing per 10 dagen voor horeca.

## Instagram (feed)

*Visueel-eerst, brede zichtbaarheid. Discovery én herinnering voor bestaande followers.*

**Lengte**
- Body: 20–350 woorden (125–2200 tekens)

**Hashtags**
- 3–5 stuks, plaatsing: einde caption
- Mix branded (#restaurantnaam) + niche-lokaal (#stadsnaam #wijknaam) + algemeen (#cuisine).

**Timing**
- Beste dagen: woensdag, donderdag, vrijdag
- Beste tijden: 12:00-13:00 en 18:00-21:00
- Donderdag 9:00 en 21:00 = hoogste engagement (Buffer, 9.6M posts); wo 12:00 + 18:00 sterk; vr-lunch (11-13) triggert weekend-eetbeslissingen. Vermijd za-zo voor zakelijke posts (engagement -17%). Eerste 125 tekens cruciaal (zichtbaar vóór "meer"-klik).
- Tweede-beste venster: ma-di 18:00-20:00 (door-de-week-avond); in het weekend alleen sfeer-/food-content, geen zakelijke aanbiedingen.
- Lead-time: minimaal 6u, optimaal 24–72u vóór de doel-datum. Recent in feed = bovenaan; te ver vooruit = vergeten.
- Frequentie-plafond: 5×/week, 20×/maand

**Toon:** Visueel-eerst, kort, emoji's mogen (1-3). Schrijf zodat de copy het beeld versterkt, niet beschrijft.

**CTA:** Een save/share-trigger ("Sla op voor je volgende date-night") of profiel-actie ("Link in bio voor reservering").

**Specifiek**
- Eerste 125 tekens = hook + actie; pas daarna context.
- Hashtag-strategie weegt sinds 2023 minder; kwaliteit > kwantiteit.
- Save (bewaren) weegt sinds 2024 zwaarder dan like in het algoritme.
- Carousels (3-10 kaarten) hebben ~1.4× engagement vs single image.
- Visual verplicht (1:1 / 4:5), alt-tekst verplicht.

## Instagram (Reels)

*Discovery via algoritme-push. Bereikt vooral niet-volgers.*

**Lengte**
- Body: 8–25 woorden (50–100 tekens)
- Video: 7–60 sec (sweet-spot 12s)

**Hashtags**
- 2–3 stuks, plaatsing: einde caption
- Niche eerst (#foodietok #restaurantnaam), één breed (#cuisine).

**Timing**
- Beste dagen: donderdag, vrijdag, zaterdag, zondag
- Beste tijden: 10:00-11:30 en 16:00-17:30
- Reels 2-4u vóór het eetmoment plaatsen (lunch ~11:00, diner ~17:00): vlak voor de eetbeslissing presteert F&B-video het best (Dash Social; Reels 2.7% engagement vs 1.4% carousel). Weekend-avond werkt voor F&B óók.
- Tweede-beste venster: door-de-week dezelfde eetmoment-vensters (2-4u vóór lunch of diner) — de dag maakt voor Reels minder uit dan het moment.
- Lead-time: minimaal 4u, optimaal 24–48u vóór de doel-datum. Algoritme-push duurt uren; te late post valt onder later interval.
- Frequentie-plafond: 2×/week, 8×/maand

**Toon:** Vraag-vorm of one-liner. Caption is bijzaak; video moet het werk doen.

**CTA:** Comment-trigger ("welke versie vind jij beter?") of profiel-actie ("link in bio").

**Specifiek**
- Hook in eerste 1-3 sec: beeld dat verbazing/honger triggert.
- Trending audio > eigen audio voor algoritme-boost.
- Geen titel-frame (lege frame met tekst); direct beeld.
- Visual verplicht (9:16).

## Instagram (Stories)

*Last-minute push naar bestaande followers. Persoonlijk, direct, vervalt na 24u.*

**Lengte**
- Body: 5–12 woorden (30–60 tekens)

**Hashtags**
- Geen hashtags op dit kanaal.

**Timing**
- Beste dagen: maandag, dinsdag, woensdag, donderdag, vrijdag, zaterdag, zondag
- Beste tijden: 11:00-13:00 en 17:00-19:00
- "Wat is er vandaag"-content vlak vóór de eetmomenten (lunch + diner-prep). Verdwijnt na 24u, dus plaats op de dag zelf.
- Tweede-beste venster: elk ander moment op de dag zelf — Stories zijn per definitie dag-content, een "gemist" venster bestaat hier nauwelijks.
- Lead-time: minimaal 0u, optimaal 0–24u vóór de doel-datum. Verdwijnt na 24u; per definitie last-minute kanaal.
- Frequentie-plafond: 10×/week, 30×/maand

**Toon:** Telegram-stijl: 1 zin per slide, geen completer paragraaf.

**CTA:** Sticker-CTA (poll, vraag, link, swipe-up). Direct, één-klik-actie.

**Specifiek**
- Set van 3-5 slides; drop-off na 5.
- Sticker-engagement (poll/vraag) +20% vs alleen tekst.
- Hashtags hebben minimale impact op Stories — niet gebruiken.
- Visual verplicht (9:16).

## Facebook

*Community-conversational. Oudere demografie; werkt goed voor familie- en event-content.*

**Lengte**
- Body: 40–120 woorden (250–500 tekens)
- Video: 15–60 sec (sweet-spot 35s)

**Hashtags**
- Geen hashtags op dit kanaal.

**Timing**
- Beste dagen: dinsdag, woensdag, donderdag, vrijdag
- Beste tijden: 11:00-13:00 en 17:00-19:00
- Di-wo 12:00-20:00 = algemene piek (Sprout, 307K profielen); maaltijd-windows 11-13 en 17-19 voor food-content. Boekings-/aanbod-content scoort do-zo 11:00-14:00 en 19:00-21:00. Events: 2-3 weken vooraf aankondigen + reminder 2 dagen vooraf (3× hogere RSVP).
- Tweede-beste venster: za-zo 11:00-14:00 (weekend-planmoment, vooral voor boekings-content) of 19:00-21:00 avond-relaxatie.
- Lead-time: minimaal 12u, optimaal 48–120u vóór de doel-datum. FB-feed langzamer maar verzadigd; lange aanloop helpt.
- Frequentie-plafond: 3×/week, 12×/maand

**Toon:** Storytelling, vraag stellen voor engagement. Warmer en uitgebreider dan IG.

**CTA:** Vraag in copy ("Wat was jouw favoriet vorige week?") of direct event-link.

**Specifiek**
- Geen hashtags.
- Voor evenementen ALTIJD Facebook-event (5× effectiever dan event-post).
- Live + video presteert beter dan statische foto.
- Ondertiteling op video's verplicht (auto-play = silent op FB).

## TikTok

*Discovery via FYP-algoritme. Bereikt vooral jonger publiek; vereist consistente video-output.*

**Lengte**
- Body: 15–30 woorden (100–150 tekens)
- Video: 15–60 sec (sweet-spot 22s)

**Hashtags**
- 3–5 stuks, plaatsing: einde caption
- Mix trending + #foodietok + #stadsnaam + 1 niche.

**Timing**
- Beste dagen: maandag, dinsdag, woensdag, donderdag, zaterdag
- Beste tijden: 14:00-18:00 en 19:00-21:00
- Ma-do 15:00-18:00 = F&B-piek ("afternoon slump": mensen plannen hun diner — Sprout); za-ochtend 10:00-12:00 voor weekend-content. Post 30-60 min vóór de piek: het algoritme test eerst klein en pusht daarna (4× FYP-distributie bij vroege engagement). Consistentie weegt zwaarder dan perfectie.
- Tweede-beste venster: zo 19:00-21:00 (avond-scroll) of vr-middag; voor het TikTok-algoritme weegt regelmatig posten zwaarder dan het exacte tijdstip.
- Lead-time: minimaal 6u, optimaal 24–72u vóór de doel-datum. Algoritme heeft tijd nodig om bereik te bouwen.
- Frequentie-plafond: 5×/week, 16×/maand

**Toon:** Snel, trendy, energiek. Spreektaal mag.

**CTA:** Comment-vraag of "reserveer via link in bio".

**Specifiek**
- Hook in eerste 2-3 sec: vraag of contrast.
- Trending sound essentieel voor algoritme-boost.
- Seed-comment van eigen account in eerste minuut stuurt het gesprek.
- Voor traditionele horeca zelden de hoogste ROI; overweeg of de tijd-investering loont.
- Visual verplicht (9:16).

## WhatsApp

*Persoonlijke last-minute-push naar opt-in gasten. Hoogste open-rate én hoogste ergernis-risico.*

**Lengte**
- Body: 50–120 woorden (300–700 tekens)

**Hashtags**
- Geen hashtags op dit kanaal.

**Timing**
- Beste dagen: dinsdag, woensdag, donderdag
- Beste tijden: 16:00-18:00 en 11:00-15:00
- Vaste gasten di-do 16:00-18:00 (last-minute zelfde-avond-uitnodiging, 67% prefereert messaging boven bellen); lege-tafels-broadcast op de dag zelf om 11:00 of 15:00. NOOIT 22:00-09:00 of zondagavond (AVG redelijke uren). Verjaardags-bericht 7 dagen vóór de datum. Conservatief gebruiken; opt-in juridisch verplicht.
- Tweede-beste venster: vr 11:00-15:00 voor weekend-gerichte last-minute acties; de verboden uren (22:00-09:00, zondagavond) blijven altijd gelden.
- Lead-time: minimaal 0.5u, optimaal 4–24u vóór de doel-datum. Last-minute persoonlijke nudge; te vroeg voelt formeel.
- Frequentie-plafond: 1×/week, 1×/maand

**Toon:** Persoonlijk, alsof eigenaar zelf typt. Vermijd marketing-toon.

**CTA:** Directe reserveer-link of telefoon-tap. Eén klik, geen UTM-tracking zichtbaar.

**Specifiek**
- Opt-in verplicht (AVG + WhatsApp Business policy).
- Max 1-2 emoji's; ALL-CAPS triggert spam-filter.
- Eerste outreach naar nummer (buiten 24u-window) vereist Meta-goedgekeurd template.
- Max 1× per 3 weken voor zelfde nummer om ergernis te voorkomen.

## Google Business

*Lokaal-actie-gericht. Lage directe engagement, hoge SEO-impact in local pack.*

**Lengte**
- Body: 80–250 woorden (500–1500 tekens)
- Video: 10–30 sec (sweet-spot 18s)

**Hashtags**
- Geen hashtags op dit kanaal.

**Timing**
- Beste dagen: maandag, dinsdag, woensdag, donderdag, vrijdag
- Beste tijden: 07:00-09:00 en 14:00-16:00
- Ma-wo 7:00-9:00 = plan-modus begin van de week (weekreserveringen pieken ma/di, Toast +11%); event-posts wo-do 14:00-16:00 (weekend-planning piekt dan); weekend-aanbiedingen do-vr 14:00-16:00. Vaste maandagochtend-post ("wat is er nieuw") loont: wekelijks posten alleen al +28% klikken. 2-3 posts/week is het optimum.
- Tweede-beste venster: elke werkdag 10:00-12:00 (snelle indexering); een dag later posten is altijd beter dan overslaan — consistentie weegt het zwaarst voor de local-pack-ranking.
- Lead-time: minimaal 12u, optimaal 24–168u vóór de doel-datum. Google indexeert binnen uren maar zoekers vinden 1-3 dagen na.
- Frequentie-plafond: 3×/week, 12×/maand

**Toon:** Lokaal-actie-gericht, feitelijk. Vermeld datum + adres + aanbod expliciet.

**CTA:** CTA-knop: Bel / Reserveer / Bekijk menu / Leer meer. Eén knop per post.

**Specifiek**
- Drie post-types: Update (verloopt 7d) / Event (datum-range) / Offer.
- Foto verplicht; vergroot CTR met 35%+.
- Geen hashtags — werken niet op GBP.
- Posts wegen mee in local-pack ranking.
- Q&A-sectie pro-actief vullen (weegt mee in lokale ranking).
- Visual verplicht (4:3 / 1:1 / 16:9).
