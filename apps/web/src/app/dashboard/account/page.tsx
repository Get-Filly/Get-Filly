"use client";

import { useEffect, useState } from "react";
import {
  fetchRestaurant,
  updateRestaurant,
  type Restaurant,
} from "../../../lib/api";

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

export default function AccountPage() {
  const [form, setForm] = useState<Restaurant | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page-full">
      <div className="page-title">Account</div>
      <div className="page-subtitle">
        Jouw restaurant-profiel. Hoe beter je dit invult, hoe scherper Filly
        campagnes kan voorstellen.
      </div>

      {/* Sectie 1 — Restaurant-info */}
      <div className="form-section">
        <div className="form-section-title">Restaurant</div>
        <div className="form-section-desc">
          Basisinfo die Filly gebruikt voor alle campagne-teksten.
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
            <div className="hint">Komma-gescheiden, bv. &quot;french, dutch&quot;</div>
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
          <div className="form-field full">
            <label>Beschrijving</label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Wij zijn een gezellige buurtbistro met focus op seizoensgerechten..."
            />
            <div className="hint">
              2-3 zinnen die jouw restaurant typeren — Filly leest dit voor tone en sfeer.
            </div>
          </div>
        </div>
      </div>

      {/* Sectie 2 — Locatie */}
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

      {/* Sectie 3 — Capaciteit */}
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

      {/* Sectie 4 — Branding */}
      <div className="form-section">
        <div className="form-section-title">Branding &amp; tone</div>
        <div className="form-section-desc">
          Hoe Filly moet klinken in campagnes.
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
            <label>Website</label>
            <input
              type="url"
              value={form.website_url ?? ""}
              onChange={(e) => update("website_url", e.target.value || null)}
              placeholder="https://..."
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

      {/* Sectie 5 — Abonnement */}
      <div className="form-section">
        <div className="form-section-title">Abonnement</div>
        <div className="form-section-desc">
          Plan, facturering en teamtoegang — facturering komt in een latere stap.
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
