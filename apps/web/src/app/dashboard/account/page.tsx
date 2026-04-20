"use client";

import { useEffect, useState } from "react";
import {
  fetchRestaurant,
  updateRestaurant,
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
  const [uploading, setUploading] = useState(false);

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

  const handleMenuUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `menus/${form.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("restaurant-assets")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("restaurant-assets").getPublicUrl(path);

      // Direct ook opslaan in DB zodat het meteen bewaard blijft
      const updated = await updateRestaurant({ menu_document_url: publicUrl });
      setForm(updated);
      setSaveMessage("Menu geüpload ✓");
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage(`Upload mislukt: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page-full">
      <div className="page-title">Account</div>
      <div className="page-subtitle">
        Jouw restaurant-profiel. Hoe uitgebreider je dit invult, hoe scherper
        Filly campagnes kan voorstellen.
      </div>

      {/* Sectie 1 — Basisinfo */}
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

      {/* Sectie 2 — Identiteit (voor AI) */}
      <div className="form-section">
        <div className="form-section-title">Identiteit</div>
        <div className="form-section-desc">
          Wie ben je als restaurant? Filly leest dit voor tone, sfeer en
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
            <div className="hint">Komma-gescheiden. Filly gebruikt deze in campagne-teksten.</div>
          </div>
        </div>
      </div>

      {/* Sectie 3 — Website & AI */}
      <div className="form-section">
        <div className="form-section-title">Website — Filly leest mee</div>
        <div className="form-section-desc">
          Geef je website-URL en laat Filly hem analyseren. Hij haalt tone of
          voice, positionering en aanbod op, en gebruikt dat in campagnes.
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
                disabled
                title="Komt beschikbaar zodra de Claude API gekoppeld is"
              >
                Analyseer website
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

      {/* Sectie 4 — Menu upload */}
      <div className="form-section">
        <div className="form-section-title">Menukaart</div>
        <div className="form-section-desc">
          Upload je huidige menu (PDF of afbeelding). Filly leest dit om
          concrete campagnes te schrijven (bv. &quot;asperges &amp; lamsrack voor
          €24,50&quot;).
        </div>
        {form.menu_document_url ? (
          <div style={{ marginBottom: 12 }}>
            <a
              href={form.menu_document_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", fontSize: 13 }}
            >
              📄 Huidig menu bekijken
            </a>
          </div>
        ) : (
          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--tl)" }}>
            Nog geen menu geüpload.
          </div>
        )}
        <div className="form-field">
          <input
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleMenuUpload(file);
            }}
            disabled={uploading}
          />
          <div className="hint">
            {uploading ? "Uploaden..." : "Max 10 MB. PDF, PNG of JPG."}
          </div>
        </div>
      </div>

      {/* Sectie 5 — Locatie */}
      <div className="form-section">
        <div className="form-section-title">Locatie</div>
        <div className="form-section-desc">
          Nodig voor weer-integratie en lokale campagnes.
        </div>
        <div className="form-grid">
          <div className="form-field full">
            <label>Adres</label>
            <input
              type="text"
              value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value)}
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
            />
          </div>
        </div>
      </div>

      {/* Sectie 6 — Capaciteit */}
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
                onChange={(e) => update("has_terrace", e.target.checked)}
              />
              Heeft een terras
            </label>
          </div>
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

      {/* Sectie 7 — Branding & social */}
      <div className="form-section">
        <div className="form-section-title">Branding &amp; social</div>
        <div className="form-section-desc">
          Hoe Filly moet klinken en waar hij op mag posten.
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Tone</label>
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
          </div>
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
        </div>
      </div>

      {/* Sectie 8 — Abonnement */}
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

      <div className="save-bar">
        <div className={`save-status ${saveStatus === "success" ? "success" : saveStatus === "error" ? "error" : ""}`}>
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
