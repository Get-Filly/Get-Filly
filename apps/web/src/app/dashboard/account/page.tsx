"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  fetchRestaurant,
  updateRestaurant,
  downloadRestaurantExport,
  deleteAccount,
  type Restaurant,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { OnboardingChecklist } from "../_components/onboarding-checklist";
import { MailDomainSection } from "../_components/mail-domain-section";
import { RestaurantMediaSection } from "../_components/restaurant-media-section";
import { ConnectionsSection } from "../_components/account-connections";
import { MetaPublishPanel } from "../_components/meta-publish-panel";
import { GoogleConnectedPanel } from "../_components/google-connected-panel";
import { Button } from "../../../components/ui/button";
import { ButtonLink } from "../../../components/ui/button-link";
import { PageHeader } from "../../../components/ui/page-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { Input } from "../../../components/ui/input";
import { ServicePeriodsEditor } from "../../../components/service-periods-editor";

type SaveStatus = "idle" | "saving" | "success" | "error";

// Sub-tabs binnen account/Profiel (Floris-redesign 2026-05-12).
// 3 tabs: Algemeen / Identiteit / Koppelingen. URL-gedreven via
// `?tab=identiteit` zodat refresh stabiel is en de tab deelbaar.
// Per 2026-05-21: "identiteit" verwijderd uit AccountTab. Alle
// identiteit-velden (tagline, beschrijving, doelgroep, sfeer,
// USPs, foto-bibliotheek, branding, website, social handles) zijn
// verhuisd naar /dashboard/vindbaarheid/identiteit waar ze
// inhoudelijk thuishoren — Filly's posts baseren zich erop.
type AccountTab = "algemeen" | "koppelingen";

const restaurantTypes = [
  "bistro",
  "brasserie",
  "fine_dining",
  "trattoria",
  "café",
  "gastropub",
  "other",
];

// Event-categorieën zoals de evenementen-sync ze kent (events-tabel,
// mig 0053/0054). De eigenaar vinkt aan welke typen Filly meeneemt
// in voorstellen; volgorde = volgorde van de checkboxes.
const EVENT_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "festivals", label: "Festivals" },
  { value: "concerten_theater", label: "Concerten & theater" },
  { value: "events", label: "Events" },
  { value: "sportevenementen", label: "Sportevenementen" },
  { value: "kermis", label: "Kermis" },
  { value: "markten", label: "Markten" },
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

