"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchRestaurant,
  updateRestaurant,
  analyzeRestaurantWebsite,
  type Restaurant,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

type SaveStatus = "idle" | "saving" | "success" | "error";

const restaurantTypes = [
  "bistro",
  "brasserie",
  "fine_dining",
  "trattoria",
  "café",
  "gastropub",
  "other",
];

const toneOptions: Restaurant["brand_tone"][] = [
  "casual",
  "professional",
  "playful",
];

// Multi-select chip-opties voor talen die het personeel spreekt.
// Komt in restaurants.languages_spoken (text[]). Filly gebruikt dit
// straks om buitenlandse gasten in hun eigen taal te kunnen begroeten.
const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "nl", label: "Nederlands" },
  { code: "en", label: "Engels" },
  { code: "de", label: "Duits" },
  { code: "fr", label: "Frans" },
  { code: "es", label: "Spaans" },
  { code: "it", label: "Italiaans" },
];

// Vaste volgorde van de week voor de openingstijden-editor. Sleutels
// matchen met wat in opening_hours-jsonb wordt opgeslagen + wat de
// backend RestaurantContextService verwacht voor het profile-block.
const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Maandag" },
  { key: "tue", label: "Dinsdag" },
  { key: "wed", label: "Woensdag" },
  { key: "thu", label: "Donderdag" },
  { key: "fri", label: "Vrijdag" },
  { key: "sat", label: "Zaterdag" },
  { key: "sun", label: "Zondag" },
];

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountPage() {
  const [form, setForm] = useState<Restaurant | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchRestaurant()
      .then(setForm)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="page-full">
        <div className="page-title">Account</div>
        <div style={{ color: "var(--red)" }}>Fout bij laden: {error}</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="page-full">
        <div className="page-title">Account</div>
        <div style={{ color: "var(--tl)" }}>Laden...</div>
      </div>
    );
  }

  const update = <K extends keyof Restaurant>(key: K, value: Restaurant[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaveStatus("idle");
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveMessage(null);
    try {
      const updated = await updateRestaurant(form);
      setForm(updated);
      setSaveStatus("success");
      setSaveMessage("Opgeslagen ✓");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage((e as Error).message);
    }
  };

  // Logo-upload via de restaurant-assets storage bucket. Direct van
  // client → Supabase Storage (RLS-policies staan dat toe sinds migratie
  // 0003). Na upload halen we de public URL op en slaan die direct in
  // de DB op zodat we 'm niet kwijtraken bij een verkeerde "Annuleer".
  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `logos/${form.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("restaurant-assets")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("restaurant-assets").getPublicUrl(path);

      const updated = await updateRestaurant({ logo_url: publicUrl });
      setForm(updated);
      setSaveMessage("Logo geüpload ✓");
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage(`Logo-upload mislukt: ${(e as Error).message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Website-analyse handmatig triggeren. Bevestigt eerst dat de eigenaar
  // weet dat z'n bestaande tagline/sfeer/USPs overschreven worden — Filly
  // schrijft alleen velden waar hij wat over vond, maar als je een
  // tagline al goed had vinden we belangrijk dat je 't expliciet wilt.
  const handleAnalyzeWebsite = async () => {
    if (!form.website_url || !form.website_url.trim()) {
      setSaveStatus("error");
      setSaveMessage(
        "Vul eerst een website-URL in en sla op voordat je laat analyseren.",
      );
      return;
    }
    const ok = window.confirm(
      `Filly leest je website (${form.website_url}) en vult automatisch ` +
        `tagline, sfeer, doelgroep, USPs, signature dishes en socials in.\n\n` +
        `Bestaande velden die nu al ingevuld zijn worden overschreven ` +
        `als Filly nieuwe info vindt. Doorgaan?`,
    );
    if (!ok) return;

    setAnalyzing(true);
    setSaveStatus("saving");
    setSaveMessage("Filly analyseert je website (kan 10-20 sec duren)…");
    try {
      const updated = await analyzeRestaurantWebsite();
      setForm(updated);
      setSaveStatus("success");
      setSaveMessage("Website geanalyseerd ✓ — bekijk en pas zo nodig aan.");
      setTimeout(() => setSaveStatus("idle"), 4000);
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage(`Website-analyse mislukt: ${(e as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Helpers voor de openingstijden-editor. opening_hours is jsonb in
  // DB met sleutels mon..sun. Lege/ontbrekende dag = "gesloten".
  const hoursFor = (key: string) => {
    return form.opening_hours?.[key] ?? null;
  };
  const setHoursFor = (
    key: string,
    next: { open: string; close: string } | null,
  ) => {
    const current = form.opening_hours ?? {};
    const newHours = { ...current };
    if (next === null) {
      delete newHours[key];
    } else {
      newHours[key] = next;
    }
    update(
      "opening_hours",
      Object.keys(newHours).length > 0 ? newHours : null,
    );
  };

  // Sluitingsdata-helpers. closed_dates is text[] (ISO YYYY-MM-DD).
  const addClosedDate = (iso: string) => {
    if (!iso) return;
    const set = new Set(form.closed_dates ?? []);
    set.add(iso);
    update(
      "closed_dates",
      Array.from(set).sort(),
    );
  };
  const removeClosedDate = (iso: string) => {
    update(
      "closed_dates",
      (form.closed_dates ?? []).filter((d) => d !== iso),
    );
  };

  // Talen-toggle (chip-stijl).
  const toggleLanguage = (code: string) => {
    const current = form.languages_spoken ?? [];
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    update("languages_spoken", next);
  };

  // Brand-color setter — schrijft naar brand_colors.{primary|secondary}.
  const setBrandColor = (key: "primary" | "secondary", value: string) => {
    const current = form.brand_colors ?? {};
    update("brand_colors", { ...current, [key]: value });
  };

  // Terras-zon-toggle (chip-stijl). Werkt alleen als has_terrace=true;
  // bij uitvinken van het terras wissen we ook deze waardes zodat we
  // geen rare residue-data houden van een terras dat niet meer bestaat.
  const toggleTerraceSun = (period: "morning" | "afternoon" | "evening") => {
    const current = form.terrace_sun_periods ?? [];
    const next = current.includes(period)
      ? current.filter((p) => p !== period)
      : [...current, period];
    update("terrace_sun_periods", next);
  };

  return (
    <div className="page-full">
      <div className="page-title">Account</div>
      <div className="page-subtitle">
        Jouw restaurant-profiel. Hoe uitgebreider je dit invult, hoe scherper
        Filly campagnes kan voorstellen en versturen.
      </div>

      {/* ============================================================
          Sectie 1 — Restaurant
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Restaurant</div>
        <div className="form-section-desc">
          De hoofdlijnen — type, keuken en prijsklasse.
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Naam</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Type</label>
            <select
              value={form.type ?? ""}
              onChange={(e) => update("type", e.target.value || null)}
            >
              <option value="">—</option>
              {restaurantTypes.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1).replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Keukenstijl</label>
            <input
              type="text"
              value={(form.cuisine_style ?? []).join(", ")}
              onChange={(e) =>
                update(
                  "cuisine_style",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="french, italian, dutch"
            />
            <div className="hint">Komma-gescheiden.</div>
          </div>
          <div className="form-field">
            <label>Prijsklasse</label>
            <select
              value={form.price_range ?? ""}
              onChange={(e) =>
                update(
                  "price_range",
                  e.target.value ? parseInt(e.target.value, 10) : null,
                )
              }
            >
              <option value="">—</option>
              <option value={1}>€</option>
              <option value={2}>€€</option>
              <option value={3}>€€€</option>
              <option value={4}>€€€€</option>
            </select>
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 2 — Identiteit (voor AI)
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Identiteit</div>
        <div className="form-section-desc">
          Wie ben je als restaurant? Filly leest dit voor toon, sfeer en
          doelgroep-aanpak.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Tagline (1 zin)</label>
            <input
              type="text"
              value={form.tagline ?? ""}
              onChange={(e) => update("tagline", e.target.value || null)}
              placeholder="Gezellige buurtbistro in hart van Amsterdam"
            />
          </div>
          <div className="form-field full">
            <label>Volledige beschrijving</label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value || null)}
              placeholder="Vertel uitgebreid over je restaurant — geschiedenis, filosofie, waar je trots op bent..."
              rows={4}
            />
          </div>
          <div className="form-field full">
            <label>Doelgroep</label>
            <textarea
              value={form.target_audience ?? ""}
              onChange={(e) => update("target_audience", e.target.value || null)}
              placeholder="Lokale bewoners, professionals op lunch, families in het weekend..."
              rows={2}
            />
          </div>
          <div className="form-field full">
            <label>Sfeer &amp; interieur</label>
            <textarea
              value={form.atmosphere ?? ""}
              onChange={(e) => update("atmosphere", e.target.value || null)}
              placeholder="Warm, intiem, houten interieur, zacht jazzmuziek..."
              rows={2}
            />
          </div>
          <div className="form-field full">
            <label>Unique selling points</label>
            <textarea
              value={form.unique_selling_points ?? ""}
              onChange={(e) =>
                update("unique_selling_points", e.target.value || null)
              }
              placeholder="Wat maakt jou anders? Bv: eigen kruidentuin, open keuken, wekelijks wisselend menu..."
              rows={2}
            />
          </div>
          <div className="form-field full">
            <label>Speciale gelegenheden &amp; events</label>
            <textarea
              value={form.special_events ?? ""}
              onChange={(e) => update("special_events", e.target.value || null)}
              placeholder="Verjaardagen, bedrijfslunches, trouwdiners, privéruimte tot X personen..."
              rows={2}
            />
          </div>
          <div className="form-field full">
            <label>Signature dishes</label>
            <input
              type="text"
              value={(form.signature_dishes ?? []).join(", ")}
              onChange={(e) =>
                update(
                  "signature_dishes",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Kalfsstoof, Zeebaars met lenteuitjes"
            />
            <div className="hint">
              Komma-gescheiden. Filly gebruikt deze in campagne-teksten.
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 3 — Website (Filly leest mee)
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Website — Filly leest mee</div>
        <div className="form-section-desc">
          Geef je website-URL en laat Filly hem analyseren. Hij haalt tone,
          positionering en aanbod op en gebruikt dat overal in campagnes.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Website URL</label>
            <input
              type="url"
              value={form.website_url ?? ""}
              onChange={(e) => update("website_url", e.target.value || null)}
              placeholder="https://jouwrestaurant.nl"
            />
          </div>
          <div className="form-field full">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn-primary-dash"
                onClick={handleAnalyzeWebsite}
                disabled={analyzing || !form.website_url}
                title={
                  !form.website_url
                    ? "Vul eerst een website-URL in en sla op."
                    : "Filly leest de website en vult tagline/sfeer/USPs in."
                }
              >
                {analyzing ? "Analyseren…" : "Analyseer website"}
              </button>
              <span style={{ fontSize: 12, color: "var(--tl)" }}>
                Laatste analyse: {formatDate(form.website_last_analyzed_at)}
              </span>
            </div>
          </div>
          <div className="form-field full">
            <label>Samenvatting (door Filly)</label>
            <textarea
              value={form.website_summary ?? ""}
              onChange={(e) => update("website_summary", e.target.value || null)}
              placeholder="Wordt automatisch gevuld na website-analyse. Je kunt daarna zelf aanpassen."
              rows={4}
            />
            <div className="hint">
              Deze samenvatting wordt onderdeel van de context die Filly bij
              iedere campagne meekrijgt.
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 4 — Locatie
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Locatie</div>
        <div className="form-section-desc">
          Wordt automatisch gegeocodeerd via PDOK zodra je opslaat. Nodig voor
          weer-integratie en lokale campagnes.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Adres</label>
            <input
              type="text"
              value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Hoofdstraat 12"
            />
          </div>
          <div className="form-field">
            <label>Plaats</label>
            <input
              type="text"
              value={form.city ?? ""}
              onChange={(e) => update("city", e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Postcode</label>
            <input
              type="text"
              value={form.postal_code ?? ""}
              onChange={(e) => update("postal_code", e.target.value)}
              placeholder="1012 AB"
            />
          </div>
          {form.latitude !== null && form.longitude !== null && (
            <div className="form-field full">
              <div className="hint">
                ✓ Coördinaten bekend: {form.latitude.toFixed(5)},{" "}
                {form.longitude.toFixed(5)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
          Sectie 5 — Openingstijden
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Openingstijden</div>
        <div className="form-section-desc">
          Filly gebruikt dit om geen mailings te plannen op gesloten dagen en
          om reserveringen-suggesties realistisch te maken.
        </div>
        <div className="form-grid">
          {WEEKDAYS.map((d) => {
            const h = hoursFor(d.key);
            const closed = !h;
            return (
              <div
                key={d.key}
                className="form-field full"
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <label style={{ marginBottom: 0 }}>{d.label}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label className="form-checkbox" style={{ marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={!closed}
                      onChange={(e) =>
                        setHoursFor(
                          d.key,
                          e.target.checked
                            ? { open: "11:00", close: "23:00" }
                            : null,
                        )
                      }
                    />
                    Open
                  </label>
                  {!closed && (
                    <>
                      <input
                        type="time"
                        value={h?.open ?? ""}
                        onChange={(e) =>
                          setHoursFor(d.key, {
                            open: e.target.value,
                            close: h?.close ?? "23:00",
                          })
                        }
                        style={{ width: 110 }}
                      />
                      <span style={{ color: "var(--tl)" }}>tot</span>
                      <input
                        type="time"
                        value={h?.close ?? ""}
                        onChange={(e) =>
                          setHoursFor(d.key, {
                            open: h?.open ?? "11:00",
                            close: e.target.value,
                          })
                        }
                        style={{ width: 110 }}
                      />
                    </>
                  )}
                  {closed && (
                    <span style={{ color: "var(--tl)", fontSize: 13 }}>
                      Gesloten
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          Sectie 6 — Sluitingsdata / vakanties
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Sluitingsdata &amp; vakanties</div>
        <div className="form-section-desc">
          Specifieke dagen waarop de zaak dicht is (vakanties, feestdagen).
          Filly mijdt deze voor mailings en reservering-suggesties.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Voeg een datum toe</label>
            <input
              type="date"
              onChange={(e) => {
                if (e.target.value) {
                  addClosedDate(e.target.value);
                  e.target.value = "";
                }
              }}
              style={{ maxWidth: 220 }}
            />
          </div>
          {(form.closed_dates ?? []).length > 0 ? (
            <div className="form-field full">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {(form.closed_dates ?? []).map((d) => (
                  <div
                    key={d}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px 4px 12px",
                      background: "var(--bg, #FAF7F1)",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 999,
                      fontSize: 13,
                    }}
                  >
                    <span>
                      {new Date(d).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <button
                      onClick={() => removeClosedDate(d)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--red, #DC2626)",
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        padding: "2px 4px",
                      }}
                      aria-label="Verwijder deze datum"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="form-field full">
              <div className="hint">
                Geen sluitingsdata. Voeg er bv. één toe voor 1e Kerstdag of
                jouw vaste vakantieweek.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
          Sectie 7 — Capaciteit
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Capaciteit</div>
        <div className="form-section-desc">
          Bezettings-percentages worden hierop gebaseerd.
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Stoelen binnen</label>
            <input
              type="number"
              value={form.capacity_seats ?? ""}
              onChange={(e) =>
                update(
                  "capacity_seats",
                  e.target.value ? parseInt(e.target.value, 10) : null,
                )
              }
            />
          </div>
          <div className="form-field">
            <label>Stoelen op terras</label>
            <input
              type="number"
              value={form.capacity_terrace ?? ""}
              onChange={(e) =>
                update(
                  "capacity_terrace",
                  e.target.value ? parseInt(e.target.value, 10) : null,
                )
              }
            />
          </div>
          <div className="form-field full">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={form.has_terrace}
                onChange={(e) => {
                  update("has_terrace", e.target.checked);
                  // Terras uit → ook zon-data en terras-type wissen
                  // zodat we geen rare residue-data houden van een
                  // terras dat niet meer bestaat.
                  if (!e.target.checked) {
                    update("terrace_sun_periods", null);
                    update("terrace_type", null);
                  }
                }}
              />
              Heeft een terras
            </label>
          </div>
          {form.has_terrace && (
            <>
              <div className="form-field full">
                <label>Wanneer schijnt de zon op het terras?</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(
                    [
                      { code: "morning", label: "Ochtend" },
                      { code: "afternoon", label: "Middag" },
                      { code: "evening", label: "Avond" },
                    ] as const
                  ).map((p) => {
                    const active = (form.terrace_sun_periods ?? []).includes(
                      p.code,
                    );
                    return (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => toggleTerraceSun(p.code)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid var(--accent, #1F4A2D)"
                            : "1px solid var(--border, #E5DFD0)",
                          background: active
                            ? "var(--accent, #1F4A2D)"
                            : "transparent",
                          color: active ? "white" : "var(--ts)",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="hint">
                  Klik aan/uit. Filly gebruikt dit voor zonnige-dag-acties op
                  je terras.
                </div>
              </div>

              <div className="form-field full">
                <label>Soort terras</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(
                    [
                      {
                        code: "open",
                        label: "Open",
                        hint: "Geen overkapping",
                      },
                      {
                        code: "covered",
                        label: "Overdekt",
                        hint: "Luifel of dak",
                      },
                      {
                        code: "convertible",
                        label: "Overdekbaar",
                        hint: "Schuifwanden, regen-luifel",
                      },
                    ] as const
                  ).map((t) => {
                    const active = form.terrace_type === t.code;
                    return (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => update("terrace_type", t.code)}
                        title={t.hint}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid var(--accent, #1F4A2D)"
                            : "1px solid var(--border, #E5DFD0)",
                          background: active
                            ? "var(--accent, #1F4A2D)"
                            : "transparent",
                          color: active ? "white" : "var(--ts)",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="hint">
                  Bepaalt of Filly bij regen toch een terras-actie kan
                  voorstellen (overdekt/overdekbaar) of alleen bij droog
                  weer (open).
                </div>
              </div>
            </>
          )}
          <div className="form-field full">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={form.has_private_room}
                onChange={(e) => update("has_private_room", e.target.checked)}
              />
              Heeft een privé-/evenementenruimte
            </label>
          </div>
          <div className="form-field full">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={form.has_kids_menu}
                onChange={(e) => update("has_kids_menu", e.target.checked)}
              />
              Heeft een kindermenu
            </label>
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 8 — Talen
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Talen die je personeel spreekt</div>
        <div className="form-section-desc">
          Klik om aan/uit te zetten. Wordt door Filly meegewogen bij meertalige
          campagnes.
        </div>
        <div className="form-field full">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {LANGUAGE_OPTIONS.map((l) => {
              const active = (form.languages_spoken ?? []).includes(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => toggleLanguage(l.code)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: active
                      ? "1px solid var(--accent, #1F4A2D)"
                      : "1px solid var(--border, #E5DFD0)",
                    background: active
                      ? "var(--accent, #1F4A2D)"
                      : "transparent",
                    color: active ? "white" : "var(--ts)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 9 — Branding (logo, kleuren, toon)
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Branding</div>
        <div className="form-section-desc">
          Logo en huiskleuren voor in mail-templates en campagne-grafiek.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Logo</label>
            <div
              style={{ display: "flex", alignItems: "center", gap: 16 }}
            >
              {form.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={form.logo_url}
                  alt="Logo"
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "contain",
                    borderRadius: 8,
                    border: "1px solid var(--border, #E5DFD0)",
                    background: "var(--bg, #FAF7F1)",
                    padding: 6,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    border: "1px dashed var(--border, #E5DFD0)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--tl)",
                    fontSize: 11,
                    textAlign: "center",
                    padding: 4,
                  }}
                >
                  Geen logo
                </div>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleLogoUpload(f);
                }}
                disabled={uploadingLogo}
              />
            </div>
            <div className="hint">
              {uploadingLogo
                ? "Uploaden…"
                : "PNG, JPG, WebP of SVG. Bij voorkeur transparante achtergrond."}
            </div>
          </div>

          <div className="form-field">
            <label>Primaire kleur</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="color"
                value={form.brand_colors?.primary ?? "#1F4A2D"}
                onChange={(e) => setBrandColor("primary", e.target.value)}
                style={{
                  width: 48,
                  height: 36,
                  padding: 2,
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={form.brand_colors?.primary ?? ""}
                onChange={(e) => setBrandColor("primary", e.target.value)}
                placeholder="#1F4A2D"
                style={{ flex: 1, fontFamily: "monospace" }}
              />
            </div>
          </div>

          <div className="form-field">
            <label>Secundaire kleur</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="color"
                value={form.brand_colors?.secondary ?? "#FAF7F1"}
                onChange={(e) => setBrandColor("secondary", e.target.value)}
                style={{
                  width: 48,
                  height: 36,
                  padding: 2,
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={form.brand_colors?.secondary ?? ""}
                onChange={(e) => setBrandColor("secondary", e.target.value)}
                placeholder="#FAF7F1"
                style={{ flex: 1, fontFamily: "monospace" }}
              />
            </div>
          </div>

          <div className="form-field full">
            <label>Tone of voice</label>
            <select
              value={form.brand_tone}
              onChange={(e) =>
                update("brand_tone", e.target.value as Restaurant["brand_tone"])
              }
            >
              {toneOptions.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <div className="hint">
              Bepaalt hoe Filly schrijft in mailings, social posts en
              review-antwoorden.
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 10 — Social media
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Social media</div>
        <div className="form-section-desc">
          Vul je handles in. Filly verwerkt deze in social-campagnes en mail-
          footers.
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Instagram</label>
            <input
              type="text"
              value={form.social_media?.instagram ?? ""}
              onChange={(e) =>
                update("social_media", {
                  ...(form.social_media ?? {}),
                  instagram: e.target.value,
                })
              }
              placeholder="@restaurantnaam"
            />
          </div>
          <div className="form-field">
            <label>Facebook</label>
            <input
              type="text"
              value={form.social_media?.facebook ?? ""}
              onChange={(e) =>
                update("social_media", {
                  ...(form.social_media ?? {}),
                  facebook: e.target.value,
                })
              }
              placeholder="restaurantnaam"
            />
          </div>
          <div className="form-field">
            <label>TikTok</label>
            <input
              type="text"
              value={form.social_media?.tiktok ?? ""}
              onChange={(e) =>
                update("social_media", {
                  ...(form.social_media ?? {}),
                  tiktok: e.target.value,
                })
              }
              placeholder="@restaurantnaam"
            />
          </div>
          <div className="form-field">
            <label>LinkedIn</label>
            <input
              type="text"
              value={form.social_media?.linkedin ?? ""}
              onChange={(e) =>
                update("social_media", {
                  ...(form.social_media ?? {}),
                  linkedin: e.target.value,
                })
              }
              placeholder="restaurant-naam"
            />
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 11 — Bedrijfsgegevens (P0 voor mailings + legal)
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Bedrijfsgegevens</div>
        <div className="form-section-desc">
          Voor mail-footers (verplicht volgens AVG/CAN-SPAM), je privacy-
          verklaring en algemene voorwaarden.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Volledige bedrijfsnaam (juridisch)</label>
            <input
              type="text"
              value={form.legal_name ?? ""}
              onChange={(e) => update("legal_name", e.target.value || null)}
              placeholder="Bistro Get-Filly B.V."
            />
            <div className="hint">
              Zoals geregistreerd bij de KvK. Verschijnt in de footer van
              mailings.
            </div>
          </div>
          <div className="form-field">
            <label>KvK-nummer</label>
            <input
              type="text"
              value={form.kvk_number ?? ""}
              onChange={(e) => update("kvk_number", e.target.value || null)}
              placeholder="12345678"
            />
            <div className="hint">8 cijfers.</div>
          </div>
          <div className="form-field">
            <label>BTW-nummer</label>
            <input
              type="text"
              value={form.vat_number ?? ""}
              onChange={(e) => update("vat_number", e.target.value || null)}
              placeholder="NL123456789B01"
            />
            <div className="hint">Formaat: NL + 9 cijfers + B + 2 cijfers.</div>
          </div>
          <div className="form-field">
            <label>Contact-e-mail</label>
            <input
              type="email"
              value={form.contact_email ?? ""}
              onChange={(e) => update("contact_email", e.target.value || null)}
              placeholder="info@jouwrestaurant.nl"
            />
            <div className="hint">Het officiële klantcontactadres.</div>
          </div>
          <div className="form-field">
            <label>Contact-telefoon</label>
            <input
              type="tel"
              value={form.contact_phone ?? ""}
              onChange={(e) => update("contact_phone", e.target.value || null)}
              placeholder="020-1234567 of +31201234567"
            />
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 12 — E-mailinstellingen (mailings)
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">E-mailinstellingen voor mailings</div>
        <div className="form-section-desc">
          Bepaalt hoe campagne-mails er voor de ontvanger uitzien.
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Afzender-naam</label>
            <input
              type="text"
              value={form.email_from_name ?? ""}
              onChange={(e) =>
                update("email_from_name", e.target.value || null)
              }
              placeholder="Bistro Get-Filly"
            />
            <div className="hint">
              Verschijnt in de inbox van de ontvanger als &quot;van&quot;.
            </div>
          </div>
          <div className="form-field">
            <label>Reply-to adres</label>
            <input
              type="email"
              value={form.email_reply_to ?? ""}
              onChange={(e) => update("email_reply_to", e.target.value || null)}
              placeholder="reservaties@jouwrestaurant.nl"
            />
            <div className="hint">
              Waar antwoorden van ontvangers naartoe komen. Mag hetzelfde zijn
              als contact-e-mail.
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          Sectie 13 — Menukaart (link naar dedicated pagina)
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Menukaart</div>
        <div className="form-section-desc">
          Beheer alle gerechten + de menukaart-upload op de menu-pagina.
        </div>
        <div className="form-field full">
          <Link
            href="/dashboard/menu"
            className="btn-secondary-dash"
            style={{ display: "inline-block" }}
          >
            🍽️ Open menu-pagina →
          </Link>
        </div>
      </div>

      {/* ============================================================
          Sectie 14 — Abonnement
          ============================================================ */}
      <div className="form-section">
        <div className="form-section-title">Abonnement</div>
        <div className="form-section-desc">
          Plan en facturering. Facturering komt in een latere stap.
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Huidig plan</label>
            <input type="text" value={form.plan} disabled />
          </div>
        </div>
      </div>

      {/* ============================================================
          Globale save-bar onderaan
          ============================================================ */}
      <div className="save-bar">
        <div
          className={`save-status ${
            saveStatus === "success"
              ? "success"
              : saveStatus === "error"
                ? "error"
                : ""
          }`}
        >
          {saveMessage ?? ""}
        </div>
        <button
          className="btn-primary-dash"
          onClick={handleSave}
          disabled={saveStatus === "saving"}
        >
          {saveStatus === "saving" ? "Opslaan..." : "Wijzigingen opslaan"}
        </button>
      </div>
    </div>
  );
}
