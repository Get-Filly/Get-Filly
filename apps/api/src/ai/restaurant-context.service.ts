import { Injectable, Logger } from '@nestjs/common';
import { OccupancyService, type OccupancyDay } from '../occupancy/occupancy.service';
import { WeatherService, type ForecastDay } from '../weather/weather.service';
import { ReservationsService } from '../reservations/reservations.service';
import type { Reservation } from '../reservations/reservations.service';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';

// ============================================================
// RestaurantContextService, feiten + identiteit voor AI-prompts
// ============================================================
//
// Bouwt drie verschillende NL-tekstblokken die Filly nodig heeft om
// goede antwoorden en suggesties te geven:
//
//   1. PROFIEL , wie is dit restaurant? Type, doelgroep, USPs,
//                 sfeer, openingstijden, faciliteiten, socials.
//                 Statische data, wijzigt zelden → geschikt voor
//                 prompt-caching (komt later).
//   2. MENU    , wat staat er op de kaart? Gerechten + prijzen +
//                 categorieën + signature-markers. Ook statisch.
//   3. ACTUEEL , weer, bezetting, reserveringen komende 7 dagen.
//                 Wijzigt continu, niet cache-baar.
//
// Filly-features mogen één of meerdere blokken oppakken al naar
// gelang de use-case:
//   - Chat / suggesties / refine → alle 3 (Filly heeft volledige
//     context nodig om relevant en specifiek te zijn).
//   - Reviews-reply → profiel volstaat (geen menu/actueel nodig).
//   - Schedule-suggestion → profiel + actueel (geen menu nodig).
//
// Ontwerp-keuzes:
//   - Alle bronnen parallel ophalen (Promise.all) → ~150ms toevoegen
//     aan een Claude-call van 1-3 sec is verwaarloosbaar.
//   - Fail-soft: als één bron faalt, laten we dat blok gewoon weg.
//     Filly merkt zelf of iets ontbreekt en vraagt ernaar.
//   - Compact formatteren: elk extra token in input kost geld. We
//     geven één regel per item, geen lange beschrijvingen.
//   - Lege velden weglaten, een lege "Doelgroep:" verwart Filly
//     en kost tokens zonder waarde.
// ============================================================

@Injectable()
export class RestaurantContextService {
  private readonly logger = new Logger(RestaurantContextService.name);

  constructor(
    private readonly occupancy: OccupancyService,
    private readonly weather: WeatherService,
    private readonly reservations: ReservationsService,
    private readonly supabase: RequestSupabaseService,
  ) {}

