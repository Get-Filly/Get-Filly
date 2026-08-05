/**
 * Generieke pack — neutrale fallback voor branches zonder eigen pack.
 *
 * Zolang wellness/kapper/sportschool nog geen volledig uitgewerkte pack
 * hebben, resolvet `getIndustryPack` naar deze generieke laag (met de
 * echte branche-slug erin gestempeld). De vaktaal is bewust neutraal:
 * "dienst" / "klant" / "afspraak" werkt breed genoeg voor dienstverleners.
 *
 * De `industry`-waarde hier ('horeca') is slechts een placeholder-type;
 * de resolver overschrijft 'm met de werkelijke branche. Zet 'm NIET op
 * een echte niet-horeca-slug, anders zou een directe import verwarrend
 * zijn over welke branche dit is.
 */
import type { IndustryPack } from '../industry-pack';

export const GENERIC_PACK: IndustryPack = {
  // Placeholder; getIndustryPack stempelt de echte slug erin.
  industry: 'horeca',
  lexicon: {
    offering: 'dienst',
    offeringPlural: 'diensten',
    menu: 'dienstenaanbod',
    menuShort: 'aanbod',
    customer: 'klant',
    customerPlural: 'klanten',
    booking: 'afspraak',
    bookingVerb: 'een afspraak maken',
    visitMoment: 'afspraakmoment',
    venue: 'de zaak',
    professional: 'medewerker',
  },
  systemFraming: 'een AI-marketingassistent voor lokale ondernemers',
  sectorLabel: 'jouw branche',
  menuGuardMessage:
    'Vul eerst je aanbod in (minimaal 3 diensten) zodat Filly concrete voorstellen kan doen.',
  themeLabels: {
    feestdag: 'feestdag',
    rustige_dag_actie: 'actie op een rustig moment',
    nieuw_menu: 'nieuw aanbod / nieuwe dienst',
    seizoens_aanbod: 'seizoensaanbod',
    eenmalig_event: 'eenmalig event',
    algemeen: 'algemeen',
  },
  ctaLabels: {
    reserveer: 'Maak een afspraak',
    bel: 'Bel',
    bekijk_menu: 'Bekijk aanbod',
    vraag_in_comment: 'Reageer in de comments',
    bezoek: 'Kom langs',
    tag_vriend: 'Tag een vriend',
    save_voor_later: 'Bewaar voor later',
    rsvp_event: 'Meld je aan',
    andere: 'Andere',
  },
  // Neutraliseert de scherpste horeca-brand-zinnen in CHANNEL_RULES
  // (F&B / eetmoment / lunch-diner / "voor horeca") die het VAKTAAL-blok
  // niet vangt. Timing (dagen/uren/getallen) blijft ongemoeid — dat is
  // mechanica, niet branche-smaak. Een echte branche-pack kan dit later
  // verder verfijnen op het eigen piekritme.
  channelFlavor: {
    mail: {
      specifics: [
        'Subject ≤ 40 tekens zichtbaar op mobiel; eerste 30 zijn cruciaal.',
        'Preheader complementair aan subject, niet herhalen.',
        'Personalisatie (voornaam) in subject of opening = +26% open-rate.',
        'Niet meer dan 1 mailing per 10 dagen (conservatief bij een klein bestand).',
      ],
    },
    instagram_reels: {
      note: 'Plaats de video 2-4u vóór een piekmoment van je klanten: vlak vóór de beslissing presteert video het best (Reels ~2.7% engagement vs 1.4% carousel). Weekend-avond werkt ook.',
      fallback:
        'door-de-week dezelfde piek-vensters (2-4u vóór het moment dat klanten kiezen) — de dag maakt voor Reels minder uit dan het moment.',
    },
    instagram_stories: {
      note: '"Wat is er vandaag"-content vlak vóór de piekmomenten van je klanten. Verdwijnt na 24u, dus plaats op de dag zelf.',
    },
    facebook: {
      note: 'Di-wo 12:00-20:00 = algemene piek (Sprout, 307K profielen); de piek-vensters 11-13 en 17-19 voor tijdgebonden content. Boekings-/aanbod-content scoort do-zo 11:00-14:00 en 19:00-21:00. Events: 2-3 weken vooraf aankondigen + reminder 2 dagen vooraf (3× hogere RSVP).',
    },
    tiktok: {
      note: 'Ma-do 15:00-18:00 = sterke piek ("afternoon slump"); za-ochtend 10:00-12:00 voor weekend-content. Post 30-60 min vóór de piek: het algoritme test eerst klein en pusht daarna (4× FYP-distributie bij vroege engagement). Consistentie weegt zwaarder dan perfectie.',
      specifics: [
        'Hook in eerste 2-3 sec: vraag of contrast.',
        'Trending sound essentieel voor algoritme-boost.',
        'Seed-comment van eigen account in eerste minuut stuurt het gesprek.',
        'Voor sommige lokale diensten zelden de hoogste ROI; overweeg of de tijd-investering loont.',
      ],
    },
    whatsapp: {
      note: 'Vaste klanten di-do 16:00-18:00 (last-minute zelfde-dag-uitnodiging, 67% prefereert messaging boven bellen); brede broadcast op de dag zelf om 11:00 of 15:00. NOOIT 22:00-09:00 of zondagavond (AVG redelijke uren). Verjaardags-bericht 7 dagen vóór de datum. Conservatief gebruiken; opt-in juridisch verplicht.',
    },
  },
};
