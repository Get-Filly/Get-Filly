"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

// Localstorage-key die de RestaurantContext gebruikt om de actieve
// zaak te onthouden tussen sessies. Bij het toevoegen van een 2e zaak
// (mode=add) zetten we 'm direct na succes zodat de eigenaar in z'n
// nieuwe restaurant landt zonder eerst handmatig te switchen.
const ACTIVE_RESTAURANT_LS_KEY = "getfilly.activeRestaurantId";

// ============================================================
// /onboarding — 3-stappen wizard met Filly-auto-invul
// ============================================================
// Stap 1 (bronnen):
//   - naam + type (verplicht, vangnet als AI-analyse faalt)
//   - website-URL (optioneel)
//   - menukaart upload (optioneel — PDF of foto)
//   - Grote knop "✨ Filly, vul alles in" die beide bronnen parallel
//     analyseert (web-crawl + Vision) en alle velden vult.
//
// Stap 2 (review):
//   Alle profiel-velden in één scrolbaar formulier. Velden die Filly
//   heeft ingevuld krijgen een subtiel badge. User kan alles aanpassen
//   voor het definitief wordt.
//
// Stap 3 (bevestigen):
//   Samenvatting + menu-items-teller → "Naar dashboard".
// ============================================================

type Step = 1 | 2 | 3;

type MenuItem = {
  name: string;
  description?: string;
  price_cents?: number;
  category?: string;
  subcategory?: string;
  allergens?: string[];
};

type DrinkItem = {
  name: string;
  description?: string;
  price_cents?: number;
  // wijn-rood / wijn-wit / bier / cocktail / etc.
  subcategory?: string;
};

type WizardData = {
  // Basics
  name: string;
  type: string;
  // Locatie
  address: string;
  postal_code: string;
  city: string;
  // Branding
  brand_tone: "casual" | "professional" | "playful";
  description: string;
  tagline: string;
  atmosphere: string;
  target_audience: string;
  unique_selling_points: string;
  special_events: string;
  signature_dishes: string;
  cuisine_style: string;
  // Web
  website_url: string;
  website_summary: string;
  // Operationele velden — door WebsiteAnalyzer gevuld als Filly ze
  // op de site vindt. Géén UI-veld in de wizard zelf om 'm kort te
  // houden; eigenaar ziet/bewerkt ze later in /dashboard/account.
  opening_hours: Record<string, { open: string; close: string }> | null;
  contact_email: string;
  contact_phone: string;
  legal_name: string;
  // Social media (gevuld door analyzer)
  social_media: Record<string, string>;
  // Menu
  menu_items: MenuItem[];
  // Drankkaart (parallelle upload). Server-side category='drank'.
  drink_items: DrinkItem[];
  // Google Business Profile (fase B). Filly stelt na website-analyse
  // automatisch een match voor; eigenaar bevestigt/wijzigt/skipt in
  // stap 2. Bij submit gaat alleen google_place_id mee naar de
  // backend; google_place_match is UI-only state voor de preview-card.
  google_place_id: string | null;
  google_place_match: {
    placeId: string;
    displayName: string;
    formattedAddress: string;
    rating: number | null;
    userRatingCount: number | null;
  } | null;
};

const TYPE_OPTIONS = [
  { value: "bistro", label: "Bistro" },
  { value: "brasserie", label: "Brasserie" },
  { value: "fine_dining", label: "Fine dining" },
  { value: "trattoria", label: "Trattoria" },
  { value: "café", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "hotel_restaurant", label: "Hotel-restaurant" },
  { value: "event_locatie", label: "Event-locatie" },
  { value: "anders", label: "Anders" },
];

const TONE_OPTIONS: Array<{
  value: WizardData["brand_tone"];
  label: string;
  hint: string;
}> = [
  {
    value: "casual",
    label: "Gemoedelijk",
    hint: "Warm, toegankelijk, niet stoffig",
  },
  {
    value: "professional",
    label: "Professioneel",
    hint: "Zakelijk, strak, hogere prijsklasse",
  },
  {
    value: "playful",
    label: "Speels",
    hint: "Creatief, met knipoog, jonger publiek",
  },
];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

const INITIAL_DATA: WizardData = {
  name: "",
  type: "",
  address: "",
  postal_code: "",
  city: "",
  brand_tone: "casual",
  description: "",
  tagline: "",
  atmosphere: "",
  target_audience: "",
  unique_selling_points: "",
  special_events: "",
  signature_dishes: "",
  cuisine_style: "",
  website_url: "",
  website_summary: "",
  opening_hours: null,
  contact_email: "",
  contact_phone: "",
  legal_name: "",
  social_media: {},
  menu_items: [],
  drink_items: [],
  google_place_id: null,
  google_place_match: null,
};

