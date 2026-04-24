"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

// ============================================================
// /onboarding — 3-stappen wizard voor nieuwe restaurant
// ============================================================
// Flow:
//   Stap 1 (Basis): naam, type, stad + optionele website + menu-upload
//   Stap 2 (Karakter): omschrijving, toon (optioneel, overslaan kan)
//   Stap 3 (Klaar): bevestiging + "Ga naar dashboard"
//
// Alles op één pagina met state — minder file-overhead dan meerdere
// routes, en de wizard is lineair dus er is geen reden om de URL
// mee te sturen (geen deep-linking naar stap 2).
//
// Website-URL en menu-upload slaan we al op (datamodel staat), maar
// doen er fase A nog niks mee. Fase B voegt de AI-analyse toe, fase C
// de Vision-upload. De UI toont nu al de knoppen zodat we het skeleton
// hebben en de user alvast kan experimenteren.
// ============================================================

type Step = 1 | 2 | 3;

type WizardData = {
  name: string;
  type: string;
  address: string;
  postal_code: string;
  city: string;
  website_url: string;
  description: string;
  brand_tone: "casual" | "professional" | "playful";
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
  { value: "casual", label: "Gemoedelijk", hint: "Warm, toegankelijk, niet stoffig" },
  {
    value: "professional",
    label: "Professioneel",
    hint: "Zakelijk, strak, hogere prijsklasse",
  },
  { value: "playful", label: "Speels", hint: "Creatief, met knipoog, jonger publiek" },
];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<WizardData>({
    name: "",
    type: "",
    address: "",
    postal_code: "",
    city: "",
    website_url: "",
    description: "",
    brand_tone: "casual",
  });

  // Stap 1 is verplicht — naam + type moeten ingevuld zijn om door
  // te kunnen. Andere stappen zijn overslaan-baar.
  const canContinueFromStep1 =
    data.name.trim().length >= 2 && data.type.length > 0;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // We sturen de JWT zelf mee via authedFetch-pattern; deze pagina
      // leeft buiten de dashboard-context dus we doen het hier handmatig.
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
          website_url: data.website_url.trim() || undefined,
          description: data.description.trim() || undefined,
          brand_tone: data.brand_tone,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      // Parseer { restaurantId } zodat we 'm direct als actief restaurant
      // kunnen vastleggen in localStorage. Dit voorkomt een 403-race:
      // zonder dit stuurt authedFetch een oude stored restaurant-id mee
      // bij de eerste dashboard-renders, en krijg je bij elk endpoint
      // "Geen toegang tot dit restaurant."
      const { restaurantId } = (await res.json()) as { restaurantId: string };
      if (typeof window !== "undefined" && restaurantId) {
        try {
          window.localStorage.setItem(
            "getfilly.activeRestaurantId",
            restaurantId,
          );
        } catch {
          // localStorage kan in privé-modus falen — negeer stil.
        }
      }

      // Middleware stuurt nu geen /onboarding-bezoek meer terug naar
      // /onboarding (want we hebben nu een restaurant). Pushen naar
      // dashboard + refresh zodat de server-components de nieuwe
      // membership oppikken.
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Iets ging mis bij het opslaan. Probeer nog eens.",
      );
      setSubmitting(false);
    }
  };

  return (
    <section className="login-section">
      <div className="login-box" style={{ maxWidth: 520 }}>
        {/* Voortgang-indicator bovenaan — subtiele balk, niet te luid */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 24,
          }}
        >
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
          <Step1
            data={data}
            setData={setData}
            onNext={() => setStep(2)}
            canContinue={canContinueFromStep1}
          />
        )}

        {step === 2 && (
          <Step2
            data={data}
            setData={setData}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3
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
// Stap 1 — Basis
// ============================================================
function Step1({
  data,
  setData,
  onNext,
  canContinue,
}: {
  data: WizardData;
  setData: React.Dispatch<React.SetStateAction<WizardData>>;
  onNext: () => void;
  canContinue: boolean;
}) {
  return (
    <>
      <div className="login-title">Laten we je zaak instellen</div>
      <p className="login-sub">
        Een paar basisgegevens zodat Filly weet waar ze mee werkt.
      </p>

      <div className="form-group">
        <label className="form-label">Naam van de zaak</label>
        <input
          className="form-input"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          placeholder="Bistro Centraal"
          autoFocus
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Type zaak</label>
        <select
          className="form-input"
          value={data.type}
          onChange={(e) => setData({ ...data, type: e.target.value })}
          required
        >
          <option value="">Kies een type…</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Straat en huisnummer</label>
        <input
          className="form-input"
          value={data.address}
          onChange={(e) => setData({ ...data, address: e.target.value })}
          placeholder="Prinsengracht 263"
        />
      </div>

      {/* Postcode + stad als twee velden op één rij — compacter dan
          elk op een eigen rij, en past bij hoe mensen een adres
          mentaal groeperen. */}
      <div className="form-group">
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 120 }}>
            <label className="form-label">Postcode</label>
            <input
              className="form-input"
              value={data.postal_code}
              onChange={(e) =>
                setData({ ...data, postal_code: e.target.value })
              }
              placeholder="1016 GV"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Stad</label>
            <input
              className="form-input"
              value={data.city}
              onChange={(e) => setData({ ...data, city: e.target.value })}
              placeholder="Amsterdam"
            />
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          Website <span style={{ color: "var(--tl, #6B6B6B)" }}>(optioneel)</span>
        </label>
        <input
          className="form-input"
          type="url"
          value={data.website_url}
          onChange={(e) => setData({ ...data, website_url: e.target.value })}
          placeholder="https://jouwrestaurant.nl"
        />
        <p
          style={{
            fontSize: 12,
            color: "var(--tl, #6B6B6B)",
            margin: "6px 0 0",
          }}
        >
          Straks laat Filly je profiel automatisch invullen op basis van je site.
        </p>
      </div>

      <div
        style={{
          padding: "12px 14px",
          background: "var(--brand-soft, #eef3ee)",
          border: "1px dashed var(--brand, #1F4A2D)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--text, #1A1A1A)",
          marginBottom: 16,
        }}
      >
        <strong>📎 Menu-kaart uploaden</strong> komt er zo aan — daarmee leest
        Filly je gerechten automatisch in.
      </div>

      <button
        className="login-btn"
        onClick={onNext}
        disabled={!canContinue}
        type="button"
      >
        Volgende
      </button>
    </>
  );
}

