"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
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
  const t = useTranslations("dash_google_business_identiteit_page");
  // Aparte translator voor de checklist-builders (eigen namespace); de
  // builders zijn gewone functies en krijgen 't' doorgegeven.
  const tChecklist = useTranslations(
    "dash_google_business_identiteit_components_identiteit_checklist",
  );
  const searchParams = useSearchParams();
  const router = useRouter();
  const subtab = (searchParams.get("subtab") as SubTab) ?? "basics";

  const SUBTABS: { key: SubTab; label: string }[] = [
    { key: "basics", label: t("tabs.basics") },
    { key: "toon", label: t("tabs.toon") },
    { key: "seo", label: t("tabs.seo") },
    { key: "menu", label: t("tabs.menu") },
    { key: "online", label: t("tabs.online") },
  ];

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
      .catch(() => setSaveError(t("errors.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setAnalyzeError(t("analyze.noUrlError"));
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
      setAnalyzeMessage(t("analyze.successMessage"));
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : t("analyze.failed"));
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
      setSaveError(e instanceof Error ? e.message : t("errors.saveFailed"));
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
        <PageHeader title={t("title")} />
        <div style={{ color: "var(--tl)", fontSize: 13, marginTop: 16 }}>
          {t("loading")}
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
            {t("analyze.bannerTitle")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary, #52525B)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            {subsetText} {t("analyze.readsWebsite")}
            {form?.website_url ? (
              <>
                {" "}
                <span style={{ fontWeight: 600 }}>({form.website_url})</span>
              </>
            ) : null}{" "}
            {t("analyze.fillsFields")}
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
                ? t("analyze.buttonTitleEnabled")
                : t("analyze.buttonTitleDisabled")
            }
          >
            {analyzing
              ? t("analyze.buttonLoading")
              : hasWebsite
                ? t("analyze.buttonEnabled")
                : t("analyze.buttonDisabled")}
          </Button>
        </div>
      </div>
    );
  };

  const renderBasics = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {renderAnalyzeBanner(t("analyze.subsetBasics"))}
      <IdentiteitChecklist
        title={t("basics.progressTitle")}
        items={buildBasicsChecklist(form, mediaCount, tChecklist)}
        collapseKey="getfilly_identiteit_basics_collapsed_v1"
      />

      <FormSection
        title={t("basics.restaurantTitle")}
        desc={t("basics.restaurantDesc")}
      >
        <Input
          full
          label={t("basics.nameLabel")}
          value={form.name ?? ""}
          onChange={(e) => update("name", e.target.value)}
        />
        <Input
          full
          label={t("basics.taglineLabel")}
          value={form.tagline ?? ""}
          onChange={(e) => update("tagline", e.target.value || null)}
          placeholder={t("basics.taglinePlaceholder")}
        />
        <Textarea
          full
          label={t("basics.descriptionLabel")}
          value={form.description ?? ""}
          onChange={(e) => update("description", e.target.value || null)}
          placeholder={t("basics.descriptionPlaceholder")}
          rows={4}
        />
        <Input
          full
          label={t("basics.cuisineLabel")}
          value={(form.cuisine_style ?? []).join(", ")}
          onChange={(e) => csvUpdate("cuisine_style", e.target.value)}
          placeholder={t("basics.cuisinePlaceholder")}
          hint={t("basics.cuisineHint")}
        />
      </FormSection>

      <FormSection
        title={t("basics.audienceTitle")}
        desc={t("basics.audienceDesc")}
      >
        <Textarea
          full
          label={t("basics.mainAudienceLabel")}
          value={form.target_audience ?? ""}
          onChange={(e) => update("target_audience", e.target.value || null)}
          placeholder={t("basics.mainAudiencePlaceholder")}
          rows={2}
        />
        <Input
          full
          label={t("basics.audienceSegmentsLabel")}
          value={(form.target_audience_segments ?? []).join(", ")}
          onChange={(e) =>
            csvUpdate("target_audience_segments", e.target.value)
          }
          placeholder={t("basics.audienceSegmentsPlaceholder")}
          hint={t("basics.audienceSegmentsHint")}
        />
      </FormSection>

      <FormSection
        title={t("basics.locationTitle")}
        desc={t("basics.locationDesc")}
      >
        <Textarea
          full
          label={t("basics.locationLabel")}
          value={form.location_description ?? ""}
          onChange={(e) =>
            update("location_description", e.target.value || null)
          }
          placeholder={t("basics.locationPlaceholder")}
          rows={3}
        />
      </FormSection>

      {/* Foto-bibliotheek (verhuisd van de oude Visueel-tab). Heeft
          eigen state + upload-flow in <RestaurantMediaSection />,
          dus we plaatsen 'm hier direct als embedded sectie. */}
      <FormSection
        title={t("basics.photoLibraryTitle")}
        desc={t("basics.photoLibraryDesc")}
      >
        <RestaurantMediaSection />
      </FormSection>

      {/* Branding: logo + brand-kleuren voor mail-templates en
          campagne-grafiek. Inline-velden, voor nu zonder file-upload
          (logo-upload-flow zit in account-pagina; we tonen 'm alleen). */}
      <FormSection
        title={t("basics.brandingTitle")}
        desc={t("basics.brandingDesc")}
      >
        <Input
          full
          label={t("basics.logoUrlLabel")}
          value={form.logo_url ?? ""}
          onChange={(e) =>
            setForm((prev) =>
              prev ? { ...prev, logo_url: e.target.value || null } : prev,
            )
          }
          placeholder="https://..."
          hint={t("basics.logoUrlHint")}
        />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              full
              label={t("basics.primaryColorLabel")}
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
              hint={t("basics.primaryColorHint")}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              full
              label={t("basics.secondaryColorLabel")}
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
              hint={t("basics.secondaryColorHint")}
            />
          </div>
        </div>
      </FormSection>
    </div>
  );

  const renderToon = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {renderAnalyzeBanner(t("analyze.subsetToon"))}
      <IdentiteitChecklist
        title={t("toon.progressTitle")}
        items={buildToonChecklist(form, tChecklist)}
        collapseKey="getfilly_identiteit_toon_collapsed_v1"
      />

      <FormSection
        title={t("toon.atmosphereTitle")}
        desc={t("toon.atmosphereDesc")}
      >
        <Textarea
          full
          label={t("toon.atmosphereLabel")}
          value={form.atmosphere ?? ""}
          onChange={(e) => update("atmosphere", e.target.value || null)}
          placeholder={t("toon.atmospherePlaceholder")}
          rows={3}
        />
      </FormSection>

      <FormSection title={t("toon.toneTitle")} desc={t("toon.toneDesc")}>
        <Textarea
          full
          label={t("toon.toneLabel")}
          value={form.tone_of_voice ?? ""}
          onChange={(e) => update("tone_of_voice", e.target.value || null)}
          placeholder={t("toon.tonePlaceholder")}
          rows={3}
        />
      </FormSection>

      <FormSection
        title={t("toon.brandStoryTitle")}
        desc={t("toon.brandStoryDesc")}
      >
        <Textarea
          full
          label={t("toon.brandStoryLabel")}
          value={form.brand_story ?? ""}
          onChange={(e) => update("brand_story", e.target.value || null)}
          placeholder={t("toon.brandStoryPlaceholder")}
          rows={4}
        />
      </FormSection>

      <FormSection
        title={t("toon.doNotMentionTitle")}
        desc={t("toon.doNotMentionDesc")}
      >
        <Textarea
          full
          label={t("toon.doNotMentionLabel")}
          value={form.do_not_mention ?? ""}
          onChange={(e) => update("do_not_mention", e.target.value || null)}
          placeholder={t("toon.doNotMentionPlaceholder")}
          rows={3}
        />
      </FormSection>

      <FormSection
        title={t("toon.strengthsTitle")}
        desc={t("toon.strengthsDesc")}
      >
        <Textarea
          full
          label={t("toon.uspLabel")}
          value={form.unique_selling_points ?? ""}
          onChange={(e) =>
            update("unique_selling_points", e.target.value || null)
          }
          placeholder={t("toon.uspPlaceholder")}
          rows={3}
        />
        <Input
          full
          label={t("toon.signatureDishesLabel")}
          value={(form.signature_dishes ?? []).join(", ")}
          onChange={(e) => csvUpdate("signature_dishes", e.target.value)}
          placeholder={t("toon.signatureDishesPlaceholder")}
          hint={t("toon.signatureDishesHint")}
        />
        <Input
          full
          label={t("toon.awardsLabel")}
          value={(form.awards ?? []).join(", ")}
          onChange={(e) => csvUpdate("awards", e.target.value)}
          placeholder={t("toon.awardsPlaceholder")}
          hint={t("toon.awardsHint")}
        />
      </FormSection>

      <FormSection title={t("toon.eventsTitle")} desc={t("toon.eventsDesc")}>
        <Textarea
          full
          label={t("toon.eventsLabel")}
          value={form.special_events ?? ""}
          onChange={(e) => update("special_events", e.target.value || null)}
          placeholder={t("toon.eventsPlaceholder")}
          rows={2}
        />
      </FormSection>
    </div>
  );

  const renderSeo = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {renderAnalyzeBanner(t("analyze.subsetSeo"))}
      <IdentiteitChecklist
        title={t("seo.progressTitle")}
        items={buildSeoChecklist(form, tChecklist)}
        collapseKey="getfilly_identiteit_seo_collapsed_v1"
      />

      <FormSection
        title={t("seo.keywordsTitle")}
        desc={t("seo.keywordsDesc")}
      >
        <Input
          full
          label={t("seo.keywordsLabel")}
          value={(form.keywords ?? []).join(", ")}
          onChange={(e) => csvUpdate("keywords", e.target.value)}
          placeholder={t("seo.keywordsPlaceholder")}
          hint={t("seo.keywordsHint")}
        />
      </FormSection>

      <FormSection
        title={t("seo.hashtagsTitle")}
        desc={t("seo.hashtagsDesc")}
      >
        <Input
          full
          label={t("seo.hashtagsLabel")}
          value={(form.default_hashtags ?? []).join(", ")}
          onChange={(e) => csvUpdate("default_hashtags", e.target.value)}
          placeholder={t("seo.hashtagsPlaceholder")}
          hint={t("seo.hashtagsHint")}
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
        title={t("online.websiteTitle")}
        desc={t("online.websiteDesc")}
      >
        <Input
          full
          label={t("online.websiteUrlLabel")}
          type="url"
          value={form.website_url ?? ""}
          onChange={(e) => update("website_url", e.target.value || null)}
          placeholder="https://jouwrestaurant.nl"
        />
        <div style={{ fontSize: 12, color: "var(--tl)" }}>
          {t("online.websiteNote")}
        </div>
      </FormSection>

      <FormSection
        title={t("online.socialTitle")}
        desc={t("online.socialDesc")}
      >
        <Input
          full
          label={t("online.instagramLabel")}
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
          label={t("online.facebookLabel")}
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
          label={t("online.tiktokLabel")}
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
          label={t("online.linkedinLabel")}
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
        {t("backLink")}
      </Link>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

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
            {t("saveBar.changed", { count: dirtyCount })}
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
            {t("saveBar.saveButton")}
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