// De inhoud zelf — gebruikt useSearchParams() en moet daarom binnen
// een <Suspense>-boundary leven. Next.js's static-prerender draait
// anders tegen "missing-suspense-with-csr-bailout" tijdens `next build`.
// De default-export hieronder doet de wrap; deze functie houdt alle
// wizard-logica.
function OnboardingPageContent() {
  const router = useRouter();
  // Detecteer of dit de eerste-keer-onboarding is (geen flag) of een
  // bestaande eigenaar die een 2e/3e zaak toevoegt (?mode=add). Beide
  // gebruiken dezelfde wizard-content; alleen kop, redirect-target en
  // afsluit-knop verschillen. Default = false zodat een afwijkende
  // querystring nooit per ongeluk add-mode triggert.
  const searchParams = useSearchParams();
  const isAddMode = searchParams.get("mode") === "add";
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [menuFile, setMenuFile] = useState<File | null>(null);
  // Drankkaart als aparte upload — meeste horeca scheidt menu en
  // drank fysiek, en de Vision-prompt is anders (subcategorie
  // wijn-rood/bier/cocktail/etc).
  const [drinksFile, setDrinksFile] = useState<File | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeConfidence, setAnalyzeConfidence] = useState<
    "high" | "medium" | "low" | null
  >(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stap 1 is verplicht — naam + type moeten ingevuld zijn om door te kunnen.
  const canContinueFromStep1 =
    data.name.trim().length >= 2 && data.type.length > 0;

  // Draait beide analyses parallel: website-crawl + menu-Vision.
  // Vult alleen lege velden zodat handmatige invul niet overschreven wordt.
  const analyzeAll = async () => {
    const url = data.website_url.trim();
    if (!url && !menuFile && !drinksFile) {
      setAnalyzeError(
        "Vul een website-URL in of upload een menu/drankkaart, anders heeft Filly niks om te lezen.",
      );
      return;
    }

    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeConfidence(null);
    setAnalyzeStatus("Filly maakt zich klaar…");

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const websitePromise = url
        ? (async () => {
            setAnalyzeStatus("Filly leest je website…");
            const res = await fetch(`${API_URL}/onboarding/analyze-website`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ url }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.message ?? `website HTTP ${res.status}`);
            }
            return res.json();
          })()
        : Promise.resolve(null);

      const menuPromise = menuFile
        ? (async () => {
            setAnalyzeStatus("Filly bekijkt je menukaart…");
            const form = new FormData();
            form.append("file", menuFile);
            const res = await fetch(`${API_URL}/onboarding/analyze-menu`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.message ?? `menu HTTP ${res.status}`);
            }
            return res.json();
          })()
        : Promise.resolve(null);

      const drinksPromise = drinksFile
        ? (async () => {
            setAnalyzeStatus("Filly bekijkt je drankkaart…");
            const form = new FormData();
            form.append("file", drinksFile);
            const res = await fetch(`${API_URL}/onboarding/analyze-drinks`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.message ?? `drinks HTTP ${res.status}`);
            }
            return res.json();
          })()
        : Promise.resolve(null);

      const [websiteResult, menuResult, drinksResult] = await Promise.all([
        websitePromise,
        menuPromise,
        drinksPromise,
      ]);

      // Merge website-resultaat in wizard-data (niet-lege velden respecteren).
      if (websiteResult) {
        setData((prev) => ({
          ...prev,
          name: prev.name.trim() || websiteResult.name || prev.name,
          type: prev.type || websiteResult.type || prev.type,
          address: prev.address.trim() || websiteResult.address || prev.address,
          postal_code:
            prev.postal_code.trim() ||
            websiteResult.postal_code ||
            prev.postal_code,
          city: prev.city.trim() || websiteResult.city || prev.city,
          description:
            prev.description.trim() ||
            websiteResult.description ||
            prev.description,
          tagline: prev.tagline.trim() || websiteResult.tagline || prev.tagline,
          atmosphere:
            prev.atmosphere.trim() ||
            websiteResult.atmosphere ||
            prev.atmosphere,
          target_audience:
            prev.target_audience.trim() ||
            websiteResult.target_audience ||
            prev.target_audience,
          unique_selling_points:
            prev.unique_selling_points.trim() ||
            websiteResult.unique_selling_points ||
            prev.unique_selling_points,
          special_events:
            prev.special_events.trim() ||
            websiteResult.special_events ||
            prev.special_events,
          signature_dishes:
            prev.signature_dishes.trim() ||
            (Array.isArray(websiteResult.signature_dishes)
              ? websiteResult.signature_dishes.join(", ")
              : "") ||
            prev.signature_dishes,
          cuisine_style:
            prev.cuisine_style.trim() ||
            (Array.isArray(websiteResult.cuisine_style)
              ? websiteResult.cuisine_style.join(", ")
              : "") ||
            prev.cuisine_style,
          website_summary:
            prev.website_summary.trim() ||
            websiteResult.website_summary ||
            prev.website_summary,
          brand_tone: websiteResult.brand_tone ?? prev.brand_tone,
          // Operationele velden — alleen overnemen als Filly ze vond
          // én de wizard ze nog niet leeg heeft (geen overschrijven van
          // wat de eigenaar zelf invulde).
          opening_hours:
            prev.opening_hours ?? websiteResult.opening_hours ?? null,
          contact_email:
            prev.contact_email.trim() ||
            websiteResult.contact_email ||
            prev.contact_email,
          contact_phone:
            prev.contact_phone.trim() ||
            websiteResult.contact_phone ||
            prev.contact_phone,
          legal_name:
            prev.legal_name.trim() ||
            websiteResult.legal_name ||
            prev.legal_name,
          // Social handles uit analyzer als de wizard er nog geen heeft.
          social_media: {
            ...(websiteResult.social_media ?? {}),
            ...prev.social_media,
          },
          // Filly's Google-match (kan null zijn als Places niks vond
          // of er geen naam was om mee te zoeken). Auto-select de top-1
          // match: google_place_id wordt direct gezet zodat 'klaar'-pad
          // gewoon doorgaat. Eigenaar kan in stap 2 overslaan of
          // wijzigen — dan wordt 'ie weer null.
          google_place_match: websiteResult.place_match ?? null,
          google_place_id: websiteResult.place_match?.placeId ?? null,
        }));
      }

      if (menuResult && Array.isArray(menuResult.items)) {
        setData((prev) => ({ ...prev, menu_items: menuResult.items }));
      }

      if (drinksResult && Array.isArray(drinksResult.items)) {
        // Items uit Vision zonder category-veld — backend dwingt
        // category='drank' af bij de uiteindelijke insert. Wij slaan
        // alleen de drank-relevante velden hier op.
        const items: DrinkItem[] = drinksResult.items.map(
          (it: {
            name: string;
            description?: string;
            price_cents?: number;
            subcategory?: string;
          }) => ({
            name: it.name,
            description: it.description,
            price_cents: it.price_cents,
            subcategory: it.subcategory,
          }),
        );
        setData((prev) => ({ ...prev, drink_items: items }));
      }

      // Confidence: als bronnen een score gaven, toon de laagste.
      const scores = [
        websiteResult?.confidence,
        menuResult?.confidence,
        drinksResult?.confidence,
      ].filter(Boolean);
      if (scores.includes("low")) setAnalyzeConfidence("low");
      else if (scores.includes("medium")) setAnalyzeConfidence("medium");
      else if (scores.length > 0) setAnalyzeConfidence("high");

      setAnalyzeStatus(null);
    } catch (e) {
      console.error(e);
      setAnalyzeError(
        e instanceof Error
          ? e.message
          : "Filly kon niet lezen. Probeer nog eens of vul handmatig in.",
      );
      setAnalyzeStatus(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${API_URL}/onboarding/restaurant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({
          name: data.name.trim(),
          type: data.type,
          address: data.address.trim() || undefined,
          postal_code: data.postal_code.trim() || undefined,
          city: data.city.trim() || undefined,
          brand_tone: data.brand_tone,
          description: data.description.trim() || undefined,
          tagline: data.tagline.trim() || undefined,
          atmosphere: data.atmosphere.trim() || undefined,
          target_audience: data.target_audience.trim() || undefined,
          unique_selling_points:
            data.unique_selling_points.trim() || undefined,
          special_events: data.special_events.trim() || undefined,
          signature_dishes: splitToArray(data.signature_dishes),
          cuisine_style: splitToArray(data.cuisine_style),
          website_url: data.website_url.trim() || undefined,
          website_summary: data.website_summary.trim() || undefined,
          // Operationele velden door analyzer gevuld. Alleen meesturen
          // als ze daadwerkelijk waarde hebben — undefined → backend
          // zet ze op null.
          opening_hours:
            data.opening_hours &&
            Object.keys(data.opening_hours).length > 0
              ? data.opening_hours
              : undefined,
          contact_email: data.contact_email.trim() || undefined,
          contact_phone: data.contact_phone.trim() || undefined,
          legal_name: data.legal_name.trim() || undefined,
          social_media:
            Object.keys(data.social_media).length > 0
              ? data.social_media
              : undefined,
          menu_items: data.menu_items,
          drink_items: data.drink_items,
          // Optioneel — alleen meesturen als eigenaar Filly's match
          // heeft bevestigd of zelf een place heeft gekozen. Bij
          // 'sla over' is dit null en doet de backend niks.
          google_place_id: data.google_place_id ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      // Response bevat nu ook `menuImport` met status van de menu-insert.
      // Als die gevuld is met een error, is het restaurant wél aangemaakt
      // maar zijn de menu-items niet geland — waarschuwen zodat user niet
      // denkt dat alles werkte.
      type ImportStatus = {
        attempted: number;
        inserted: number;
        error: string | null;
      };
      const result = (await res.json()) as {
        restaurantId: string;
        menuImport?: ImportStatus | null;
        drinkImport?: ImportStatus | null;
      };
      const { restaurantId, menuImport, drinkImport } = result;

      if (typeof window !== "undefined" && restaurantId) {
        try {
          window.localStorage.setItem(
            ACTIVE_RESTAURANT_LS_KEY,
            restaurantId,
          );
        } catch {
          // negeer privé-modus
        }
      }

      // Menu-import mislukt? Waarschuw de user vóór de redirect. Niet
      // blokkerend: restaurant is bruikbaar, menu kan later opnieuw
      // via de menu-pagina. Zonder deze alert zou de user niet weten
      // dat z'n menu ontbreekt tot hij de menu-pagina leeg ziet.
      if (menuImport && menuImport.error) {
        alert(
          `Je restaurant is aangemaakt, maar het importeren van ${menuImport.attempted} menu-item(s) mislukte:\n\n${menuImport.error}\n\nJe kunt je menukaart later opnieuw uploaden via de menu-pagina.`,
        );
      }

      if (drinkImport && drinkImport.error) {
        alert(
          `Je restaurant is aangemaakt, maar het importeren van ${drinkImport.attempted} drank-item(s) mislukte:\n\n${drinkImport.error}\n\nJe kunt je drankkaart later opnieuw uploaden via de menu-pagina.`,
        );
      }

      // Add-mode: harde reload nodig zodat de RestaurantContext + alle
      // dashboard-pagina's vers mounten voor de nieuwe tenant. Een
      // soft router.push houdt useEffect-gefetchte data van het oude
      // restaurant in client-state hangen — zelfde issue als bij de
      // workspace-switcher in sidebar.tsx (zie comment daar over
      // window.location.reload).
      // First-time mode: soft push is genoeg, er is nog geen oude
      // tenant-state om weg te flushen.
      if (isAddMode) {
        window.location.assign("/dashboard");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Opslaan mislukt. Probeer nog eens.",
      );
      setSubmitting(false);
    }
  };

  // Logout vanaf onboarding. Eigenaar zit nog niet vast in een
  // restaurant, dus signOut + redirect naar /login is genoeg —
  // wizard-state gaat verloren maar de eigenaar kan opnieuw starten
  // bij volgende login. Geen confirm-dialog; "Uitloggen" is een
  // bewuste klik die meteen mag werken.
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <section className="login-section">
      <div className="login-box" style={{ maxWidth: 560 }}>
        {/* Header-rij met progress-bar links en logout-knop rechts.
            Eigenaar moet altijd kunnen stoppen; zonder deze knop zit
            'ie vast tot ie alle stappen heeft afgerond. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background:
                    s <= step
                      ? "var(--brand, #1F4A2D)"
                      : "var(--border, #e5e5e5)",
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>
          {/* In add-mode toont de eigenaar geen "Uitloggen" maar
              "Annuleren" — terug naar zijn bestaande dashboard zonder
              wizard-state te bewaren. Uitloggen heeft geen zin: hij is
              al ingelogd én heeft al een actief restaurant. */}
          {isAddMode ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--tl, #6B6F71)",
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 8px",
                whiteSpace: "nowrap",
              }}
              title="Terug naar dashboard zonder restaurant toe te voegen"
            >
              Annuleren
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--tl, #6B6F71)",
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 8px",
                whiteSpace: "nowrap",
              }}
              title="Uitloggen en later verder gaan"
            >
              Uitloggen
            </button>
          )}
        </div>

        {/* Add-mode-banner: maakt direct duidelijk dat de eigenaar bezig
            is met een nieuwe zaak, niet de eerste-keer-onboarding. Bewust
            géén apart "Welkom"-blok — dat zou misleidend zijn voor een
            bestaande klant. */}
        {isAddMode && (
          <div
            style={{
              marginBottom: 20,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--brand-soft, #EDF2EE)",
              color: "var(--brand, #1F4A2D)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Nieuwe zaak toevoegen.</strong> Doorloop de wizard
            opnieuw. Na succes word je automatisch in de nieuwe zaak
            geplaatst — wisselen tussen je zaken kan via het account-
            menu linksboven.
          </div>
        )}

        {step === 1 && (
          <Step1Sources
            data={data}
            setData={setData}
            menuFile={menuFile}
            setMenuFile={setMenuFile}
            drinksFile={drinksFile}
            setDrinksFile={setDrinksFile}
            analyzing={analyzing}
            analyzeStatus={analyzeStatus}
            analyzeError={analyzeError}
            analyzeConfidence={analyzeConfidence}
            onAnalyze={analyzeAll}
            onNext={() => setStep(2)}
            canContinue={canContinueFromStep1}
          />
        )}

        {step === 2 && (
          <Step2Review
            data={data}
            setData={setData}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3Confirm
            data={data}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </section>
  );
}

// ============================================================
// Stap 1 — Bronnen + Filly-analyse
// ============================================================
function Step1Sources({
  data,
  setData,
  menuFile,
  setMenuFile,
  drinksFile,
  setDrinksFile,
  analyzing,
  analyzeStatus,
  analyzeError,
  analyzeConfidence,
  onAnalyze,
  onNext,
  canContinue,
}: {
  data: WizardData;
  setData: React.Dispatch<React.SetStateAction<WizardData>>;
  menuFile: File | null;
  setMenuFile: (f: File | null) => void;
  drinksFile: File | null;
  setDrinksFile: (f: File | null) => void;
  analyzing: boolean;
  analyzeStatus: string | null;
  analyzeError: string | null;
  analyzeConfidence: "high" | "medium" | "low" | null;
  onAnalyze: () => void;
  onNext: () => void;
  canContinue: boolean;
}) {
  return (
    <>
      <div className="login-title">Laten we je zaak instellen</div>
      <p className="login-sub">
        Geef Filly een website of menukaart dan vult hij alvast je hele
        profiel in. Je kunt alles nog aanpassen in de volgende stap.
      </p>

      <div className="form-group">
        <label className="form-label">
          Naam van de zaak{" "}
          <span style={{ color: "var(--tl, #6B6B6B)" }}>(verplicht)</span>
        </label>
        <input
          className="form-input"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          placeholder="Bistro Centraal"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Type zaak{" "}
          <span style={{ color: "var(--tl, #6B6B6B)" }}>(verplicht)</span>
        </label>
        <select
          className="form-input"
          value={data.type}
          onChange={(e) => setData({ ...data, type: e.target.value })}
        >
          <option value="">Kies een type…</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid #eee", margin: "20px 0" }} />

      <div className="form-group">
        <label className="form-label">Website van je zaak</label>
        <input
          className="form-input"
          type="url"
          value={data.website_url}
          onChange={(e) => setData({ ...data, website_url: e.target.value })}
          placeholder="https://jouwrestaurant.nl"
          disabled={analyzing}
        />
      </div>

      {/* Twee nette upload-cards naast elkaar (op desktop) of onder
          elkaar (mobile). Vervangt de oude rauwe <input type="file">-
          weergave die er anders uitziet per browser. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <UploadCard
          label="Menukaart"
          file={menuFile}
          onFileChange={setMenuFile}
          disabled={analyzing}
        />
        <UploadCard
          label="Drankkaart"
          subLabel="optioneel"
          file={drinksFile}
          onFileChange={setDrinksFile}
          disabled={analyzing}
        />
      </div>

      {/* 'Filly, vul alles in' is altijd zichtbaar zoals 'Volgende',
          zodat de eigenaar direct ziet dat de optie er is. Twee states
          visueel:
            - geen input én niet bezig → lichtgroen + disabled
            - heeft input (URL of file) → donker-groen + clickable
            - bezig met analyseren → lichtgroen + status-tekst
          Hierdoor "fadet" de knop visueel in zodra er iets te analyseren
          is — duidelijke uitnodiging zonder uitleg-tekst. */}
      {(() => {
        const hasInput =
          data.website_url.trim().length > 0 || !!menuFile || !!drinksFile;
        const isActive = hasInput && !analyzing;
        return (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!hasInput || analyzing}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              background: isActive
                ? "var(--brand, #1F4A2D)"
                : "var(--brand-soft, #eef3ee)",
              color: isActive ? "#fff" : "var(--brand, #1F4A2D)",
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: isActive ? "pointer" : "default",
              marginTop: 16,
            }}
          >
            {analyzing
              ? analyzeStatus ?? "Filly is bezig…"
              : "Filly, vul alles in"}
          </button>
        );
      })()}

      {analyzeConfidence && !analyzing && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 6,
            background: "var(--brand-soft, #eef3ee)",
            border: "1px solid var(--brand, #1F4A2D)",
            color: "var(--brand, #1F4A2D)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>Filly heeft je profiel ingevuld.</strong>{" "}
          {analyzeConfidence === "high"
            ? "Ze was hier zeker van. Check in stap 2."
            : analyzeConfidence === "medium"
              ? "Redelijk beeld — loop het even na in stap 2."
              : "Weinig vaste info gevonden; vul aan in stap 2."}
          {data.menu_items.length > 0 && (
            <div style={{ marginTop: 4 }}>
              Menu: <strong>{data.menu_items.length}</strong> gerechten gelezen.
            </div>
          )}
          {data.drink_items.length > 0 && (
            <div style={{ marginTop: 4 }}>
              Drankkaart: <strong>{data.drink_items.length}</strong> drankjes gelezen.
            </div>
          )}
        </div>
      )}

      {analyzeError && !analyzing && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 6,
            background: "var(--red-soft, #fee)",
            color: "var(--red, #b00)",
            fontSize: 12,
          }}
        >
          {analyzeError}
        </div>
      )}

      {/* .login-btn heeft ingebouwde margin-top:24px in globals.css —
          die overriden we hier inline naar 16px zodat de gap gelijk
          is aan die boven de Filly-knop. Geen wrapper-div nodig. */}
      <button
        className="login-btn"
        onClick={onNext}
        disabled={!canContinue || analyzing}
        type="button"
        style={{ marginTop: 16 }}
      >
        Volgende
      </button>
    </>
  );
}