  // ============================================================
  // PROFIEL, identiteit + operationele kenmerken van de zaak
  // ============================================================
  // Pakt alle profiel-velden op in één query en formatteert ze als
  // bullet-lijst. Lege velden worden overgeslagen zodat Filly geen
  // valse "ik weet het niet"-signalen krijgt. Volgorde van bullets
  // gaat van "wat voor zaak ben je" → "voor wie" → "operationeel".
  async buildProfileBlock(restaurantId: string): Promise<string> {
    const { data: r, error } = await this.supabase.client
      .from('restaurants')
      .select(
        // Alle velden uit restaurants + onboarding-extensies (0003).
        // Bewust géén logo_url / brand_colors, irrelevant voor tekst-LLM.
        `
        name, type, cuisine_style, description, tagline,
        target_audience, atmosphere, unique_selling_points,
        special_events, signature_dishes, brand_tone, languages_spoken,
        city, address, postal_code, country,
        price_range, capacity_seats, capacity_terrace,
        has_terrace, has_private_room, has_kids_menu,
        terrace_sun_periods, terrace_type,
        opening_hours, kitchen_closing_time,
        social_media, website_url, website_summary
        `,
      )
      .eq('id', restaurantId)
      .maybeSingle();

    if (error) {
      // Echte query-fout (geen "rij ontbreekt"): op error-niveau loggen zodat
      // het zichtbaar/monitorbaar is. Filly kan dan op een lege profiel-context
      // belanden — fail-soft houden we (generatie niet breken), maar de fout
      // mag niet stil in een warn verdwijnen. (Generatie hard afbreken bij een
      // context-fout is een aparte, zorgvuldige stap — raakt alle callers.)
      this.logger.error(`Profiel-query faalde, context kan leeg zijn: ${error.message}`);
      return '';
    }
    if (!r) return ''; // Legitiem: nog geen profiel ingevuld.

    const lines: string[] = [];
    const name = (r.name as string) ?? 'de onderneming';
    lines.push(`PROFIEL, ${name}`);

    const type = r.type as string | null;
    const cuisine = (r.cuisine_style as string[] | null)?.filter(Boolean);
    if (type || (cuisine && cuisine.length > 0)) {
      const parts = [type, cuisine?.join(', ')].filter(Boolean).join(' / ');
      lines.push(`- Type: ${parts}`);
    }

    if (r.tagline) lines.push(`- Tagline: ${r.tagline}`);
    if (r.description) lines.push(`- Over ons: ${shorten(r.description as string, 280)}`);
    if (r.atmosphere) lines.push(`- Sfeer: ${shorten(r.atmosphere as string, 220)}`);
    if (r.target_audience) {
      lines.push(`- Doelgroep: ${shorten(r.target_audience as string, 220)}`);
    }
    if (r.unique_selling_points) {
      lines.push(`- USPs: ${shorten(r.unique_selling_points as string, 220)}`);
    }
    if (r.special_events) {
      lines.push(`- Events / specials: ${shorten(r.special_events as string, 220)}`);
    }

    const sigDishes = (r.signature_dishes as string[] | null)?.filter(Boolean);
    if (sigDishes && sigDishes.length > 0) {
      lines.push(`- Signature gerechten: ${sigDishes.join(', ')}`);
    }

    // Locatie kort: stad volstaat voor de meeste prompts. Volledig
    // adres alleen tonen als 't ergens voor nodig is (bv. afstands-
    // berekening), voorlopig laten we 'm weg om tokens te besparen.
    if (r.city) {
      const country = (r.country as string) ?? 'NL';
      const loc = country === 'NL' ? r.city : `${r.city} (${country})`;
      lines.push(`- Locatie: ${loc}`);
    }

    // Prijsklasse: 1=€ … 4=€€€€. Vertalen naar leesbare tekens
    // zodat Filly 'm direct begrijpt.
    if (typeof r.price_range === 'number' && r.price_range >= 1 && r.price_range <= 4) {
      lines.push(`- Prijsklasse: ${'€'.repeat(r.price_range as number)}`);
    }

    // Capaciteit: binnen + terras gecombineerd. Skip als beide null.
    const seats = r.capacity_seats as number | null;
    const terrace = r.capacity_terrace as number | null;
    if (seats || terrace) {
      const parts: string[] = [];
      if (seats) parts.push(`${seats} binnen`);
      if (terrace) parts.push(`${terrace} terras`);
      lines.push(`- Capaciteit: ${parts.join(' + ')}`);
    }

    // Faciliteiten: alleen tonen wat aan staat (booleans).
    const facilities: string[] = [];
    if (r.has_terrace) facilities.push('terras');
    if (r.has_private_room) facilities.push('privéruimte');
    if (r.has_kids_menu) facilities.push('kindermenu');
    if (facilities.length > 0) {
      lines.push(`- Faciliteiten: ${facilities.join(', ')}`);
    }

    // Terras-eigenschappen: alleen relevant als has_terrace=true.
    // Vertaal de enum-waarden naar NL zodat Filly direct kan zeggen
    // "overdekt terras met middag-zon" zonder zelf te vertalen.
    if (r.has_terrace) {
      const sunPeriods = r.terrace_sun_periods as string[] | null;
      const sunLabels: Record<string, string> = {
        morning: 'ochtend',
        afternoon: 'middag',
        evening: 'avond',
      };
      if (sunPeriods && sunPeriods.length > 0) {
        const nl = sunPeriods.map((p) => sunLabels[p] ?? p).filter(Boolean);
        if (nl.length > 0) {
          lines.push(`- Terras-zon: ${nl.join(', ')}`);
        }
      }

      const terraceTypeLabels: Record<string, string> = {
        open: 'open (alleen bij droog weer)',
        covered: 'overdekt (ook bij regen bruikbaar)',
        convertible: 'overdekbaar (regenstand mogelijk)',
      };
      const terraceType = r.terrace_type as string | null;
      if (terraceType && terraceTypeLabels[terraceType]) {
        lines.push(`- Terras-type: ${terraceTypeLabels[terraceType]}`);
      }
    }

    // Openingstijden compact formatteren als jsonb gevuld is.
    const hours = r.opening_hours as Record<string, unknown> | null;
    const hoursLine = formatOpeningHours(hours);
    if (hoursLine) lines.push(`- Openingstijden: ${hoursLine}`);

    const langs = (r.languages_spoken as string[] | null)?.filter(Boolean);
    if (langs && langs.length > 0) {
      lines.push(`- Talen: ${langs.join(', ').toUpperCase()}`);
    }

    // Socials: jsonb { instagram, facebook, tiktok, ... } → één regel
    // met alleen de gevulde kanalen. Filly kan zo beslissen of
    // social-campagnes überhaupt zin hebben.
    const social = r.social_media as Record<string, string> | null;
    if (social && Object.keys(social).length > 0) {
      const entries = Object.entries(social)
        .filter(([, v]) => typeof v === 'string' && v.length > 0)
        .map(([k, v]) => `${k}: ${v}`);
      if (entries.length > 0) lines.push(`- Socials: ${entries.join(' · ')}`);
    }

    if (r.website_url) lines.push(`- Website: ${r.website_url}`);

    const tone = r.brand_tone as string | null;
    if (tone) lines.push(`- Toon: ${tone}`);

    return lines.join('\n');
  }