// ============================================================
// Stap 2 — Karakter
// ============================================================
function Step2({
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
      <div className="login-title">Hoe voelt je zaak?</div>
      <p className="login-sub">
        Dit helpt Filly om in jouw stem te schrijven. Mag je overslaan.
      </p>

      <div className="form-group">
        <label className="form-label">Korte omschrijving</label>
        <textarea
          className="form-input"
          value={data.description}
          onChange={(e) => setData({ ...data, description: e.target.value })}
          placeholder="Klassieke Franse bistro in de Jordaan, nadruk op seizoensproducten en Bourgondische wijnen."
          rows={3}
          style={{ resize: "vertical", minHeight: 72 }}
        />
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

      <div style={{ display: "flex", gap: 8 }}>
        <button className="sg-btn" onClick={onBack} type="button">
          Terug
        </button>
        <button
          className="login-btn"
          onClick={onNext}
          type="button"
          style={{ flex: 1 }}
        >
          Volgende
        </button>
      </div>
    </>
  );
}

// ============================================================
// Stap 3 — Klaar
// ============================================================
function Step3({
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
        Dit hebben we ingevuld. Aanpassen kan altijd via je account.
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
        {data.description && (
          <Row label="Omschrijving" value={data.description} multiline />
        )}
        <Row
          label="Toon"
          value={
            TONE_OPTIONS.find((t) => t.value === data.brand_tone)?.label ?? ""
          }
        />
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