// ============================================================
// Stap 2 — Review alle velden
// ============================================================
function Step2Review({
  data,
  setData,
  onBack,
  onNext,
}: {
  data: WizardData;
  setData: React.Dispatch<React.SetStateAction<WizardData>>;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="login-title">Check en pas aan</div>
      <p className="login-sub">
        Dit is wat we weten. Alles is later nog aanpasbaar via je account —
        maar als je hier iets ziet dat niet klopt, fix het nu.
      </p>

      <Field
        label="Omschrijving"
        value={data.description}
        onChange={(v) => setData({ ...data, description: v })}
        multiline
        rows={3}
        placeholder="Wat voor zaak is het, in 2-3 zinnen?"
      />
      <Field
        label="Pay-off / tagline"
        value={data.tagline}
        onChange={(v) => setData({ ...data, tagline: v })}
        placeholder="Korte slagzin, bv. 'Franse keuken in hart van de Jordaan'"
      />
      <Field
        label="Sfeer"
        value={data.atmosphere}
        onChange={(v) => setData({ ...data, atmosphere: v })}
        multiline
        rows={2}
        placeholder="Hoe voelt de zaak? Klein en intiem, levendig, familiair…"
      />
      <Field
        label="Doelgroep"
        value={data.target_audience}
        onChange={(v) => setData({ ...data, target_audience: v })}
        multiline
        rows={2}
        placeholder="Voor wie is jullie zaak het meest?"
      />
      <Field
        label="Wat maakt jullie uniek"
        value={data.unique_selling_points}
        onChange={(v) => setData({ ...data, unique_selling_points: v })}
        multiline
        rows={2}
        placeholder="3-5 dingen waar jullie in uitblinken"
      />
      <Field
        label="Terugkerende evenementen"
        value={data.special_events}
        onChange={(v) => setData({ ...data, special_events: v })}
        placeholder="Wijnavonden, live muziek, brunches…"
      />
      <Field
        label="Signature-gerechten"
        value={data.signature_dishes}
        onChange={(v) => setData({ ...data, signature_dishes: v })}
        placeholder="Komma-gescheiden: Kalfsstoof, Citroen-tiramisu, …"
      />
      <Field
        label="Keukenstijl"
        value={data.cuisine_style}
        onChange={(v) => setData({ ...data, cuisine_style: v })}
        placeholder="Komma-gescheiden: frans, seizoensgebonden, …"
      />

      <GooglePlaceMatchSection data={data} setData={setData} />

      <Field
        label="Straat en huisnummer"
        value={data.address}
        onChange={(v) => setData({ ...data, address: v })}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ width: 130 }}>
          <Field
            label="Postcode"
            value={data.postal_code}
            onChange={(v) => setData({ ...data, postal_code: v })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Field
            label="Stad"
            value={data.city}
            onChange={(v) => setData({ ...data, city: v })}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Toon</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TONE_OPTIONS.map((opt) => {
            const active = data.brand_tone === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setData({ ...data, brand_tone: opt.value })}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  border: active
                    ? "2px solid var(--brand, #1F4A2D)"
                    : "1px solid var(--border, #ddd)",
                  borderRadius: 8,
                  background: active
                    ? "var(--brand-soft, #eef3ee)"
                    : "var(--surface, #fff)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: active ? "var(--brand, #1F4A2D)" : "var(--text)",
                  }}
                >
                  {opt.label}
                </div>
                <div style={{ fontSize: 12, color: "var(--tl, #6B6B6B)" }}>
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {data.menu_items.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "var(--surface-soft, #f7f5ef)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Menu: {data.menu_items.length} gerechten
          </div>
          <div style={{ fontSize: 12, color: "var(--tl, #6B6B6B)" }}>
            Filly heeft ze uit je menukaart gelezen. Je kunt ze later
            bewerken op de menu-pagina.
          </div>
        </div>
      )}

      {data.drink_items.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: "var(--surface-soft, #f7f5ef)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Drankkaart: {data.drink_items.length} drankjes
          </div>
          <div style={{ fontSize: 12, color: "var(--tl, #6B6B6B)" }}>
            Gegroepeerd op type (wijn-rood/wit/rosé/mousserend, bier,
            cocktail, sterke drank, koffie, fris).
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button className="sg-btn" onClick={onBack} type="button">
          Terug
        </button>
        <button
          className="login-btn"
          onClick={onNext}
          type="button"
          style={{ flex: 1 }}
        >
          Volgende — bevestigen
        </button>
      </div>
    </>
  );
}