  // ============================================================
  // MENU, gerechten gegroepeerd per categorie
  // ============================================================
  // Filly weet hierdoor concreet wat er op de kaart staat zodat
  // suggesties refereren aan échte gerechten ("kom de tagliata
  // proeven") in plaats van algemeen ("een lekker hoofdgerecht").
  //
  // Compact format: per item alleen naam + prijs + signature-marker.
  // Description weglaten, die zijn vaak lang en kosten te veel
  // tokens voor de marginale waarde. Filly mag de naam interpreteren.
  //
  // Cap op 60 items om bij grote menu's de prompt niet te laten
  // exploderen. Signature dishes en de eerste items per categorie
  // krijgen voorrang via display_order.
  // `compact`-modus (sinds 2026-06-30, chat-perf #2): de dashboard-chat
  // schrijft zelf geen campagne-copy meer (dat doet de geleide flow met
  // het VOLLEDIGE menu), dus daar volstaat een lichtere kaart. In compact
  // houden we de food-namen + signature-markers (zodat Filly een gerecht
  // herkent voor het topic) maar laten we prijzen weg, en vatten we de
  // drankkaart samen tot aantallen per categorie + signature-drankjes.
  // Dat scheelt fors input-tokens per chatbeurt. Generatie-callers laten
  // `compact` weg en krijgen het volledige menu zoals voorheen.
  async buildMenuBlock(
    restaurantId: string,
    opts?: { compact?: boolean },
  ): Promise<string> {
    const compact = opts?.compact === true;
    type Item = {
      name: string;
      category: string | null;
      subcategory: string | null;
      price_cents: number | null;
      is_signature: boolean;
      dietary_tags: string[] | null;
      created_at: string | null;
    };

    // Twee aparte queries, één voor food, één voor drank, met elk
    // een eigen quotum. Zonder deze splitsing kon een grote drankkaart
    // (50+ items) de selectie van food-items wegduwen, waardoor net-
    // toegevoegde gerechten buiten Filly's prompt vielen.
    //
    // Sort: is_signature desc, daarna created_at desc. Het tweede
    // criterium garandeert dat een vers toegevoegd gerecht boven oude
    // niet-signature items uitkomt, vroeger sorteerden we op
    // display_order, maar dat is in de praktijk overal 0 (default,
    // niemand zet 't handmatig) waardoor de fallback-volgorde
    // willekeurig was en nieuwe items achteraan landden.
    //
    // Caps zijn ruim genoeg voor 99% van horeca-zaken: bistro/brasserie
    // 30-60 food, fine-dining 20-30 food + 50-100 drank, hotel-restaurant
    // tot 100+ food. Sonnet 4.6 heeft 200k context en met prompt-caching
    // (cache_control: ephemeral) kost de menu-block ~10% van de normale
    // input-prijs bij hits, token-impact is marginaal.
    //
    // Bij overflow (meer items dan de cap) telt buildMenuBlock dat ook
    // op en zet 't in de prompt-output, zodat Filly transparant is dat
    // 'ie maar een deel ziet ipv blind te aannemen "dit is alles".
    const FOOD_LIMIT = 150;
    const DRINK_LIMIT = 100;

    // count-queries draaien in dezelfde Promise.all zodat we maar één
    // roundtrip-tijdvenster hebben. head:true → geen rijen, alleen het
    // totaal-getal; geen extra DB-werk.
    const baseFood = () =>
      this.supabase.client
        .from('menu_items')
        .select(
          'name, category, subcategory, price_cents, is_signature, dietary_tags, created_at',
          { count: 'exact' },
        )
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .neq('category', 'drank');
    const baseDrink = () =>
      this.supabase.client
        .from('menu_items')
        .select(
          'name, category, subcategory, price_cents, is_signature, dietary_tags, created_at',
          { count: 'exact' },
        )
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .eq('category', 'drank');

    const [foodResult, drinkResult] = await Promise.all([
      baseFood()
        .order('is_signature', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(FOOD_LIMIT),
      baseDrink()
        .order('is_signature', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(DRINK_LIMIT),
    ]);

    // Query-fouten op error-niveau (monitorbaar): een transient fout levert een
    // lege menu-context → Filly kan generiek/gehallucineerd genereren. Fail-soft
    // (niet breken), maar niet stil in een warn laten verdwijnen.
    if (foodResult.error) {
      this.logger.error(`Food-query faalde, menu-context kan leeg zijn: ${foodResult.error.message}`);
    }
    if (drinkResult.error) {
      this.logger.error(`Drink-query faalde, menu-context kan leeg zijn: ${drinkResult.error.message}`);
    }

    const foodItems = (foodResult.data ?? []) as Item[];
    const drinkItems = (drinkResult.data ?? []) as Item[];
    const allItems = [...foodItems, ...drinkItems];

    if (allItems.length === 0) return '';

    // Echte totalen op de zaak, voor de overflow-melding aan Filly.
    // count is null als de query geen count meegaf; dan vallen we
    // terug op het aantal gefetchte items (geen overflow zichtbaar
    // maar ook geen foute claim).
    const foodTotal = foodResult.count ?? foodItems.length;
    const drinkTotal = drinkResult.count ?? drinkItems.length;

    const lines: string[] = [];

    // -------- MENU --------
    // Bij overflow eerlijk vermelden: "selectie van X totaal" zodat
    // Filly weet dat hij niet het hele menu ziet en in z'n antwoord
    // kan compenseren ("er zijn nog meer gerechten die ik nu niet zie").
    if (foodItems.length > 0) {
      const foodHeader =
        foodTotal > foodItems.length
          ? `MENU (selectie van ${foodTotal} gerechten, ${foodItems.length} hier zichtbaar; signature + meest recente eerst)`
          : `MENU (${foodItems.length} gerechten)`;
      lines.push(foodHeader);
      const foodGroups = new Map<string, Item[]>();
      for (const it of foodItems) {
        const cat = it.category?.trim() || 'Overig';
        if (!foodGroups.has(cat)) foodGroups.set(cat, []);
        foodGroups.get(cat)!.push(it);
      }
      for (const [cat, list] of foodGroups) {
        lines.push(`${cat}:`);
        for (const it of list) {
          const sig = it.is_signature ? ' [signature]' : '';
          // Compact: alleen naam + signature (geen prijs). De chat heeft
          // de exacte prijs niet nodig om een gerecht te kunnen noemen.
          const price = compact ? '' : formatPrice(it.price_cents);
          lines.push(`  - ${it.name}${price ? `, ${price}` : ''}${sig}`);
        }
      }
    }

    // -------- DRANKKAART --------
    if (drinkItems.length > 0) {
      lines.push('');
      const drinkHeader =
        drinkTotal > drinkItems.length
          ? `DRANKKAART (selectie van ${drinkTotal} drankjes, ${drinkItems.length} hier zichtbaar; signature + meest recente eerst)`
          : `DRANKKAART (${drinkItems.length} drankjes)`;
      lines.push(drinkHeader);
      const drinkGroups = new Map<string, Item[]>();
      for (const it of drinkItems) {
        const sub = it.subcategory?.trim() || 'overig';
        if (!drinkGroups.has(sub)) drinkGroups.set(sub, []);
        drinkGroups.get(sub)!.push(it);
      }
      // Vaste volgorde voor leesbaarheid in Filly's prompt, wijnen
      // eerst, daarna bier/cocktails/sterk, dan koffie/thee/fris.
      const drinkOrder = [
        'wijn-rood',
        'wijn-wit',
        'wijn-rose',
        'wijn-mousserend',
        'bier',
        'cocktail',
        'sterke-drank',
        'koffie-thee',
        'fris',
        'overig',
      ];
      if (compact) {
        // Compact: geen losse drankjes, alleen aantal per categorie +
        // eventuele signature-drankjes bij naam. De chat heeft de volledige
        // drankkaart niet nodig (de generatie pakt 'm wel volledig).
        const counts: string[] = [];
        for (const sub of drinkOrder) {
          const list = drinkGroups.get(sub);
          if (!list || list.length === 0) continue;
          counts.push(`${sub} (${list.length})`);
        }
        if (counts.length > 0) lines.push(counts.join(', '));
        const sigDrinks = drinkItems
          .filter((it) => it.is_signature)
          .map((it) => it.name);
        if (sigDrinks.length > 0) {
          lines.push(`Signature: ${sigDrinks.join(', ')}`);
        }
      } else {
        for (const sub of drinkOrder) {
          const list = drinkGroups.get(sub);
          if (!list || list.length === 0) continue;
          lines.push(`${sub}:`);
          for (const it of list) {
            const price = formatPrice(it.price_cents);
            lines.push(`  - ${it.name}${price ? `, ${price}` : ''}`);
          }
        }
      }
    }

    // Dieet-overzicht: aantallen per tag. Filly kan zo bij vragen
    // "iets veganistisch erbij?" direct het juiste antwoord geven
    // zonder de hele lijst te moeten doorgrijzen. Alleen op food-
    // items, drank-tags zijn er nog niet en zouden onzinnige
    // counts geven.
    const tagCounts = new Map<string, number>();
    for (const it of foodItems) {
      for (const t of it.dietary_tags ?? []) {
        if (!t) continue;
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }
    if (tagCounts.size > 0) {
      const summary = Array.from(tagCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([tag, n]) => `${n}× ${tag}`)
        .join(' · ');
      lines.push(`Dieet-overzicht: ${summary}`);
    }

    // Recent-toegevoegd-sectie: items < 30 dagen oud, gesorteerd op
    // datum (nieuwste eerst). Geeft Filly een expliciet anker voor
    // "wat is jullie nieuwste gerecht?"-vragen, zonder dit signaal
    // ziet hij alleen een ongeordende lijst en moet hij gokken.
    // Cap op 8 items zodat de prompt compact blijft bij een grote
    // bulk-import.
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = allItems
      .filter((it) => {
        if (!it.created_at) return false;
        const t = Date.parse(it.created_at);
        return Number.isFinite(t) && t >= thirtyDaysAgo;
      })
      .sort((a, b) => {
        const ta = Date.parse(a.created_at ?? '');
        const tb = Date.parse(b.created_at ?? '');
        return tb - ta;
      })
      .slice(0, 8);
    if (recent.length > 0) {
      const recentLines = recent.map((it) => {
        const date = formatShortDutchDate(it.created_at!);
        const sig = it.is_signature ? ' [signature]' : '';
        return `  - ${it.name}${sig} (toegevoegd ${date})`;
      });
      lines.push(
        `Recent toegevoegd (laatste 30 dagen, nieuwste eerst):\n${recentLines.join('\n')}`,
      );
    }

    return lines.join('\n');
  }

  // ============================================================
  // ACTUEEL, weer / bezetting / reserveringen komende 7 dagen
  // ============================================================
  // Dynamisch deel: wijzigt continu en wordt elke prompt vers
  // opgehaald. Niet cachen.
  // ============================================================
  // FOTO-BIBLIOTHEEK, beschikbare foto's voor Filly's suggesties
  // ============================================================
  // Foto's met description + tags worden bij upload gegenereerd door
  // MediaTaggerService (Haiku Vision). Filly krijgt ze in de context
  // mee zodat 'ie in campagne-voorstellen kan refereren naar een
  // specifieke foto ("voor deze pasta-campagne past foto 3").
  //
  // Cap: 20 foto's (komt overeen met service-cap). Indices [1]-[20]
  // ipv UUIDs in de prompt om tokens te besparen, wij mappen het
  // server-side terug bij accept-flow indien nodig.
  //
  // Bij 0 foto's: lege string. Filly krijgt dan geen FOTO'S-sectie
  // en weet dat 'r geen referenties mogelijk zijn.
  async buildPhotosBlock(restaurantId: string): Promise<string> {
    const { data, error } = await this.supabase.client
      .from('restaurant_media')
      .select('id, description, tags, uploaded_at')
      .eq('restaurant_id', restaurantId)
      .order('uploaded_at', { ascending: false })
      .limit(20);
    if (error) {
      this.logger.warn(`Foto's-blok faalde: ${error.message}`);
      return '';
    }
    if (!data || data.length === 0) return '';

    type Item = {
      id: string;
      description: string | null;
      tags: string[] | null;
    };
    const items = data as Item[];

    const lines = items.map((it, idx) => {
      const num = idx + 1;
      const desc = (it.description ?? '').trim() || '(geen beschrijving)';
      const tags = (it.tags ?? []).join(', ');
      return `[${num}] ${desc}${tags ? `, tags: ${tags}` : ''}`;
    });

    return [
      `FOTO-BIBLIOTHEEK (${items.length} beschikbaar)`,
      'Refereer naar een foto met het nummer tussen blokhaken (bv. "foto [3]") wanneer je een passende foto suggereert voor een campagne. Als geen enkele foto past, suggereer dan geen foto.',
      ...lines,
    ].join('\n');
  }

  async buildLiveBlock(restaurantId: string): Promise<string> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Parallel ophalen. Elke bron heeft zijn eigen catch zodat één
    // falende service (bv. weer zonder coords) niet het hele block
    // laat sneuvelen, Filly ziet dan simpelweg minder data.
    const [occ, weather, reservations] = await Promise.all<
      [Promise<OccupancyDay[]>, Promise<ForecastDay[]>, Promise<Reservation[]>]
    >([
      this.occupancy
        .getMonth(restaurantId, now.getFullYear(), now.getMonth())
        .catch((e) => {
          this.logger.warn(`Occupancy niet beschikbaar: ${String(e)}`);
          return [] as OccupancyDay[];
        }),
      this.weather.getForecastForRestaurant(restaurantId).catch((e) => {
        this.logger.warn(`Weer niet beschikbaar: ${String(e)}`);
        return [] as ForecastDay[];
      }),
      this.reservations.findRange(restaurantId, today, in7days).catch((e) => {
        this.logger.warn(`Reserveringen niet beschikbaar: ${String(e)}`);
        return [] as Reservation[];
      }),
    ]);

    const parts: string[] = [];

    // Datum-referentie bovenaan zodat Filly weet "vandaag" concreet
    // is. Voorkomt dat ze refereert naar "morgen" zonder datum en
    // wij niet kunnen checken of dat klopt.
    parts.push(`Vandaag is ${formatLongDate(now)}.`);

    // Weer: vandaag t/m +3. Meer dan 3 dagen is meestal onnodig voor
    // een chat-vraag en blaast tokens op. Filly kan altijd doorvragen.
    if (weather.length > 0) {
      const weatherLines = weather.slice(0, 4).map((w) => {
        const label = w.dayLabel ?? w.date;
        return `  - ${label} (${w.date}): ${w.description}, ${Math.round(w.tempMin)}–${Math.round(w.tempMax)}°C`;
      });
      parts.push(`Weersverwachting:\n${weatherLines.join('\n')}`);
    }

    // Bezetting: alleen vandaag + komende 6 dagen. De maand hebben we
    // al in geheugen, we filteren op datumbereik.
    const upcomingOcc = occ
      .filter((d) => d.date >= today && d.date <= in7days)
      .slice(0, 7);
    if (upcomingOcc.length > 0) {
      const occLines = upcomingOcc.map(
        (d) =>
          `  - ${d.date}: ${d.occupancy_pct}% bezetting (~${d.estimated_guests} gasten)`,
      );
      parts.push(`Bezetting komende dagen:\n${occLines.join('\n')}`);
    }

    // Reserveringen: alleen totalen noemen. Lijst van namen is privacy-
    // gevoelig en vaak niet relevant voor een chat-vraag. Filly kan
    // vragen of hij namen mag zien.
    if (reservations.length > 0) {
      const todayRes = reservations.filter((r) => r.reservation_date === today);
      parts.push(
        `Reserveringen: ${reservations.length} de komende 7 dagen, waarvan ${todayRes.length} vandaag.`,
      );
    } else {
      parts.push('Reserveringen: geen geregistreerd de komende 7 dagen.');
    }

    return parts.join('\n\n');
  }

  // ============================================================
  // FULL, alle drie blokken samen, voor Filly-features die
  // volledige context nodig hebben (chat, suggesties, refine).
  // ============================================================
  // Volgorde matters: profiel + menu (statisch) komen eerst zodat
  // we ze later kunnen laten cachen door Anthropic prompt-caching.
  // Live-data komt onderaan zodat alleen dat deel "vers" hoeft.
  async buildFullContext(restaurantId: string): Promise<string> {
    const [profile, menu, photos, live] = await Promise.all([
      this.buildProfileBlock(restaurantId).catch((e) => {
        this.logger.warn(`Profiel-blok faalde: ${String(e)}`);
        return '';
      }),
      this.buildMenuBlock(restaurantId).catch((e) => {
        this.logger.warn(`Menu-blok faalde: ${String(e)}`);
        return '';
      }),
      this.buildPhotosBlock(restaurantId).catch((e) => {
        this.logger.warn(`Foto's-blok faalde: ${String(e)}`);
        return '';
      }),
      this.buildLiveBlock(restaurantId).catch((e) => {
        this.logger.warn(`Live-blok faalde: ${String(e)}`);
        return '';
      }),
    ]);

    const blocks = [profile, menu, photos, live].filter((b) => b.length > 0);
    return blocks.join('\n\n---\n\n');
  }

  // Backwards-compat alias: bestaande callers (chat v2) gebruikten
  // buildContextBlock voor alléén de live-data. Behouden zodat we
  // niets breken; nieuwe code roept buildFullContext / buildLiveBlock
  // expliciet aan.
  async buildContextBlock(restaurantId: string): Promise<string> {
    return this.buildLiveBlock(restaurantId);
  }
}

// ============================================================
// Helpers
// ============================================================

// Schrijft datum als "do 24 apr 2026". Korte NL-notatie voelt
// natuurlijker voor Filly's antwoorden dan ISO-strings.
function formatLongDate(d: Date): string {
  return d.toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// "29 apr", korte datum zonder jaartal voor in-line gebruik in lijst-
// context waar het jaar uit de context blijkt. Robuust tegen ongeldig
// input: bij parse-fout valt 't terug op de ruwe string.
function formatShortDutchDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
  });
}

