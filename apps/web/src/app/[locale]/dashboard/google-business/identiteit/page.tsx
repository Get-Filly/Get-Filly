"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  analyzeRestaurantWebsite,
  fetchRestaurant,
  fetchRestaurantMedia,
  updateRestaurant,
  type Restaurant,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import MenuPage from "../../menu/page";
import { RestaurantMediaSection } from "../../_components/restaurant-media-section";
import {
  IdentiteitChecklist,
  buildBasicsChecklist,
  buildToonChecklist,
  buildSeoChecklist,
} from "./_components/identiteit-checklist";

// ============================================================
// /dashboard/vindbaarheid/identiteit — bron-van-waarheid voor Filly
// ============================================================
// Per 2026-05-21 (Floris-redesign): Identiteit verhuist van
// account-settings (?tab=identiteit) naar de Vindbaarheid-hub als
// eerste blokje. Reden: ALL posts die Filly maakt baseren zich
// op deze velden. Hoort dus thuis bij vindbaarheid (= "hoe word
// ik gevonden + herkend"), niet bij account-instellingen (= wie
// betaalt + welke modules).
//
// Sub-tabs via ?subtab=:
//   - basics   : naam, tagline, beschrijving, cuisine_style, doelgroep
//                + segmenten, locatie-omschrijving
//   - toon     : sfeer, tone-of-voice, brand-story, do_not_mention,
//                USPs, signature dishes, awards, speciale events
//   - seo      : trefwoorden, vaste hashtags
//   - menu     : verwijst voorlopig door naar /dashboard/menu
//                (later refactor naar gedeelde MenuPanel-component)
//   - visueel  : logo, huiskleuren, foto-bibliotheek (verwijst naar
//                bestaande media-sectie op /dashboard/account)
//   - online   : website + Filly-analyse, social handles
//
// Save-strategie:
//   - Form-state in lokale useState; alle wijzigingen verzamelen
//   - Sticky save-bar onderaan toont "X velden gewijzigd"
//   - PATCH /restaurant/me met alleen de gewijzigde velden
//   - Bij succes: refetch + clear dirty-state
//
// List-velden (keywords/hashtags/awards/segments/signature_dishes):
//   - Komma-gescheiden input → array bij save
//   - Trimmen + lege strings filteren

// Per 2026-05-21 (iteratie 2 Floris-feedback): Visueel-tab is
// vervallen. Foto-bibliotheek + branding zijn opgenomen in Basics
// zodat alle "wie ben je"-velden bij elkaar staan. Menu-tab heeft
// nu de volledige menu-omgeving embedded i.p.v. een doorverwijzing.
type SubTab = "basics" | "toon" | "seo" | "menu" | "online";

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "basics", label: "Basis" },
  { key: "toon", label: "Toon" },
  { key: "seo", label: "SEO" },
  { key: "menu", label: "Menu" },
  { key: "online", label: "Online" },
];

// Velden die in deze pagina bewerkbaar zijn. Save-payload wordt
// daaruit gefilterd zodat we geen onbedoelde DB-velden meeschrijven.
type EditableFields =
  | "name"
  | "tagline"
  | "description"
  | "cuisine_style"
  | "target_audience"
  | "target_audience_segments"
  | "location_description"
  | "atmosphere"
  | "tone_of_voice"
  | "brand_story"
  | "do_not_mention"
  | "unique_selling_points"
  | "signature_dishes"
  | "awards"
  | "special_events"
  | "keywords"
  | "default_hashtags"
  | "website_url"
  | "social_media";

function IdentiteitPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subtab = (searchParams.get("subtab") as SubTab) ?? "basics";

  const [form, setForm] = useState<Restaurant | null>(null);
  const [original, setOriginal] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // mediaCount = aantal foto's in de bibliotheek. Voor de Basics-
  // checklist (een check op "minstens 1 foto") hoeven we niet de
  // hele lijst in state te houden — alleen het aantal.
  const [mediaCount, setMediaCount] = useState(0);
  // Filly-analyse-state: trigger op de banner bovenaan basics/toon/seo.
  // Bij succes ververst hij het volledige profiel + zet 'm in form +
  // original zodat het géén dirty-flag triggert (de analyzer-velden
  // komen rechtstreeks van Filly, niet van eigenaar-edit).
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  useEffect(() => {
    // Parallel: profiel + foto-aantal. mediaCount voedt de Basics-
    // checklist (check op "minstens 1 foto"). Fail-soft: media-fetch
    // mag falen zonder de pagina te breken.
    Promise.all([fetchRestaurant(), fetchRestaurantMedia().catch(() => [])])
      .then(([r, media]) => {
        setForm(r);
        setOriginal(r);
        setMediaCount(media.length);
      })
      .catch(() => setSaveError("Kon profiel niet laden."))
      .finally(() => setLoading(false));
  }, []);

  // Helper: lokaal in form-state een veld updaten. Houdt 'original'
  // intact zodat we 'dirty'-detection kunnen doen.
  const update = <K extends EditableFields>(key: K, value: Restaurant[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  // Helper voor komma-gescheiden inputs (keywords/hashtags/etc).
  // Slaat altijd een array op, filtert lege strings, trimt witruimte.
  const csvUpdate = (
    key:
      | "cuisine_style"
      | "keywords"
      | "default_hashtags"
      | "awards"
      | "signature_dishes"
      | "target_audience_segments",
    value: string,
  ) => {
    const arr = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    update(key, arr);
  };

  // Dirty-detection: vergelijk huidige form met snapshot bij load.
  // We tellen alleen velden die deze pagina kan wijzigen (anders
  // zou een unrelated background-update als 'dirty' geregistreerd
  // worden).
  const dirtyCount = (() => {
    if (!form || !original) return 0;
    const keys: EditableFields[] = [
      "name",
      "tagline",
      "description",
      "cuisine_style",
      "target_audience",
      "target_audience_segments",
      "location_description",
      "atmosphere",
      "tone_of_voice",
      "brand_story",
      "do_not_mention",
      "unique_selling_points",
      "signature_dishes",
      "awards",
      "special_events",
      "keywords",
      "default_hashtags",
      "website_url",
      "social_media",
    ];
    let n = 0;
    for (const k of keys) {
      if (JSON.stringify(form[k]) !== JSON.stringify(original[k])) n++;
    }
    return n;
  })();

  // ============================================================
  // Filly-analyse: vult de bestaande identiteit-velden in op basis
  // van de website-URL. Vereist dat er een website-URL is ingevuld.
  // Bij geen URL: laat de user weten dat hij eerst de Online-tab
  // moet invullen i.p.v. silent te falen.
  // ============================================================
  const handleAnalyze = async () => {
    if (!form || analyzing) return;
    if (!form.website_url) {
      setAnalyzeError(
        "Vul eerst je website-URL in op de Online-tab voordat Filly kan analyseren.",
      );
      return;
    }
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeMessage(null);
    try {
      // analyzeRestaurantWebsite() leest de website-URL server-side
      // uit het huidige restaurant + returnt direct het bijgewerkte
      // profiel. We zetten zowel form als original zodat de analyzer-
      // velden NIET als 'dirty' tellen — eigenaar moet alleen z'n
      // eigen aanpassingen als dirty zien.
      const updated = await analyzeRestaurantWebsite();
      setForm(updated);
      setOriginal(updated);
      setAnalyzeMessage("Filly heeft je profiel bijgewerkt. Check elk veld + sla op als je nog wijzigingen doet.");
    } catch (e) {
      setAnalyzeError(
        e instanceof Error
          ? e.message
          : "Filly-analyse mislukt. Probeer opnieuw of vul handmatig in.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!form || dirtyCount === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Bouw payload met alleen gewijzigde velden zodat we niet
      // per ongeluk velden overschrijven die WebsiteAnalyzer parallel
      // heeft ge-update.
      const payload: Partial<Restaurant> = {};
      const keys: EditableFields[] = [
        "name",
        "tagline",
        "description",
        "cuisine_style",
        "target_audience",
        "target_audience_segments",
        "location_description",
        "atmosphere",
        "tone_of_voice",
        "brand_story",
        "do_not_mention",
        "unique_selling_points",
        "signature_dishes",
        "awards",
        "special_events",
        "keywords",
        "default_hashtags",
        "website_url",
        "social_media",
      ];
      for (const k of keys) {
        if (
          form[k] !== undefined &&
          original &&
          JSON.stringify(form[k]) !== JSON.stringify(original[k])
        ) {
          // Type-cast nodig omdat TS de unie niet pikt op generic key.
          (payload as Record<string, unknown>)[k] = form[k];
        }
      }
      const updated = await updateRestaurant(payload);
      setForm(updated);
      setOriginal(updated);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Opslaan mislukt, probeer opnieuw.",
      );
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Loading-state
  // ============================================================
  if (loading || !form) {
    return (
      <div className="page-full">
        <PageHeader title="Identiteit" />
        <div style={{ color: "var(--tl)", fontSize: 13, marginTop: 16 }}>
          Laden…
        </div>
      </div>
    );
  }

  // ============================================================
  // Render-helpers per veld-categorie
  // ============================================================

  // Banner bovenaan basics/toon/seo waarmee eigenaar Filly de
  // velden kan laten invullen op basis van z'n website. Centraal
  // ge-definieerd zodat we de banner consistent renderen op alle
  // drie de tabs. Per-tab subset-tekst geeft de eigenaar context
  // over wat er gevuld gaat worden.
  const renderAnalyzeBanner = (subsetText: string) => {
    const hasWebsite = Boolean(form?.website_url);
    return (
      <div
        style={{
          background: "var(--brand-soft, #EDF3EE)",
          border: "1px solid var(--accent, #1F4A2D)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--accent, #1F4A2D)",
            color: "var(--true-white, #FFFFFF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          F
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text, #18181B)",
              marginBottom: 4,
            }}
          >
            Laat Filly deze velden invullen
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary, #52525B)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            {subsetText} Filly leest je website
            {form?.website_url ? (
              <>
                {" "}<span style={{ fontWeight: 600 }}>({form.website_url})</span>
              </>
            ) : null}{" "}
            en vult de velden hieronder in zodat je niet alles handmatig hoeft te typen.
          </div>
          {analyzeError && (
            <div
              style={{
                fontSize: 12,
                color: "var(--red, #b00)",
                marginBottom: 8,
              }}
            >
              {analyzeError}
            </div>
          )}
          {analyzeMessage && (
            <div
              style={{
                fontSize: 12,
                color: "var(--accent, #1F4A2D)",
                marginBottom: 8,
              }}
            >
              {analyzeMessage}
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleAnalyze}
            loading={analyzing}
            disabled={!hasWebsite || analyzing}
            title={
              hasWebsite
                ? "Filly leest je website en vult de velden hieronder in"
                : "Vul eerst je website-URL in op de Online-tab"
            }
          >
            {analyzing ? "Filly leest…" : hasWebsite ? "Laat Filly invullen" : "Eerst website-URL invullen"}
          </Button>
        </div>
      </div>
    );
  };

  const renderBasics = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {renderAnalyzeBanner(
        "Hier staan je restaurant-naam, beschrijving, doelgroep en locatie.",
      )}
      <IdentiteitChecklist
        title="Voortgang Basis"
        items={buildBasicsChecklist(form, mediaCount)}
        collapseKey="getfilly_identiteit_basics_collapsed_v1"
      />

      <FormSection
        title="Restaurant"
        desc="De basisgegevens die Filly in iedere post nodig heeft."
      >
        <Input
          full
          label="Restaurant-naam"
          value={form.name ?? ""}
          onChange={(e) => update("name", e.target.value)}
        />
        <Input
          full
          label="Tagline (1 zin)"
          value={form.tagline ?? ""}
          onChange={(e) => update("tagline", e.target.value || null)}
          placeholder="Gezellige buurtbistro in hart van Amsterdam"
        />
        <Textarea
          full
          label="Volledige beschrijving"
          value={form.description ?? ""}
          onChange={(e) => update("description", e.target.value || null)}
          placeholder="Vertel uitgebreid over je restaurant, geschiedenis, filosofie..."
          rows={4}
        />
        <Input
          full
          label="Keuken-stijl"
          value={(form.cuisine_style ?? []).join(", ")}
          onChange={(e) => csvUpdate("cuisine_style", e.target.value)}
          placeholder="Italiaans, Mediterraans"
          hint="Komma-gescheiden. Filly gebruikt dit voor toon + thema-suggesties."
        />
      </FormSection>

      <FormSection
        title="Doelgroep"
        desc="Wie Filly aanspreekt in z'n posts. Hoe specifieker, hoe relevanter de tekst."
      >
        <Textarea
          full
          label="Hoofd-doelgroep"
          value={form.target_audience ?? ""}
          onChange={(e) => update("target_audience", e.target.value || null)}
          placeholder="Lokale bewoners, professionals op lunch, families in het weekend..."
          rows={2}
        />
        <Input
          full
          label="Doelgroep-segmenten"
          value={(form.target_audience_segments ?? []).join(", ")}
          onChange={(e) => csvUpdate("target_audience_segments", e.target.value)}
          placeholder="vaste-gasten, nieuwe-gasten, toeristen, professionals"
          hint="Komma-gescheiden. Filly varieert toon en aanbod per segment."
        />
      </FormSection>

      <FormSection
        title="Locatie & buurt"
        desc="Geeft posts lokale verankering. Goed voor SEO én herkenning bij potentiële gasten."
      >
        <Textarea
          full
          label="Locatie-omschrijving"
          value={form.location_description ?? ""}
          onChange={(e) =>
            update("location_description", e.target.value || null)
          }
          placeholder="Hartje Pijp, achter de Albert Cuyp. Omringd door winkels, bars en koffietentjes. Goed bereikbaar met tram 4 (halte Stadhouderskade)."
          rows={3}
        />
      </FormSection>

      {/* Foto-bibliotheek (verhuisd van de oude Visueel-tab). Heeft
          eigen state + upload-flow in <RestaurantMediaSection />,
          dus we plaatsen 'm hier direct als embedded sectie. */}
      <FormSection
        title="Foto-bibliotheek"
        desc="Beelden die Filly mag gebruiken in social-posts en mail-templates. Upload meerdere zodat Filly variatie kan kiezen per campagne."
      >
        <RestaurantMediaSection />
      </FormSection>

      {/* Branding: logo + brand-kleuren voor mail-templates en
          campagne-grafiek. Inline-velden, voor nu zonder file-upload
          (logo-upload-flow zit in account-pagina; we tonen 'm alleen). */}
      <FormSection
        title="Branding"
        desc="Logo en huiskleuren die Filly toepast in mail-templates en visuele uitingen."
      >
        <Input
          full
          label="Logo-URL"
          value={form.logo_url ?? ""}
          onChange={(e) =>
            setForm((prev) =>
              prev ? { ...prev, logo_url: e.target.value || null } : prev,
            )
          }
          placeholder="https://..."
          hint="Direct-link naar je logo (PNG of SVG). Upload-flow komt in volgende ronde."
        />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              full
              label="Hoofdkleur"
              type="text"
              value={form.brand_colors?.primary ?? ""}
              onChange={(e) =>
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        brand_colors: {
                          ...(prev.brand_colors ?? {}),
                          primary: e.target.value || undefined,
                        },
                      }
                    : prev,
                )
              }
              placeholder="#1F4A2D"
              hint="Hex-code (#RRGGBB)."
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              full
              label="Secundaire kleur"
              type="text"
              value={form.brand_colors?.secondary ?? ""}
              onChange={(e) =>
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        brand_colors: {
                          ...(prev.brand_colors ?? {}),
                          secondary: e.target.value || undefined,
                        },
                      }
                    : prev,
                )
              }
              placeholder="#FAF7F1"
              hint="Optioneel."
            />
          </div>
        </div>
      </FormSection>
    </div>
  );

  const renderToon = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {renderAnalyzeBanner(
        "Hier bepalen we de toon van Filly's posts: sfeer, schrijfstijl, brand-story, USP's en awards.",
      )}
      <IdentiteitChecklist
        title="Voortgang Toon"
        items={buildToonChecklist(form)}
        collapseKey="getfilly_identiteit_toon_collapsed_v1"
      />

      <FormSection
        title="Sfeer & interieur"
        desc="De zintuiglijke ervaring die Filly in posts kan oproepen."
      >
        <Textarea
          full
          label="Sfeer + interieur"
          value={form.atmosphere ?? ""}
          onChange={(e) => update("atmosphere", e.target.value || null)}
          placeholder="Warm, intiem, houten interieur, zacht jazzmuziek, kaarslicht 's avonds..."
          rows={3}
        />
      </FormSection>

      <FormSection
        title="Tone-of-voice"
        desc="Hoe Filly schrijft. Bron-van-waarheid; was eerder impliciet uit beschrijving."
      >
        <Textarea
          full
          label="Toon"
          value={form.tone_of_voice ?? ""}
          onChange={(e) => update("tone_of_voice", e.target.value || null)}
          placeholder="Speels-informeel met droge humor. Vermijd corporate. Gebruik je-vorm."
          rows={3}
        />
      </FormSection>

      <FormSection
        title="Brand-story"
        desc="Het verhaal achter het restaurant. Filly verwerkt 't in storytelling-posts."
      >
        <Textarea
          full
          label="Verhaal / filosofie"
          value={form.brand_story ?? ""}
          onChange={(e) => update("brand_story", e.target.value || null)}
          placeholder="Open sinds 1985, derde generatie. We werken alleen met lokale boeren binnen 30 km..."
          rows={4}
        />
      </FormSection>

      <FormSection
        title="Wat doen we niet"
        desc="Voorkomt dat Filly valse beloften maakt in posts of campagnes."
      >
        <Textarea
          full
          label="Anti-claims"
          value={form.do_not_mention ?? ""}
          onChange={(e) => update("do_not_mention", e.target.value || null)}
          placeholder="Geen vegan-opties. Geen take-away. Geen halal-keuken. Geen privé-ruimte."
          rows={3}
        />
      </FormSection>

      <FormSection
        title="Sterke punten"
        desc="USP's en signature dishes die in posts mogen prominent staan."
      >
        <Textarea
          full
          label="Unique selling points"
          value={form.unique_selling_points ?? ""}
          onChange={(e) =>
            update("unique_selling_points", e.target.value || null)
          }
          placeholder="Eigen kruidentuin, open keuken, wekelijks wisselend menu..."
          rows={3}
        />
        <Input
          full
          label="Signature dishes"
          value={(form.signature_dishes ?? []).join(", ")}
          onChange={(e) => csvUpdate("signature_dishes", e.target.value)}
          placeholder="Kalfsstoof, Zeebaars met lenteuitjes"
          hint="Komma-gescheiden. Filly verwerkt deze in campagne-teksten."
        />
        <Input
          full
          label="Awards & certificeringen"
          value={(form.awards ?? []).join(", ")}
          onChange={(e) => csvUpdate("awards", e.target.value)}
          placeholder="Bib Gourmand 2024, BIO-keurmerk, Tripadvisor Travelers' Choice"
          hint="Komma-gescheiden. Filly mag deze als sociale-proof noemen in posts."
        />
      </FormSection>

      <FormSection
        title="Speciale gelegenheden"
        desc="Bv. besloten evenementen, privéruimtes, groepsdiners."
      >
        <Textarea
          full
          label="Events & gelegenheden"
          value={form.special_events ?? ""}
          onChange={(e) => update("special_events", e.target.value || null)}
          placeholder="Verjaardagen, bedrijfslunches, trouwdiners, privéruimte tot 30 personen..."
          rows={2}
        />
      </FormSection>
    </div>
  );

  const renderSeo = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {renderAnalyzeBanner(
        "Hier staan SEO-trefwoorden en vaste hashtags die Filly in elke post probeert te verwerken.",
      )}
      <IdentiteitChecklist
        title="Voortgang SEO"
        items={buildSeoChecklist(form)}
        collapseKey="getfilly_identiteit_seo_collapsed_v1"
      />

      <FormSection
        title="Trefwoorden"
        desc="Woorden die Filly altijd probeert te verwerken in posts. Helpt vindbaarheid in zoekmachines + AI-tools."
      >
        <Input
          full
          label="SEO-trefwoorden"
          value={(form.keywords ?? []).join(", ")}
          onChange={(e) => csvUpdate("keywords", e.target.value)}
          placeholder="duurzaam, seizoen, lokaal, ambachtelijk, italiaans, pijp"
          hint="Komma-gescheiden. Gebruik 5-15 termen die je zaak typeren."
        />
      </FormSection>

      <FormSection
        title="Vaste hashtags"
        desc="Hashtags die automatisch in iedere Instagram/TikTok-post komen."
      >
        <Input
          full
          label="Default hashtags"
          value={(form.default_hashtags ?? []).join(", ")}
          onChange={(e) => csvUpdate("default_hashtags", e.target.value)}
          placeholder="pijpamsterdam, italianocooking, amsterdamfood, instafood"
          hint="Zonder #-teken. Filly voegt 3-5 platform-specifieke hashtags toe per post."
        />
      </FormSection>
    </div>
  );

  // Menu-tab rendert de volledige menu-omgeving inline. MenuPage
  // accepteert sinds 2026-05-21 een embedded-prop die de page-shell
  // (eigen page-full wrapper + PageHeader-titel) skipt zodat de
  // identiteit-pagina-header bovenaan blijft staan en de upload-
  // actie-knoppen inline boven de menu-lijst verschijnen.
  const renderMenu = () => <MenuPage embedded />;

  const renderOnline = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <FormSection
        title="Website"
        desc="Filly leest je website periodiek uit om tone en aanbod up-to-date te houden."
      >
        <Input
          full
          label="Website-URL"
          type="url"
          value={form.website_url ?? ""}
          onChange={(e) => update("website_url", e.target.value || null)}
          placeholder="https://jouwrestaurant.nl"
        />
        <div style={{ fontSize: 12, color: "var(--tl)" }}>
          Volledige website-analyse (auto-invul van tagline, sfeer,
          USP&apos;s) blijft voorlopig beschikbaar via de Account-pagina.
        </div>
      </FormSection>

      <FormSection
        title="Social media"
        desc="Filly verwerkt deze handles in social-campagnes en mail-footers."
      >
        <Input
          full
          label="Instagram"
          value={form.social_media?.instagram ?? ""}
          onChange={(e) =>
            update("social_media", {
              ...(form.social_media ?? {}),
              instagram: e.target.value || "",
            })
          }
          placeholder="@jouwrestaurant"
        />
        <Input
          full
          label="Facebook"
          value={form.social_media?.facebook ?? ""}
          onChange={(e) =>
            update("social_media", {
              ...(form.social_media ?? {}),
              facebook: e.target.value || "",
            })
          }
          placeholder="facebook.com/jouwrestaurant"
        />
        <Input
          full
          label="TikTok"
          value={form.social_media?.tiktok ?? ""}
          onChange={(e) =>
            update("social_media", {
              ...(form.social_media ?? {}),
              tiktok: e.target.value || "",
            })
          }
          placeholder="@jouwrestaurant"
        />
        <Input
          full
          label="LinkedIn"
          value={form.social_media?.linkedin ?? ""}
          onChange={(e) =>
            update("social_media", {
              ...(form.social_media ?? {}),
              linkedin: e.target.value || "",
            })
          }
          placeholder="linkedin.com/company/jouwrestaurant"
        />
      </FormSection>
    </div>
  );

  return (
    <div className="page-full" style={{ paddingBottom: 80 }}>
      <Link
        href="/dashboard/google-business"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--tl)",
          textDecoration: "none",
          marginBottom: 8,
        }}
      >
        ← Terug naar Vindbaarheid
      </Link>
      <PageHeader
        title="Identiteit"
        subtitle="De bron-van-waarheid voor alle posts en campagnes die Filly maakt. Hoe vollediger, hoe persoonlijker en effectiever."
      />

      <Tabs<SubTab>
        items={SUBTABS}
        active={subtab}
        onChange={(t) => router.replace(`?subtab=${t}`)}
      />

      <div style={{ marginTop: 24 }}>
        {subtab === "basics" && renderBasics()}
        {subtab === "toon" && renderToon()}
        {subtab === "seo" && renderSeo()}
        {subtab === "menu" && renderMenu()}
        {subtab === "online" && renderOnline()}
      </div>

      {/* Sticky save-bar — alleen zichtbaar als er iets gewijzigd is.
          Layout volgt de account-page-conventie zodat het visueel
          aanvoelt als één omgeving. */}
      {dirtyCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 220,
            right: 0,
            background: "var(--white, #FFFFFF)",
            borderTop: "1px solid var(--border, #E5DFD0)",
            padding: "12px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            zIndex: 30,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--text)" }}>
            <strong>{dirtyCount}</strong>{" "}
            {dirtyCount === 1 ? "veld" : "velden"} gewijzigd
            {saveError && (
              <span
                style={{
                  color: "var(--red, #b00)",
                  marginLeft: 16,
                  fontSize: 12,
                }}
              >
                {saveError}
              </span>
            )}
          </div>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Wijzigingen opslaan
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FormSection — gedeelde sectie-wrapper voor consistente UI
// ============================================================
// Gebruikt op alle 6 sub-tabs. Heeft titel + (optionele) beschrijving
// en een vertical-flex content-area voor de form-velden zelf.
function FormSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--white, #FFFFFF)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text, #18181B)",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {desc && (
        <div
          style={{
            fontSize: 12,
            color: "var(--tl)",
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          {desc}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

// Next.js 15+: useSearchParams() vereist Suspense-boundary voor prerender.
export default function IdentiteitPage() {
  return (
    <Suspense fallback={null}>
      <IdentiteitPageInner />
    </Suspense>
  );
}