// ============================================================
// Stap 3 — Bevestigen
// ============================================================
function Step3Confirm({
  data,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  data: WizardData;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <>
      <div className="login-title">Klaar om te starten</div>
      <p className="login-sub">
        We maken je restaurant aan met deze gegevens. Alles is straks
        bewerkbaar via je account.
      </p>

      <div
        style={{
          background: "var(--surface-soft, #f7f5ef)",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <Row label="Naam" value={data.name} />
        <Row
          label="Type"
          value={
            TYPE_OPTIONS.find((t) => t.value === data.type)?.label ?? data.type
          }
        />
        {data.address && <Row label="Adres" value={data.address} />}
        {(data.postal_code || data.city) && (
          <Row
            label="Postcode / Stad"
            value={[data.postal_code, data.city].filter(Boolean).join(" ")}
          />
        )}
        {data.website_url && <Row label="Website" value={data.website_url} />}
        {data.tagline && <Row label="Tagline" value={data.tagline} />}
        <Row
          label="Toon"
          value={
            TONE_OPTIONS.find((t) => t.value === data.brand_tone)?.label ?? ""
          }
        />
        {data.description && (
          <Row label="Omschrijving" value={data.description} multiline />
        )}
        {data.menu_items.length > 0 && (
          <Row
            label="Menu"
            value={`${data.menu_items.length} gerechten geïmporteerd`}
          />
        )}
      </div>

      {error && (
        <div className="auth-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="sg-btn"
          onClick={onBack}
          type="button"
          disabled={submitting}
        >
          Terug
        </button>
        <button
          className="login-btn"
          onClick={onSubmit}
          type="button"
          disabled={submitting}
          style={{ flex: 1 }}
        >
          {submitting ? "Bezig…" : "Naar dashboard"}
        </button>
      </div>
    </>
  );
}

// ============================================================
// Kleine sub-componenten
// ============================================================

/**
 * <UploadCard> — gestileerde file-upload-tegel voor menu + drankkaart
 *
 * Vervangt sinds 2026-05-06 de rauwe <input type="file"> die per
 * browser anders renderde. Twee staten:
 *   - leeg: dropzone-stijl met "Bestand kiezen"-knop + hint-tekst
 *   - geüpload: groene check + filename + size + "Vervangen"-link
 *
 * Native click-via-label-pattern: hidden input + label that proxies
 * de click. Werkt zonder JavaScript-tricks en met keyboard-focus.
 */
function UploadCard({
  label,
  subLabel,
  file,
  onFileChange,
  disabled,
}: {
  label: string;
  subLabel?: string;
  file: File | null;
  onFileChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputId = `upload-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const isUploaded = !!file;

  return (
    <div
      style={{
        position: "relative",
        padding: 14,
        borderRadius: 10,
        border: `1.5px ${isUploaded ? "solid" : "dashed"} ${
          isUploaded ? "var(--brand, #1F4A2D)" : "var(--bl, #E0E0E0)"
        }`,
        backgroundColor: isUploaded ? "#F0F7F2" : "var(--surface, #FAF7F1)",
        transition: "border-color 120ms ease, background-color 120ms ease",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Hidden file-input — gekoppeld aan de label hieronder via htmlFor */}
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        disabled={disabled}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--text, #1A1A1A)",
          }}
        >
          {label}
        </span>
        {subLabel && (
          <span
            style={{
              fontSize: 11,
              color: "var(--tl, #6B6B6B)",
              fontWeight: 400,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {subLabel}
          </span>
        )}
        {isUploaded && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "var(--brand, #1F4A2D)",
              fontWeight: 600,
            }}
          >
            ✓ gekozen
          </span>
        )}
      </div>

      {!isUploaded && (
        <label
          htmlFor={inputId}
          style={{
            display: "inline-block",
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: "1px solid var(--bl, #E0E0E0)",
            backgroundColor: "white",
            color: "var(--text, #1A1A1A)",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
            marginTop: 4,
          }}
        >
          Bestand kiezen
        </label>
      )}

      {isUploaded && file && (
        <>
          <div
            style={{
              fontSize: 13,
              color: "var(--text, #1A1A1A)",
              marginBottom: 4,
              wordBreak: "break-all",
            }}
          >
            {file.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--tl, #6B6B6B)",
              marginBottom: 10,
            }}
          >
            {Math.round(file.size / 1024)} KB
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label
              htmlFor={inputId}
              style={{
                fontSize: 12,
                color: "var(--brand, #1F4A2D)",
                cursor: disabled ? "not-allowed" : "pointer",
                textDecoration: "underline",
                userSelect: "none",
              }}
            >
              Vervangen
            </label>
            <button
              type="button"
              onClick={() => onFileChange(null)}
              disabled={disabled}
              style={{
                fontSize: 12,
                color: "var(--tl, #6B6B6B)",
                background: "none",
                border: "none",
                cursor: disabled ? "not-allowed" : "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Verwijderen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {multiline ? (
        <textarea
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 3}
          style={{ resize: "vertical", minHeight: 60 }}
        />
      ) : (
        <input
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div
      style={{
        display: multiline ? "block" : "flex",
        justifyContent: "space-between",
        gap: 8,
        padding: "4px 0",
      }}
    >
      <div style={{ color: "var(--tl, #6B6B6B)", fontWeight: 500 }}>{label}</div>
      <div
        style={{
          color: "var(--text, #1A1A1A)",
          textAlign: multiline ? "left" : "right",
          marginTop: multiline ? 2 : 0,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// <GooglePlaceMatchSection> — Filly's Google-match in stap 2
// ============================================================
//
// Drie states:
//   1. Filly heeft een match gevonden EN auto-bevestigd
//      → blauwe info-card met "Wijzig" + "Sla over"
//   2. Eigenaar heeft 'sla over' geklikt OF Filly vond niks
//      → grijze "geen koppeling"-card met "Zoek zelf"-knop
//   3. Eigenaar klikt op Wijzig/Zoek zelf
//      → expand inline-search: input + "Zoek"-knop + result-lijst
//
// Behaviour:
//   - Bij selectie van een result: place_id update + section collapsed
//   - Bij Sla over: place_id wordt null + match blijft in state (zodat
//     "Toch koppelen" mogelijk blijft als 'ie zich bedenkt)
//   - Submit (stap 3) stuurt ALLEEN google_place_id naar de backend.
//     Match-data is UI-only en wordt door de connect-call opnieuw
//     opgehaald (via Places API) — single source of truth.
// ============================================================
function GooglePlaceMatchSection({
  data,
  setData,
}: {
  data: WizardData;
  setData: React.Dispatch<React.SetStateAction<WizardData>>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      placeId: string;
      displayName: string;
      formattedAddress: string;
      rating: number | null;
      userRatingCount: number | null;
    }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Auto-fill zoek-veld met huidige restaurant-naam zodra de eigenaar
  // op Wijzigen klikt — bespaart hem typewerk in 80% van de gevallen.
  function openSearch() {
    setSearchQuery(`${data.name} ${data.city}`.trim());
    setSearchOpen(true);
  }

  async function runSearch() {
    if (searchQuery.trim().length < 3) return;
    setSearching(true);
    setSearchError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${API_URL}/onboarding/google-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ query: searchQuery }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const results = await res.json();
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Zoeken niet gelukt.",
      );
    } finally {
      setSearching(false);
    }
  }

  function selectPlace(place: (typeof searchResults)[number]) {
    setData((prev) => ({
      ...prev,
      google_place_id: place.placeId,
      google_place_match: place,
    }));
    setSearchOpen(false);
    setSearchResults([]);
  }

  function skipMatch() {
    setData((prev) => ({ ...prev, google_place_id: null }));
  }

  // Visuele staat: 'connected' = eigenaar heeft een match geselecteerd,
  // 'skipped' = eigenaar heeft overgeslagen of Filly vond niks.
  const isConnected = data.google_place_id && data.google_place_match;
  const match = data.google_place_match;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: 8,
        border: `1px solid ${
          isConnected ? "#1F4A2D40" : "var(--bl, #E0E0E0)"
        }`,
        backgroundColor: isConnected ? "#F0F7F2" : "#FAFAFA",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        <span aria-hidden>🔵</span>
        <span>Google Business Profile</span>
        {isConnected && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#1F4A2D",
              fontWeight: 500,
            }}
          >
            ✓ Filly heeft je profiel gevonden
          </span>
        )}
      </div>

      {isConnected && match && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {match.displayName}
          </div>
          <div
            style={{ fontSize: 13, color: "var(--tl, #6B6B6B)", marginTop: 2 }}
          >
            {match.formattedAddress}
          </div>
          {match.rating !== null && (
            <div
              style={{
                fontSize: 13,
                color: "var(--tl, #6B6B6B)",
                marginTop: 4,
              }}
            >
              ⭐ {match.rating.toFixed(1)}
              {match.userRatingCount !== null &&
                ` (${match.userRatingCount.toLocaleString("nl-NL")} reviews)`}
            </div>
          )}
        </div>
      )}

      {!isConnected && (
        <div
          style={{
            fontSize: 13,
            color: "var(--tl, #6B6B6B)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          {match
            ? "Je hebt de match overgeslagen. Je kunt later koppelen via de Google Business-pagina."
            : "Filly kon je profiel niet automatisch vinden. Je kunt zelf zoeken of overslaan en later koppelen."}
        </div>
      )}

      {/* Action-buttons: laten we plain <button> gebruiken voor
          consistentie met de rest van deze wizard (die gebruikt geen
          shared <Button>-component voor secundaire knoppen). */}
      {!searchOpen && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={openSearch}
                style={btnStyle(false)}
              >
                Wijzigen
              </button>
              <button
                type="button"
                onClick={skipMatch}
                style={btnStyle(false)}
              >
                Sla over
              </button>
            </>
          ) : (
            <button type="button" onClick={openSearch} style={btnStyle(true)}>
              {match ? "Toch koppelen" : "Zoek zelf"}
            </button>
          )}
        </div>
      )}

      {searchOpen && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Naam + stad, bv. 'De Kas Amsterdam'"
              style={{
                flex: 1,
                padding: "8px 10px",
                fontSize: 14,
                border: "1px solid var(--bl, #E0E0E0)",
                borderRadius: 6,
              }}
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || searchQuery.trim().length < 3}
              style={btnStyle(true)}
            >
              {searching ? "Zoeken…" : "Zoek"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchResults([]);
              }}
              style={btnStyle(false)}
            >
              Annuleer
            </button>
          </div>

          {searchError && (
            <div
              style={{
                fontSize: 13,
                color: "#B00020",
                marginBottom: 8,
              }}
            >
              {searchError}
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {searchResults.map((r) => (
                <button
                  key={r.placeId}
                  type="button"
                  onClick={() => selectPlace(r)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "1px solid var(--bl, #E0E0E0)",
                    borderRadius: 6,
                    backgroundColor: "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {r.displayName}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tl, #6B6B6B)",
                      marginTop: 2,
                    }}
                  >
                    {r.formattedAddress}
                    {r.rating !== null && (
                      <span style={{ marginLeft: 8 }}>
                        ⭐ {r.rating.toFixed(1)}
                        {r.userRatingCount !== null &&
                          ` (${r.userRatingCount})`}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchResults.length === 0 && !searching && !searchError && (
            <div
              style={{
                fontSize: 13,
                color: "var(--tl, #6B6B6B)",
                fontStyle: "italic",
              }}
            >
              Typ een zoekopdracht en klik Zoek.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Mini-helper om de inline knop-stijl niet 4× te dupliceren in
// de section hierboven. Primair = brand-groen, secundair = grijs.
function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    border: primary ? "none" : "1px solid var(--bl, #E0E0E0)",
    backgroundColor: primary ? "#1F4A2D" : "white",
    color: primary ? "white" : "var(--text, #1A1A1A)",
    cursor: "pointer",
  };
}

// Splitst een komma-gescheiden string in een array, trimmt en filtert
// lege. Gebruikt voor signature_dishes + cuisine_style die als text
// worden ingevoerd maar als text[] worden opgeslagen.
function splitToArray(s: string): string[] | undefined {
  const arr = s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return arr.length > 0 ? arr : undefined;
}

// Default export wrapt de inhoud in <Suspense> zodat useSearchParams()
// niet faalt tijdens Next.js's static prerender (build-tijd-fout sinds
// Next.js 14: "missing-suspense-with-csr-bailout"). Fallback is null —
// de page is sowieso volledig client-rendered, een spinner zou alleen
// een microseconde flikkering geven.
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageContent />
    </Suspense>
  );
}