// Lange velden afkappen op zinsgrens om geen tokens te verspillen
// aan onnodige uitweidingen. Knipt op spatie zodat je niet
// midden-in een woord eindigt.
function shorten(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

// €12,50-formaat. Null/0 → lege string zodat we de regel niet
// vervuilen met "€-".
function formatPrice(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || cents <= 0) return '';
  const euros = cents / 100;
  return `€${euros.toLocaleString('nl-NL', {
    minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// Comprimeert opening_hours-jsonb naar één leesbare regel:
//   "ma-vr 11:00-23:00 · za-zo 10:00-23:00 · gesloten op zondag"
// We groeperen aaneengesloten dagen met dezelfde tijden zodat de
// regel kort blijft. Onbekend / leeg / niet-jsonb → null teruggeven
// zodat caller 'm overslaat.
function formatOpeningHours(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return null;
  const h = hours as Record<string, { open?: string; close?: string } | null>;
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const labels: Record<string, string> = {
    mon: 'ma',
    tue: 'di',
    wed: 'wo',
    thu: 'do',
    fri: 'vr',
    sat: 'za',
    sun: 'zo',
  };
  // Bouw lijst van (label, "open-close" | "gesloten")
  const entries: { day: string; slot: string }[] = [];
  for (const k of order) {
    const v = h[k];
    if (!v || !v.open || !v.close) {
      entries.push({ day: labels[k], slot: 'gesloten' });
    } else {
      entries.push({ day: labels[k], slot: `${v.open}-${v.close}` });
    }
  }
  // Aaneengesloten dagen met identieke slots samenvoegen.
  const groups: { from: string; to: string; slot: string }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.slot === e.slot) {
      last.to = e.day;
    } else {
      groups.push({ from: e.day, to: e.day, slot: e.slot });
    }
  }
  const parts = groups.map((g) => {
    const range = g.from === g.to ? g.from : `${g.from}-${g.to}`;
    return `${range} ${g.slot}`;
  });
  return parts.length > 0 ? parts.join(' · ') : null;
}
