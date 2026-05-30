import { z } from 'zod';

// ============================================================
// RestaurantUpdateSchema, strikte allowlist voor PATCH /restaurant/me
// ============================================================
//
// Waarom een schema in plaats van handmatig FORBIDDEN_PATCH_FIELDS?
//
//   1. **Allowlist > denylist**: bij een handmatige denylist moet je
//      bij elke nieuwe DB-kolom denken "moet die op de denylist?".
//      Vergeten = klant kan via API z'n eigen `plan` op 'enterprise'
//      zetten. Met `.strict()` op een allowlist gebeurt het tegenovergestelde:
//      een kolom die hier niet staat wordt geweigerd, ook al heeft
//      iemand 'm in de DB toegevoegd.
//
//   2. **Validatie = parsing**: één plek waar én "is dit veld toegestaan?"
//      én "klopt het formaat?" geregeld wordt. Geen gespreide checks.
//
//   3. **Type-veiligheid**: TypeScript leidt automatisch het type af uit
//      het schema (`z.infer<typeof Schema>`). Geen drift mogelijk tussen
//      de input-types en wat we daadwerkelijk valideren.
//
// **Bewust NIET in dit schema** (server-managed of dedicated endpoint):
//   - id, slug, plan         → server-managed / billing-flow
//   - latitude, longitude    → automatisch via geocoding
//   - created_at, updated_at → server-managed
//   - onboarded_at           → eenmalig gezet door OnboardingService
//   - website_last_analyzed_at, website_summary → gezet door
//     WebsiteAnalyzer (tagline, atmosphere, etc. mag eigenaar wél
//     achteraf overschrijven via dit endpoint, maar de meta-velden niet)
//   - target_audience, atmosphere, etc. die WebsiteAnalyzer ook vult
//     mogen eigenaar wél overschrijven (komt straks ook nog uit account-
//     pagina), staan dus wél in dit schema.
//

// ------------------------------------------------------------
// Helpers, herbruikbare validators
// ------------------------------------------------------------

const KVK_RE = /^\d{8}$/; // NL KvK = 8 cijfers
const VAT_RE_NL = /^NL\d{9}B\d{2}$/i; // NL btw-nummer
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Optionele tekst met max-lengte. Lege string ("") of null betekent
// "leegmaken". Trim aan het begin/eind zodat we geen rare whitespace-
// only-velden krijgen.
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max, `Maximaal ${max} tekens.`), z.null()])
    .optional()
    .transform((v) => (typeof v === 'string' && v.length === 0 ? null : v));

// Optionele lijst van strings (cuisine_style, signature_dishes,
// languages_spoken, terrace_sun_periods). Trim per entry, drop lege
// strings, dedupe, max-lengte op de array zelf om wildgroei te voorkomen.
// .nullable() omdat de UI bij "veld leegmaken" expliciet null stuurt
// (bv. terras uitzetten → terrace_sun_periods=null). Zonder dit
// gooit zod een "expected array, received null"-fout.
const optionalStringArray = (maxItems: number, maxItemLength: number) =>
  z
    .array(z.string().trim().max(maxItemLength).min(1))
    .max(maxItems, `Maximaal ${maxItems} entries.`)
    .nullable()
    .optional()
    .transform((arr) =>
      arr === null || arr === undefined ? arr : Array.from(new Set(arr)),
    );

// ------------------------------------------------------------
// Sub-schema's voor jsonb-velden
// ------------------------------------------------------------

// Openingstijden: per dag een open/close-tijd of null (gesloten).
// We zijn bewust permissief, de UI valideert het formaat veel
// stricter en backend hoeft alleen te beschermen tegen kwaadwillig
// invoer. z.record() laat alle dag-keys toe (mon, tue, wo, etc).
const OpeningHoursSchema = z.record(
  z.string(),
  z.union([
    z.object({
      open: z.string().max(10),
      close: z.string().max(10),
    }),
    z.null(),
  ]),
);

