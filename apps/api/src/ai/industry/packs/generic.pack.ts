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
};