// Next.js 15+: elke client-component die `useSearchParams()` gebruikt
// moet in een <Suspense>-boundary staan, anders weigert de production-
// build te prerenderen (CSR-bailout-error). Vandaar de splitsing:
// `AccountPageInner` houdt alle hooks + UI; de exported `AccountPage`
// wikkelt 'm in Suspense zodat de prerender-fase een fallback krijgt.
function AccountPageInner() {
  const [form, setForm] = useState<Restaurant | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Account-delete-modal-state. Modal verschijnt pas als gebruiker
  // expliciet op de rode knop klikt; "VERWIJDER"-bevestiging staat
  // aan client-zijde EN backend-zijde, defense in depth.
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ============================================================
  // Sub-tabs binnen account/Profiel (Floris-redesign 2026-05-12)
  // ============================================================
  // 2 tabs: Algemeen / Koppelingen. Identiteit-tab is per 2026-05-21
  // verhuisd naar /dashboard/vindbaarheid/identiteit; ?tab=identiteit
  // valt nu terug op Algemeen (oude bookmarks blijven werken zonder
  // 404, eigenaar ziet wel z'n algemene gegevens en kan via sidebar
  // naar Vindbaarheid > Identiteit voor de Filly-content).
  // BELANGRIJK: hooks moeten vóór de early returns (loading/error)
  // anders verspringt de hook-volgorde tussen renders.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: AccountTab =
    tabParam === "koppelingen" ? "koppelingen" : "algemeen";
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);
  // URL bijwerken zonder full reload bij tab-wissel.
  const switchTab = (next: AccountTab) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "algemeen") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `/dashboard/account?${qs}` : "/dashboard/account");
  };

  useEffect(() => {
    fetchRestaurant()
      .then(setForm)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="page-full">
        <PageHeader title="Account" />
        <EmptyState
          topGap
          icon="⚙️"
          title="Account-gegevens niet geladen"
          description="We konden je profiel niet ophalen. Probeer de pagina te herladen, als het probleem blijft, log dan opnieuw in."
        />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="page-full">
        <PageHeader title="Account" />
        <div style={{ color: "var(--color-text-disabled)" }}>Laden...</div>
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
      <PageHeader title="Account" />

      {/* Sub-tab-balk: Algemeen / Identiteit / Koppelingen.
          Direct onder PageHeader zodat eigenaar eerst kiest wáár
          'ie is, daarna pas de content ziet. OnboardingChecklist
          verhuist naar binnen de Algemeen-tab. */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: "var(--space-5)",
          borderBottom: "1px solid var(--border, #E5DFD0)",
        }}
      >
        {(
          [
            { key: "algemeen", label: "Algemeen" },
            { key: "koppelingen", label: "Koppelingen" },
          ] as Array<{ key: AccountTab; label: string }>
        ).map(({ key, label }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              style={{
                padding: "10px 16px",
                border: "none",
                background: "transparent",
                borderBottom: active
                  ? "2px solid var(--brand, #1F4A2D)"
                  : "2px solid transparent",
                color: active ? "var(--brand, #1F4A2D)" : "var(--tl)",
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ============================================================
          Per sectie staat hieronder een `{activeTab === "..." && ...}`
          wrapper. Algemeen / Identiteit / Koppelingen verdelen de
          secties als volgt (zie comments per sectie):
          - Algemeen: 1, 4, 6, 7, 7b, 8, 11, 12b, 14, 15
          - Identiteit: 1c, 2, 3, 9, 10, 13
          - Koppelingen: 1b (mail-domein) + 12 (mail-afzender) + alle
            externe integraties (Reserveringen, Google Business,
            Social, Reviews, Data)
          ============================================================ */}

      {/* OnboardingChecklist: zit binnen Algemeen-tab. De checklist
          verwijst meestal naar items in deze tab; op Identiteit /
          Koppelingen voegt 'ie alleen ruis toe. */}
      {activeTab === "algemeen" && <OnboardingChecklist />}

      {/* ============================================================
          Sectie 1, Restaurant — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Restaurant</div>
        <div className="form-section-desc">
          De hoofdlijnen, type, keuken en prijsklasse.
        </div>

        {/* Eigenaar met meerdere zaken (vestigingen, 2e concept) kan
            hier een nieuwe zaak aanmaken. Hergebruikt de onboarding-
            wizard met ?mode=add, backend laat sinds 2026-05-01
            meerdere restaurant_users-rijen per user toe. Wisselen tussen
            zaken na aanmaken kan via het account-menu linksboven
            (workspace-dropdown). */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            marginBottom: 16,
            background: "var(--brand-soft, #EDF2EE)",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--text, #1a1a1a)" }}>
            <strong>Meerdere ondernemingen?</strong> Voeg een tweede vestiging
            of nieuw concept toe, je kunt tussen ze wisselen via het
            account-menu linksboven.
          </div>
          <ButtonLink
            href="/onboarding?mode=add"
            variant="secondary"
            size="sm"
          >
            + Nieuwe onderneming
          </ButtonLink>
        </div>

        <div className="form-grid">
          <Input
            label="Naam"
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
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
          <Input
            label="Keukenstijl"
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
            hint="Komma-gescheiden."
          />
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
      )}

      {/* ============================================================
          Sectie 1b, Mail-instellingen — KOPPELINGEN
          ============================================================
          Eigen module met eigen state-management, bewust niet in het
          form-state-blok van deze pagina. */}
      {activeTab === "koppelingen" && (
        // id = anker voor de "Beheer"-link op de E-mail-rij in ConnectionsSection.
        <div id="mail-domein">
          <MailDomainSection />
        </div>
      )}

      {/* Foto-bibliotheek + Identiteit-velden (tagline, beschrijving,
          doelgroep, sfeer, USPs, special_events, signature_dishes) zijn
          per 2026-05-21 verhuisd naar /dashboard/vindbaarheid/identiteit
          (Basics-tab voor foto-bibliotheek, Basics + Toon voor de velden). */}
      {/* Sectie 'Identiteit' verhuisd naar /dashboard/vindbaarheid/identiteit (2026-05-21). */}

      {/* Sectie 'Website + Filly-analyse' verhuisd naar /dashboard/vindbaarheid/identiteit (2026-05-21). */}

      {/* ============================================================
          Sectie 4, Locatie — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Locatie</div>
        <div className="form-section-desc">
          Wordt automatisch gegeocodeerd via PDOK zodra je opslaat. Nodig voor
          weer-integratie en lokale campagnes.
        </div>
        <div className="form-grid">
          <Input
            full
            label="Adres"
            type="text"
            value={form.address ?? ""}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Hoofdstraat 12"
          />
          <Input
            label="Plaats"
            type="text"
            value={form.city ?? ""}
            onChange={(e) => update("city", e.target.value)}
          />
          <Input
            label="Postcode"
            type="text"
            value={form.postal_code ?? ""}
            onChange={(e) => update("postal_code", e.target.value)}
            placeholder="1012 AB"
          />
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
      )}

      {/* Sectie 5 (Openingstijden) verwijderd 2026-05-12: vervangen door
          sectie 7b (Service-tijden). */}

      {/* ============================================================
          Sectie 6, Sluitingsdata — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Sluitingsdata &amp; vakanties</div>
        <div className="form-section-desc">
          Specifieke dagen waarop de onderneming dicht is (vakanties, feestdagen).
          Filly mijdt deze voor mailings en reservering-suggesties.
        </div>
        <div className="form-grid">
          <Input
            full
            label="Voeg een datum toe"
            type="date"
            onChange={(e) => {
              if (e.target.value) {
                addClosedDate(e.target.value);
                e.target.value = "";
              }
            }}
            style={{ maxWidth: 220 }}
          />
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
      )}

      {/* ============================================================
          Sectie 7, Capaciteit — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Capaciteit</div>
        <div className="form-section-desc">
          Bezettings-percentages worden hierop gebaseerd.
        </div>
        <div className="form-grid">
          <Input
            label="Stoelen binnen"
            type="number"
            value={form.capacity_seats ?? ""}
            onChange={(e) =>
              update(
                "capacity_seats",
                e.target.value ? parseInt(e.target.value, 10) : null,
              )
            }
          />
          <Input
            label="Stoelen op terras"
            type="number"
            value={form.capacity_terrace ?? ""}
            onChange={(e) =>
              update(
                "capacity_terrace",
                e.target.value ? parseInt(e.target.value, 10) : null,
              )
            }
          />
          {/* ----- Doel voor doordeweekse bezetting -----
              Optioneel veld. Lege waarde = Filly berekent het uit
              6-maanden-historie (zie KpiService cascade). */}
          <Input
            full
            label="Doel doordeweekse bezetting (%)"
            type="number"
            min={0}
            max={100}
            placeholder="bv. 75"
            value={form.target_weekday_occupancy_pct ?? ""}
            onChange={(e) =>
              update(
                "target_weekday_occupancy_pct",
                e.target.value ? parseInt(e.target.value, 10) : null,
              )
            }
            hint="Optioneel doel voor de bezetting-KPI op je dashboard. Laat leeg om Filly's berekening uit je 6-maanden-historie te gebruiken (of de standaard 68% als je nog geen historie hebt opgebouwd)."
          />
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
      )}

      {/* ============================================================
          Sectie 7b, Service-tijden — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Service-tijden</div>
        <div className="form-section-desc">
          Per dag aangeven wanneer je ontbijt, lunch en diner serveert.
          Eén of meerdere shifts, jij bepaalt. Dashboard gebruikt deze
          tijden voor de week- en dag-bezetting per service.
        </div>
        <div className="form-field full">
          <ServicePeriodsEditor
            value={form.service_periods}
            onChange={(next) => update("service_periods", next)}
          />
        </div>
      </div>
      )}

      {/* ============================================================
          Sectie 8, Talen — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
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
      )}

      {/* Sectie 'Branding' verhuisd naar /dashboard/vindbaarheid/identiteit (2026-05-21). */}

      {/* Sectie 'Social media' verhuisd naar /dashboard/vindbaarheid/identiteit (2026-05-21). */}

      {/* ============================================================
          Sectie 11, Bedrijfsgegevens — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Bedrijfsgegevens</div>
        <div className="form-section-desc">
          Voor mail-footers (verplicht volgens AVG/CAN-SPAM), je privacy-
          verklaring en algemene voorwaarden.
        </div>
        <div className="form-grid">
          <Input
            full
            label="Volledige bedrijfsnaam (juridisch)"
            type="text"
            value={form.legal_name ?? ""}
            onChange={(e) => update("legal_name", e.target.value || null)}
            placeholder="Bistro Get-Filly B.V."
            hint="Zoals geregistreerd bij de KvK. Verschijnt in de footer van mailings."
          />
          <Input
            label="KvK-nummer"
            type="text"
            value={form.kvk_number ?? ""}
            onChange={(e) => update("kvk_number", e.target.value || null)}
            placeholder="12345678"
            hint="8 cijfers."
          />
          <Input
            label="BTW-nummer"
            type="text"
            value={form.vat_number ?? ""}
            onChange={(e) => update("vat_number", e.target.value || null)}
            placeholder="NL123456789B01"
            hint="Formaat: NL + 9 cijfers + B + 2 cijfers."
          />
          <Input
            label="Contact-e-mail"
            type="email"
            value={form.contact_email ?? ""}
            onChange={(e) => update("contact_email", e.target.value || null)}
            placeholder="info@jouwrestaurant.nl"
            hint="Het officiële klantcontactadres."
          />
          <Input
            label="Contact-telefoon"
            type="tel"
            value={form.contact_phone ?? ""}
            onChange={(e) => update("contact_phone", e.target.value || null)}
            placeholder="020-1234567 of +31201234567"
          />
        </div>
      </div>
      )}

      {/* ============================================================
          Sectie 12, E-mailinstellingen — KOPPELINGEN
          ============================================================ */}
      {activeTab === "koppelingen" && (
      <div className="form-section">
        <div className="form-section-title">E-mailinstellingen voor mailings</div>
        <div className="form-section-desc">
          Bepaalt hoe campagne-mails er voor de ontvanger uitzien.
        </div>
        <div className="form-grid">
          <Input
            label="Afzender-naam"
            type="text"
            value={form.email_from_name ?? ""}
            onChange={(e) =>
              update("email_from_name", e.target.value || null)
            }
            placeholder="Bistro Get-Filly"
            hint="Verschijnt in de inbox van de ontvanger als &ldquo;van&rdquo;."
          />
          <Input
            label="Reply-to adres"
            type="email"
            value={form.email_reply_to ?? ""}
            onChange={(e) =>
              update("email_reply_to", e.target.value || null)
            }
            placeholder="reservaties@jouwrestaurant.nl"
            hint="Waar antwoorden van ontvangers naartoe komen. Mag hetzelfde zijn als contact-e-mail."
          />
        </div>
      </div>
      )}

      {/* ============================================================
          Sectie 12b, Meldingen — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Meldingen</div>
        <div className="form-section-desc">
          Bepaal wanneer reviews en rustige dagen als actie verschijnen
          op je campagnes-pagina.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="low-review-threshold">
              Reviews onder of gelijk aan deze sterren-rating tonen als actie
            </label>
            <select
              id="low-review-threshold"
              value={form.low_review_threshold ?? 3}
              onChange={(e) =>
                update(
                  "low_review_threshold",
                  parseInt(e.target.value, 10),
                )
              }
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
                fontSize: 14,
                background: "var(--white, #FFFFFF)",
                color: "var(--text, #18181B)",
                width: "100%",
                maxWidth: 280,
              }}
            >
              <option value={1}>★☆☆☆☆ – Alleen 1-ster reviews</option>
              <option value={2}>★★☆☆☆ – 1 en 2 sterren</option>
              <option value={3}>★★★☆☆ – 1 t/m 3 sterren</option>
              <option value={4}>★★★★☆ – 1 t/m 4 sterren</option>
              <option value={5}>★★★★★ – Alle reviews</option>
            </select>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--tl)",
                lineHeight: 1.4,
              }}
            >
              Reviews die nog geen reactie hebben en onder deze drempel
              vallen, verschijnen automatisch in &ldquo;Overige
              acties&rdquo;. Standaard is 3 sterren, zodat alleen echte
              problemen je aandacht vragen.
            </div>
          </div>

          <div className="form-field full">
            <label htmlFor="low-occupancy-threshold">
              Bezetting onder deze drempel telt als rustige dag
            </label>
            <select
              id="low-occupancy-threshold"
              value={form.low_occupancy_threshold ?? 50}
              onChange={(e) =>
                update(
                  "low_occupancy_threshold",
                  parseInt(e.target.value, 10),
                )
              }
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
                fontSize: 14,
                background: "var(--white, #FFFFFF)",
                color: "var(--text, #18181B)",
                width: "100%",
                maxWidth: 280,
              }}
            >
              <option value={20}>Onder 20%</option>
              <option value={30}>Onder 30%</option>
              <option value={40}>Onder 40%</option>
              <option value={50}>Onder 50%</option>
              <option value={60}>Onder 60%</option>
              <option value={70}>Onder 70%</option>
              <option value={80}>Onder 80%</option>
              <option value={90}>Onder 90%</option>
            </select>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--tl)",
                lineHeight: 1.4,
              }}
            >
              Filly scant de komende 14 dagen op rustige dagen en zet ze
              in &ldquo;Overige acties&rdquo;. Zodra de bezetting van een
              dag de drempel haalt (bv. door nieuwe reserveringen),
              verdwijnt 'ie automatisch uit het lijstje. Sluitingsdagen
              worden niet getoond.
            </div>
          </div>

          {/* ----- Evenementen in voorstellen (mig 0054) ----- */}
          <div className="form-field full">
            <label>Evenementen uit de buurt in Filly&apos;s voorstellen</label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 4,
              }}
            >
              {EVENT_CATEGORY_OPTIONS.map((opt) => {
                // null = alle categorieën aan (default); een lege array
                // betekent dat de eigenaar events helemaal uitzette.
                const enabled =
                  form.event_categories ??
                  EVENT_CATEGORY_OPTIONS.map((o) => o.value);
                const checked = enabled.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      cursor: "pointer",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      // Chip-label nooit laten afbreken ("Concerten &
                      // theater" werd anders twee regels en de rij
                      // stond scheef).
                      whiteSpace: "nowrap",
                      marginBottom: 0,
                      background: checked
                        ? "var(--white, #FFFFFF)"
                        : "transparent",
                      opacity: checked ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        update(
                          "event_categories",
                          checked
                            ? enabled.filter((v) => v !== opt.value)
                            : [...enabled, opt.value],
                        )
                      }
                    />
                    {opt.label}
                  </label>
                );
              })}
              {/* Jaarlijkse feestdagen: aparte boolean-voorkeur
                  (event_holidays_enabled, mig 0055), niet onderdeel van
                  de evenementen.nl-categorieën, maar hoort hier qua UX
                  thuis ("wat neemt Filly mee in voorstellen"). */}
              {(() => {
                const checked = form.event_holidays_enabled ?? true;
                return (
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      cursor: "pointer",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      whiteSpace: "nowrap",
                      marginBottom: 0,
                      background: checked
                        ? "var(--white, #FFFFFF)"
                        : "transparent",
                      opacity: checked ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        update("event_holidays_enabled", !checked)
                      }
                    />
                    Jaarlijkse feestdagen
                  </label>
                );
              })()}
            </div>
            <div style={{ marginTop: 14 }}>
              {/* Label expliciet als blok bóven de select, zoals bij de
                  andere velden in deze kaart (stond anders ernaast en
                  viel half weg achter de dropdown). */}
              <label
                htmlFor="event-max-distance"
                style={{ display: "block", marginBottom: 6 }}
              >
                Maximale afstand vanaf de zaak
              </label>
              <select
                id="event-max-distance"
                value={form.event_max_distance_km ?? ""}
                onChange={(e) =>
                  update(
                    "event_max_distance_km",
                    e.target.value === ""
                      ? null
                      : parseInt(e.target.value, 10),
                  )
                }
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  fontSize: 14,
                  background: "var(--white, #FFFFFF)",
                  color: "var(--text, #18181B)",
                  width: "100%",
                  maxWidth: 280,
                }}
              >
                <option value="">Slim per type (standaard)</option>
                <option value={2}>Tot 2 km</option>
                <option value={5}>Tot 5 km</option>
                <option value={10}>Tot 10 km</option>
                <option value={15}>Tot 15 km</option>
                <option value={25}>Tot 25 km</option>
              </select>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--tl)",
                lineHeight: 1.4,
              }}
            >
              Filly weegt evenementen in de buurt (bron: evenementen.nl)
              en jaarlijkse feestdagen (Valentijn, Pasen, Koningsdag,
              Kerst&hellip;) mee in campagne-voorstellen en timing. Vink
              uit wat niet bij je zaak past. De maximale afstand geldt
              alleen voor evenementen uit de buurt, niet voor feestdagen.
              &ldquo;Slim per type&rdquo; betekent: markt en kermis tot
              2 km, concert en sport tot 5 km, festival tot 10 km. Een
              vaste afstand geldt voor alle typen &mdash; ruimer is handig
              in landelijk gebied, krapper in de binnenstad.
            </div>
          </div>

          {/* ----- Auto-reageren op reviews (mig 0051) ----- */}
          <div
            className="form-field full"
            style={{
              borderTop: "1px solid var(--border, #E5DFD0)",
              paddingTop: 18,
              marginTop: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <label
                htmlFor="reviews-auto-reply"
                style={{ marginBottom: 0, cursor: "pointer" }}
              >
                Filly reageert automatisch op reviews
              </label>
              {/* Slider-toggle. role=switch + aria-checked voor
                  toegankelijkheid; klik schakelt de boolean om. */}
              <button
                id="reviews-auto-reply"
                type="button"
                role="switch"
                aria-checked={form.reviews_auto_reply_enabled ?? false}
                onClick={() =>
                  update(
                    "reviews_auto_reply_enabled",
                    !(form.reviews_auto_reply_enabled ?? false),
                  )
                }
                style={{
                  flexShrink: 0,
                  width: 44,
                  height: 24,
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  background: form.reviews_auto_reply_enabled
                    ? "var(--color-brand, #1F4A2D)"
                    : "var(--border, #E5DFD0)",
                  transition: "background 150ms ease",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    transform: form.reviews_auto_reply_enabled
                      ? "translateX(20px)"
                      : "translateX(0)",
                    transition: "transform 150ms ease",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--tl)",
                lineHeight: 1.4,
              }}
            >
              Bij nieuwe reviews onder je drempel schrijft Filly
              automatisch een reactie in jouw toon. Je houdt de controle:
              de reactie wordt als concept klaargezet zodat je 'm met één
              klik kunt goedkeuren.
            </div>
          </div>

          {/* Mode + tone alleen tonen als auto-reageren aanstaat. */}
          {form.reviews_auto_reply_enabled && (
            <>
              <div className="form-field full">
                <label htmlFor="reviews-auto-reply-mode">
                  Hoe plaatst Filly de reactie?
                </label>
                <select
                  id="reviews-auto-reply-mode"
                  value={form.reviews_auto_reply_mode ?? "concept"}
                  onChange={(e) =>
                    update(
                      "reviews_auto_reply_mode",
                      e.target.value as "concept" | "publish",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border, #E5DFD0)",
                    borderRadius: 6,
                    fontSize: 14,
                    background: "var(--white, #FFFFFF)",
                    color: "var(--text, #18181B)",
                    width: "100%",
                    maxWidth: 360,
                  }}
                >
                  <option value="concept">
                    Concept klaarzetten ter goedkeuring (aanbevolen)
                  </option>
                  {/* 'publish' is nog niet bruikbaar: automatisch
                      plaatsen vereist de Google Business Profile-koppeling
                      (komt in een latere fase). Disabled tot dan. */}
                  <option value="publish" disabled>
                    Zelf plaatsen — beschikbaar zodra Google gekoppeld is
                  </option>
                </select>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "var(--tl)",
                    lineHeight: 1.4,
                  }}
                >
                  Zolang Google nog niet gekoppeld is, zet Filly reacties
                  altijd als concept klaar. Automatisch plaatsen komt
                  beschikbaar zodra de Google-koppeling live is.
                </div>
              </div>

              <div className="form-field full">
                <label htmlFor="reviews-tone">
                  Toon voor reviews-reacties
                </label>
                <textarea
                  id="reviews-tone"
                  value={form.reviews_tone_of_voice ?? ""}
                  onChange={(e) =>
                    update("reviews_tone_of_voice", e.target.value)
                  }
                  rows={3}
                  placeholder="Bijv. warm en persoonlijk, bedank altijd bij naam, blijf rustig en oplossingsgericht bij kritiek."
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border, #E5DFD0)",
                    borderRadius: 6,
                    fontSize: 14,
                    background: "var(--white, #FFFFFF)",
                    color: "var(--text, #18181B)",
                    width: "100%",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "var(--tl)",
                    lineHeight: 1.4,
                  }}
                >
                  Laat leeg om de algemene merkstem te gebruiken die je bij
                  Vindbaarheid &rsaquo; Identiteit hebt ingesteld. Vul hier
                  iets in als je voor reviews een andere toon wilt.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Sectie 'Menukaart' verhuisd naar /dashboard/vindbaarheid/identiteit (2026-05-21). */}

      {/* ============================================================
          Sectie 14, Abonnement — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Abonnement</div>
        <div className="form-section-desc">
          Plan en facturering. Facturering komt in een latere stap.
        </div>
        <div className="form-grid">
          <Input label="Huidig plan" type="text" value={form.plan} disabled />
        </div>
      </div>
      )}

      {/* ============================================================
          Sectie 15, Data & privacy — ALGEMEEN
          ============================================================ */}
      {activeTab === "algemeen" && (
      <div className="form-section">
        <div className="form-section-title">Data &amp; privacy</div>
        <div className="form-section-desc">
          Volgens de AVG (art. 20) heb je recht op een complete export
          van je business-data in een leesbaar formaat.
        </div>
        <div className="form-field full">
          <Button
            variant="secondary"
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadRestaurantExport();
                setSaveMessage("Export gedownload ✓");
                setSaveStatus("success");
                setTimeout(() => setSaveStatus("idle"), 2500);
              } catch (e) {
                setSaveStatus("error");
                setSaveMessage(
                  e instanceof Error
                    ? e.message
                    : "Export mislukt. Probeer opnieuw.",
                );
              } finally {
                setExporting(false);
              }
            }}
          >
            ⬇️ Download volledige data-export (JSON)
          </Button>
          <div className="hint" style={{ marginTop: 8 }}>
            Bevat: profielgegevens, gasten, reserveringen, menu,
            campagnes, reviews, chat-history en audit-log. Logo&apos;s en
            menu-PDF&apos;s staan als URL in het bestand, die kun je
            apart downloaden.
          </div>
        </div>

        {/* AVG art. 17, recht op vergetelheid. Bewust onder de export-
            knop zodat een gebruiker eerst zijn data kan downloaden
            voordat hij alles weggooit. */}
        <div
          className="form-field full"
          style={{
            marginTop: 24,
            paddingTop: 24,
            borderTop: "1px solid #f0e6d6",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: "#7a2222",
              marginBottom: 6,
              fontSize: 14,
            }}
          >
            Account permanent verwijderen
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>
            Wist je restaurant + alle gasten, reserveringen, menu, campagnes
            en chat-history. Daarna verdwijnt ook je inlog-account. Deze
            actie is onomkeerbaar, download eerst je data-export
            hierboven als je iets wilt bewaren.
          </div>
          <Button
            variant="danger"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
          >
            🗑 Account permanent verwijderen
          </Button>
        </div>
      </div>
      )}

      {/* ============================================================
          KOPPELINGEN-TAB: integraties als cards per categorie
          ============================================================ */}
      {activeTab === "koppelingen" && (
        <>
          <ConnectionsSection />
          <MetaPublishPanel />
          <GoogleConnectedPanel />
        </>
      )}

      {/* ============================================================
          Modal: account-delete-bevestiging
          ============================================================
          Bewust een full-screen overlay zodat de gebruiker echt even
          moet pauzeren. "VERWIJDER" intypen voorkomt accidentele
          double-clicks of muscle-memory-bevestiging. */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 20, 20, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setShowDeleteModal(false);
            }
          }}
        >
          <div
            style={{
              background: "#fdf9f0",
              borderRadius: 12,
              padding: 28,
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#7a2222",
                marginBottom: 12,
              }}
            >
              Weet je het zeker?
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#3a3a3a",
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              Je staat op het punt om <strong>je hele account</strong> te
              verwijderen. Dit betekent:
            </div>
            <ul
              style={{
                fontSize: 13,
                color: "#3a3a3a",
                marginBottom: 18,
                lineHeight: 1.6,
                paddingLeft: 20,
              }}
            >
              <li>Je restaurant + alle profielgegevens worden gewist</li>
              <li>Alle gasten, reserveringen, menu en campagnes verdwijnen</li>
              <li>Reviews, chat-history en audit-log worden verwijderd</li>
              <li>Je inlog-account (e-mail + wachtwoord) wordt gewist</li>
              <li>
                Anonieme leerdata (cuisine + regio + campagne-resultaten,
                géén namen of adressen) blijft bewaard om Filly te trainen,
                conform AVG Recital 26.
              </li>
            </ul>
            <div
              style={{
                fontSize: 13,
                color: "#3a3a3a",
                marginBottom: 8,
              }}
            >
              Type <strong>VERWIJDER</strong> om door te gaan:
            </div>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              disabled={deleting}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid #d8c8a8",
                borderRadius: 6,
                marginBottom: 12,
                background: "#fff",
              }}
              placeholder="VERWIJDER"
            />
            {deleteError && (
              <div
                style={{
                  fontSize: 13,
                  color: "#a22",
                  marginBottom: 12,
                  background: "#fde7e7",
                  padding: 10,
                  borderRadius: 6,
                }}
              >
                {deleteError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <Button
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Annuleren
              </Button>
              <Button
                variant="danger"
                disabled={deleteConfirm !== "VERWIJDER"}
                loading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError(null);
                  try {
                    await deleteAccount(deleteConfirm);
                    // Lokale Supabase-sessie opruimen zodat het JWT niet
                    // achterblijft in localStorage.
                    await supabase.auth.signOut();
                    router.push("/account-verwijderd");
                  } catch (e) {
                    setDeleteError(
                      e instanceof Error
                        ? e.message
                        : "Verwijderen mislukt, probeer opnieuw of neem contact op met support.",
                    );
                    setDeleting(false);
                  }
                }}
              >
                Ja, verwijder mijn account
              </Button>
            </div>
          </div>
        </div>
      )}

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
        {/* Migrated naar <Button> design-system component (2026-04-30),
            vervangt de oude .btn-primary-dash inline-styled knop. Loading-
            state wordt nu nette spinner i.p.v. tekst-flicker tussen
            "Opslaan..." en "Wijzigingen opslaan". */}
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saveStatus === "saving"}
        >
          Wijzigingen opslaan
        </Button>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageInner />
    </Suspense>
  );
}
