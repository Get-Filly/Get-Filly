"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

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
  allergens?: string[];
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
  // Menu
  menu_items: MenuItem[];
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
  menu_items: [],
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [menuFile, setMenuFile] = useState<File | null>(null);

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
    if (!url && !menuFile) {
      setAnalyzeError(
        "Vul een website-URL in of upload een menukaart, anders heeft Filly niks om te lezen.",
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

      const [websiteResult, menuResult] = await Promise.all([
        websitePromise,
        menuPromise,
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
        }));
      }

      if (menuResult && Array.isArray(menuResult.items)) {
        setData((prev) => ({ ...prev, menu_items: menuResult.items }));
      }

      // Confidence: als beide bronnen een score gaven, toon de laagste
      // (dan weet user "het zwakste deel is X").
      const scores = [websiteResult?.confidence, menuResult?.confidence].filter(
        Boolean,
      );
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
          menu_items: data.menu_items,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      const { restaurantId } = (await res.json()) as { restaurantId: string };
      if (typeof window !== "undefined" && restaurantId) {
        try {
          window.localStorage.setItem(
            "getfilly.activeRestaurantId",
            restaurantId,
          );
        } catch {
          // negeer privé-modus
        }
      }

      router.push("/dashboard");
      router.refresh();
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

  return (
    <section className="login-section">
      <div className="login-box" style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
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

        {step === 1 && (
          <Step1Sources
            data={data}
            setData={setData}
            menuFile={menuFile}
            setMenuFile={setMenuFile}
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
        Geef Filly een website of menukaart — zij vult dan alvast je
        hele profiel in. Je kunt alles nog aanpassen in stap 2.
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

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 4,
          color: "var(--brand, #1F4A2D)",
        }}
      >
        ✨ Laat Filly de rest invullen
      </div>
      <p style={{ fontSize: 13, color: "var(--tl, #6B6B6B)", margin: "0 0 14px" }}>
        Geef één of beide — Filly gebruikt ze om je adres, verhaal,
        toon, specialiteiten en menu in te vullen.
      </p>

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

      <div className="form-group">
        <label className="form-label">Menukaart (foto of PDF)</label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setMenuFile(e.target.files?.[0] ?? null)}
          disabled={analyzing}
          style={{
            display: "block",
            fontSize: 13,
            color: "var(--text)",
          }}
        />
        {menuFile && (
          <p
            style={{
              fontSize: 12,
              color: "var(--tl, #6B6B6B)",
              margin: "4px 0 0",
            }}
          >
            {menuFile.name} · {Math.round(menuFile.size / 1024)} KB
          </p>
        )}
      </div>

      {(data.website_url.trim().length > 0 || menuFile) && (
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            background: analyzing
              ? "var(--brand-soft, #eef3ee)"
              : "var(--brand, #1F4A2D)",
            color: analyzing ? "var(--brand, #1F4A2D)" : "#fff",
            border: "none",
            fontSize: 14,
            fontWeight: 600,
            cursor: analyzing ? "default" : "pointer",
            marginTop: 4,
          }}
        >
          {analyzing
            ? analyzeStatus ?? "Filly is bezig…"
            : "✨ Filly, vul alles in"}
        </button>
      )}

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

      <div style={{ marginTop: 20 }}>
        <button
          className="login-btn"
          onClick={onNext}
          disabled={!canContinue || analyzing}
          type="button"
        >
          Volgende — review
        </button>
      </div>
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