// Brand-kleuren: { primary, secondary, accent } maar elke key is
// optioneel. Hex-string check is licht, UI rendert color-picker
// dus formaat is gestandaardiseerd vanuit daar.
const BrandColorsSchema = z.record(
  z.string(),
  z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Kleur moet hex-formaat zijn (#RRGGBB).'),
);

// Social media: { instagram, facebook, tiktok, linkedin } maar
// alle keys optioneel. Waarde is een URL of handle ("@restaurant").
const SocialMediaSchema = z.record(
  z.string(),
  z.string().trim().max(200),
);

// ------------------------------------------------------------
// Service-periods (mig 0038): per-dag ontbijt/lunch/diner-config
// ------------------------------------------------------------
// Shape: { breakfast: { mon: null | {start,end,session_count}, ... }, lunch: ..., dinner: ... }
// - null per dag = service niet actief die dag
// - object = { start: "HH:MM", end: "HH:MM", session_count: 1-4 }
//
// We zijn permissief op het top-level (z.record + z.string) zodat
// toekomstige services (bv. 'late_night', 'brunch') automatisch
// werken zonder schema-update. Dat is gewenst flexibiliteit voor
// pilot-features. De waarde-validatie blijft wel strict.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM 24h

const ServicePeriodDaySchema = z.union([
  z.null(),
  z.object({
    start: z
      .string()
      .regex(TIME_RE, 'Tijd moet formaat HH:MM hebben.'),
    end: z
      .string()
      .regex(TIME_RE, 'Tijd moet formaat HH:MM hebben.'),
    session_count: z
      .number()
      .int()
      .min(1, 'Shifts moet 1-4 zijn.')
      .max(4, 'Shifts moet 1-4 zijn.'),
  }),
]);

const ServicePeriodsSchema = z.record(
  z.string(),
  z.record(z.string(), ServicePeriodDaySchema),
);

// ------------------------------------------------------------
// Hoofd-schema
// ------------------------------------------------------------

export const RestaurantUpdateSchema = z
  .object({
    // ----- Restaurant -----
    name: optionalText(200),
    type: optionalText(50),
    cuisine_style: optionalStringArray(20, 50),
    description: optionalText(2000),

    // ----- Identiteit (door eigenaar of WebsiteAnalyzer ingevuld) -----
    tagline: optionalText(200),
    target_audience: optionalText(500),
    atmosphere: optionalText(500),
    unique_selling_points: optionalText(1000),
    special_events: optionalText(1000),
    signature_dishes: optionalStringArray(20, 100),

    // ----- Identiteit uitbreiding (mig 0044, 2026-05-21) -----
    // Bron-van-waarheid voor Filly's posts. Onderverdeeld in toon,
    // SEO en sociale-proof zodat de prompts gerichter kunnen putten.
    location_description: optionalText(1000),
    keywords: optionalStringArray(30, 60),
    default_hashtags: optionalStringArray(20, 50),
    tone_of_voice: optionalText(500),
    do_not_mention: optionalText(1000),
    brand_story: optionalText(2000),
    awards: optionalStringArray(20, 100),
    target_audience_segments: optionalStringArray(10, 60),

    // ----- Website -----
    website_url: optionalText(500),
    // website_summary mag de eigenaar wel handmatig wijzigen
    // (analyzer schrijft 'm óók maar overschrijft niets bestaand).
    website_summary: optionalText(5000),

    // ----- Locatie -----
    address: optionalText(200),
    postal_code: optionalText(10),
    city: optionalText(100),
    country: optionalText(2),

    // ----- Openingstijden + sluitingsdata -----
    opening_hours: z.union([OpeningHoursSchema, z.null()]).optional(),
    kitchen_closing_time: z.union([OpeningHoursSchema, z.null()]).optional(),
    closed_dates: z.array(z.string()).max(365).optional(),

    // ----- Service-tijden (mig 0038): ontbijt/lunch/diner per dag -----
    // Gebruikt door dashboard week/dag-view + KPI-aggregaten.
    service_periods: z
      .union([ServicePeriodsSchema, z.null()])
      .optional(),

    // ----- Capaciteit + faciliteiten -----
    price_range: z
      .number()
      .int()
      .min(1, 'Prijsklasse moet 1-4 zijn.')
      .max(4, 'Prijsklasse moet 1-4 zijn.')
      .nullable()
      .optional(),
    capacity_seats: z
      .number()
      .int()
      .min(0)
      .max(10000, 'Capaciteit lijkt onrealistisch hoog.')
      .nullable()
      .optional(),
    capacity_terrace: z
      .number()
      .int()
      .min(0)
      .max(10000, 'Terras-capaciteit lijkt onrealistisch hoog.')
      .nullable()
      .optional(),
    has_terrace: z.boolean().optional(),
    has_private_room: z.boolean().optional(),
    has_kids_menu: z.boolean().optional(),
    // Eigenaar-doel voor doordeweekse bezetting (KPI-row). Sinds
    // migratie 0027. Null = gebruik 6-maanden-historie of fallback 68.
    target_weekday_occupancy_pct: z
      .number()
      .int()
      .min(0, 'Doel moet 0-100 zijn.')
      .max(100, 'Doel moet 0-100 zijn.')
      .nullable()
      .optional(),
    terrace_type: z
      .enum(['none', 'open', 'covered', 'coverable'])
      .nullable()
      .optional(),
    terrace_sun_periods: optionalStringArray(10, 50),

    // ----- Talen -----
    languages_spoken: optionalStringArray(20, 10),

    // ----- Branding -----
    brand_tone: z
      .enum(['casual', 'professional', 'playful'])
      .optional(),
    brand_colors: z.union([BrandColorsSchema, z.null()]).optional(),
    logo_url: optionalText(500),

    // ----- Social media -----
    social_media: z.union([SocialMediaSchema, z.null()]).optional(),

    // ----- Bedrijfsgegevens (KvK, BTW, contact) -----
    legal_name: optionalText(200),
    kvk_number: z
      .union([
        z
          .string()
          .trim()
          // Sta toe dat eigenaar 'm met spaties of streepjes invoert.
          .transform((v) => v.replace(/[\s.-]/g, ''))
          .pipe(
            z
              .string()
              .regex(KVK_RE, 'KvK-nummer moet 8 cijfers zijn.')
              .max(8),
          ),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((v) => (v === '' ? null : v)),
    vat_number: z
      .union([
        z
          .string()
          .trim()
          .transform((v) => v.replace(/[\s.-]/g, '').toUpperCase())
          .pipe(
            z
              .string()
              .regex(
                VAT_RE_NL,
                'BTW-nummer moet NL-formaat zijn (NL123456789B01).',
              )
              .max(14),
          ),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((v) => (v === '' ? null : v)),
    contact_email: z
      .union([
        z.string().trim().regex(EMAIL_RE, 'Contact-e-mail lijkt geen geldig adres.'),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((v) => (v === '' ? null : v)),
    contact_phone: z
      .union([
        z
          .string()
          .trim()
          .max(40)
          .refine(
            (v) => v.replace(/\D/g, '').length >= 8,
            'Contact-telefoon lijkt te kort. Gebruik bv. 020-1234567 of +31201234567.',
          ),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((v) => (v === '' ? null : v)),

    // ----- Meldingen-drempels -----
    // Vanaf welke sterren-rating verschijnt een review in de overige-
    // acties-strip op /dashboard/campagnes. Default 3 (mig 0036).
    low_review_threshold: z
      .number()
      .int()
      .min(1, 'Drempel moet 1-5 zijn.')
      .max(5, 'Drempel moet 1-5 zijn.')
      .optional(),
    // Vanaf welk bezetting-percentage telt een dag als "rustig" en
    // verschijnt 'ie in de overige-acties-strip (14 dgn vooruit).
    // Default 50 (mig 0037).
    low_occupancy_threshold: z
      .number()
      .int()
      .min(10, 'Drempel moet 10-100 zijn.')
      .max(100, 'Drempel moet 10-100 zijn.')
      .optional(),

    // ----- Reviews auto-reageren (mig 0051) -----
    // Aan/uit voor Filly's automatische review-reacties.
    reviews_auto_reply_enabled: z.boolean().optional(),
    // 'concept' = ter goedkeuring; 'publish' = zelf plaatsen (vereist
    // GBP OAuth, fase E). We staan beide waarden toe in het schema; de
    // frontend dwingt 'concept' af tot Google gekoppeld is.
    reviews_auto_reply_mode: z.enum(['concept', 'publish']).optional(),
    // Eigen toon voor reviews-reacties; leeg = fallback op tone_of_voice.
    reviews_tone_of_voice: optionalText(500),

    // ----- E-mailinstellingen -----
    email_from_name: optionalText(100),
    email_reply_to: z
      .union([
        z.string().trim().regex(EMAIL_RE, 'Reply-to-adres lijkt geen geldig e-mailadres.'),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((v) => (v === '' ? null : v)),
  })
  // **Default zod-gedrag (.strip)**: keys die NIET in het schema staan
  // worden stilletjes weggegooid (i.p.v. een ZodError zoals .strict()
  // zou doen). Bewuste keuze: de bestaande frontend stuurt bij elke
  // save het complete form-object incl. server-managed velden (id,
  // plan, latitude, etc). Met .strict() zou élke save 400 geven.
  //
  // RestaurantService.update detecteert + logt welke keys gestripped
  // zijn zodat we visibiliteit houden, en bij een nieuwe DB-kolom
  // die per ongeluk in de Restaurant-type belandt zonder schema-update,
  // zien we 't in de logs i.p.v. dat een eigenaar een gat ontdekt.
  //
  // Alternatief voor de toekomst: frontend bouwen om alleen-changed-
  // velden te sturen (PATCH-semantics). Dan kunnen we hier .strict()
  // aanzetten voor harde garantie.
  ;

export type RestaurantUpdateInput = z.infer<typeof RestaurantUpdateSchema>;

// Helper: werp de eerste zod-fout om als BadRequestException-message.
// Gebruikt door de service zodat de UI een nette NL-tekst krijgt
// i.p.v. een ruwe ZodError-stack.
export function firstZodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Ongeldige invoer.';
  // Bij een unknown-key (zod's "unrecognized_keys") geven we een
  // expliciet bericht zodat de eigenaar weet welk veld het probleem was.
  if (issue.code === 'unrecognized_keys') {
    const keys = (issue as unknown as { keys: string[] }).keys ?? [];
    return `Onbekende velden in update: ${keys.join(', ')}.`;
  }
  // Voor de rest: gebruik zod's eigen message + path zodat de UI weet
  // welk veld het was ("legal_name: Maximaal 200 tekens.").
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
